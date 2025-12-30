import { create } from 'zustand';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, query, where, orderBy, doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { normalizeName } from '../utils/text';

const useAnalystStore = create((set, get) => ({
    analystInvoices: [],
    payoutRequests: [],
    loading: false,
    error: null,

    // KPI Helper Getters (computed)
    getStats: () => {
        const invoices = get().analystInvoices;
        const totalCases = invoices.length;
        // Prompt: "Monto Histórico" = suma totalAPagarAnalista
        const totalAmount = invoices.reduce((acc, curr) => acc + (Number(curr.totalAPagarAnalista) || 0), 0);

        // "Ready for Cashout": > 40 days AND estadoPago != 'PAGO'
        const today = new Date();
        const readyInvoices = invoices.filter(inv => {
            // Prompt: estadoPago (ej "IMPAGO" / "PAGO")
            // "IMPAGO" is strict? Prompt says "estadoPago !== 'PAGO'". logic: "Disponible Pago" = ... estadoPago !== 'PAGO'
            if (inv.estadoPago === 'PAGO') return false;

            // Allow cashout if it's NOT paid, BUT we also have logic for "IMPAGO" specifically in previous task.
            // Prompt says: "criterio actual: diasDesdeEmision > 40 AND estadoPago !== 'PAGO'"
            // So we strictly follow "not PAGO".

            if (inv.linkedPayoutRequestId) return false;

            // Prompt: fecha (string dd/mm/yyyy)
            if (!inv.fecha) return false;
            const parts = inv.fecha.split('/'); // dd/mm/yyyy
            // Handle if date is d/m/yyyy or dd/mm/yyyy
            if (parts.length !== 3) return false;
            const [d, m, y] = parts;
            const issueObj = new Date(y, m - 1, d);
            const diffTime = Math.abs(today - issueObj);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            return diffDays >= 40;
        });

        const readyCount = readyInvoices.length;
        const readyAmount = readyInvoices.reduce((acc, curr) => acc + (Number(curr.totalAPagarAnalista) || 0), 0);

        return { totalCases, totalAmount, readyCount, readyAmount, readyInvoices };
    },

    fetchAnalystData: async (uid, analystKey) => {
        if (!uid) return;
        set({ loading: true, error: null });
        console.log(`[Store] Fetching for UID: ${uid}, Key: ${analystKey}`);

        // Normalize identifying key
        const me = normalizeName(analystKey);
        if (!me) {
            console.warn("[Store] No valid analystKey to fetch.");
            set({ analystInvoices: [], loading: false });
            return;
        }

        try {
            const results = new Map(); // Use Map to dedupe by ID

            // Query A: Legacy 'analista'
            const qLegacy = query(collection(db, 'invoices'), where('analista', '==', analystKey)); // Try exact match first (case-sensitive DB)
            // Note: Firestore is case sensitive. If DB has "Rodrigo" and key is "Rodrigo", it works.
            // If DB has "rodrigo", it fails.
            // We assume the stored analystKey matches the DB casing usually (from Admin dropdown).
            // But prompt says "Filtro defensivo... robusto a mayúsculas".
            // Since we can't do case-insensitive WHERE in Firestore without a separate index field,
            // we rely on the primary query matching. If the Admin selected "Rodrigo" from a list, it should match.
            // If manual entry, we might miss it.
            // Improvement: If we suspect casing mismatch, we could try querying by 'analista' == analystKey AND 'analyst' == analystKey.
            // But for now, we follow instructions: "Query primaria... invoices where analista == profile.analystKey"

            const snapLegacy = await getDocs(qLegacy);
            snapLegacy.forEach(doc => results.set(doc.id, { ...doc.data(), id: doc.id }));

            // Query B: Future 'analyst'
            const qFuture = query(collection(db, 'invoices'), where('analyst', '==', analystKey));
            try {
                const snapFuture = await getDocs(qFuture);
                snapFuture.forEach(doc => results.set(doc.id, { ...doc.data(), id: doc.id }));
            } catch (e) {
                // Ignore missing field errors implies query B might be empty or invalid if index missing?
                // Actually simple equality queries don't need composite indexes.
            }

            // Convert to array
            let allDocs = Array.from(results.values());

            // 3. Client-side Safe Filtering (Normalization)
            // Filter defensive: keep only if normalized(doc.analista) === me
            allDocs = allDocs.filter(doc => {
                const docName = normalizeName(doc.analista || doc.analyst);
                return docName === me;
            });

            console.log(`[Store] Invoices found for ${analystKey} (normalized: ${me}): ${allDocs.length}`);
            if (import.meta.env.DEV && allDocs.length > 0) {
                console.log("Sample Invoice:", allDocs[0]);
            }

            // 2. Fetch Payout Requests
            const requestsRef = collection(db, 'payoutRequests');
            const qReq = query(requestsRef, where('analystUid', '==', uid), orderBy('createdAt', 'desc'));
            const reqSnap = await getDocs(qReq);
            const requests = reqSnap.docs.map(d => ({ ...d.data(), id: d.id }));

            set({ analystInvoices: allDocs, payoutRequests: requests, loading: false });
        } catch (err) {
            console.error("Error fetching analyst data:", err);
            set({ error: err.message, loading: false });
        }
    },

    createPayoutRequest: async (uid, analystName, selectedInvoices, requiresInvoice) => {
        // selectedInvoices: Array of full invoice objects
        if (!uid || selectedInvoices.length === 0) return;

        set({ loading: true });
        try {
            const totalAmount = selectedInvoices.reduce((sum, inv) => sum + (Number(inv.totalToLiquidate) || 0), 0);
            const invoiceIds = selectedInvoices.map(i => i.id);

            // 1. Create Request Doc
            const requestData = {
                analystUid: uid,
                analystName: analystName,
                createdAt: serverTimestamp(), // Use server timestamp
                status: 'SUBMITTED', // Initial status
                invoiceIds: invoiceIds,
                totalAmount: totalAmount,
                invoiceCRequired: requiresInvoice,
                // Invoice C fields empty initially
                invoiceCUrl: null,
                invoiceCStoragePath: null
            };

            const reqRef = await addDoc(collection(db, 'payoutRequests'), requestData);
            const requestId = reqRef.id;

            // 2. Update Analyst Invoices (Mirror) with linkedPayoutRequestId and status 'EN_SOLICITUD'
            // We do this in parallel or batch
            const { writeBatch } = await import('firebase/firestore');
            const batch = writeBatch(db);

            invoiceIds.forEach(invId => {
                const invRef = doc(db, `analyst_invoices/${uid}/items`, invId);
                batch.update(invRef, {
                    paymentStatus: 'EN_SOLICITUD',
                    linkedPayoutRequestId: requestId
                });
            });

            await batch.commit();

            // Refresh local state (optimistic or refetch)
            // Ideally refetch to ensure consistency
            await get().fetchAnalystData(uid);

            return { success: true };
        } catch (err) {
            console.error("Error creating payout request:", err);
            set({ loading: false, error: "Error creando solicitud" });
            return { success: false, error: err.message };
        }
    }
}));

export default useAnalystStore;
