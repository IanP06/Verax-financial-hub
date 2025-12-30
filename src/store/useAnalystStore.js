import { create } from 'zustand';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, query, where, orderBy, doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { normalizeName } from '../utils/text';
import { getAnalystTotal } from '../utils/money';

const useAnalystStore = create((set, get) => ({
    analystInvoices: [],
    payoutRequests: [],
    loading: false,
    error: null,

    requestsError: null, // New state for index errors

    // KPI Helper Getters (computed)
    getStats: () => {
        const invoices = get().analystInvoices;
        const totalCases = invoices.length;
        // Prompt: "Monto Histórico" = suma totalAPagarAnalista
        // We use getAnalystTotal for consistency now? Or strictly totalAPagarAnalista as before?
        // User asked to fix "solicitud de pago". Let's stick to getAnalystTotal for safety everywhere if possible, 
        // but prompt said specifically "Request Payout". Let's update stats to be safe too? 
        // The prompt says "Monto Histórico $280.000 ya está sumando totalAPagarAnalista... la data está". 
        // So existing stats logic is likely fine or "good enough" for now, but I'll leave it unless it breaks.
        // Actually, for safety, let's just leave stats alone as they were reported "reading well invoices... but table empty". 
        // Wait, table was empty, KPI was correct. So KPI logic is effectively correct.
        const totalAmount = invoices.reduce((acc, curr) => acc + (Number(curr.totalAPagarAnalista) || 0), 0);

        // "Ready for Cashout": > 40 days AND estadoPago != 'PAGO'
        const today = new Date();
        const readyInvoices = invoices.filter(inv => {
            if (inv.estadoPago === 'PAGO') return false;
            if (inv.linkedPayoutRequestId) return false;

            if (!inv.fecha) return false;
            const parts = inv.fecha.split('/'); // dd/mm/yyyy
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

    // INTERNAL: Fetch Invoices
    fetchInvoicesForAnalyst: async (analystKey) => {
        console.log(`[Store] Fetching Invoices for Key: ${analystKey}`);
        const me = normalizeName(analystKey);

        const results = new Map(); // Use Map to dedupe by ID

        // Query A: Legacy 'analista'
        const qLegacy = query(collection(db, 'invoices'), where('analista', '==', analystKey));
        const snapLegacy = await getDocs(qLegacy);
        snapLegacy.forEach(doc => results.set(doc.id, { ...doc.data(), id: doc.id }));

        // Query B: Future 'analyst'
        const qFuture = query(collection(db, 'invoices'), where('analyst', '==', analystKey));
        try {
            const snapFuture = await getDocs(qFuture);
            snapFuture.forEach(doc => results.set(doc.id, { ...doc.data(), id: doc.id }));
        } catch (e) {
            // Ignore
        }

        // Convert to array
        let allDocs = Array.from(results.values());

        // 3. Client-side Safe Filtering (Normalization)
        allDocs = allDocs.filter(doc => {
            const docName = normalizeName(doc.analista || doc.analyst);
            return docName === me;
        });

        console.log(`[Store] Invoices In-Memory: ${allDocs.length}`);
        set({ analystInvoices: allDocs });
    },

    // INTERNAL: Fetch Requests (Can fail due to index)
    fetchPayoutRequestsForAnalyst: async (uid) => {
        console.log(`[Store] Fetching PayoutRequests for UID: ${uid}`);
        try {
            set({ requestsError: null });
            const requestsRef = collection(db, 'payoutRequests');
            const qReq = query(requestsRef, where('analystUid', '==', uid), orderBy('createdAt', 'desc'));
            const reqSnap = await getDocs(qReq);
            const requests = reqSnap.docs.map(d => ({ ...d.data(), id: d.id }));
            set({ payoutRequests: requests });
        } catch (err) {
            console.warn("[Store] PayoutRequests fetch failed (likely index issue):", err);
            // If failed-precondition, it means missing index.
            if (err.code === 'failed-precondition' || err.message.includes('index')) {
                set({ requestsError: 'missing-index', payoutRequests: [] });
            } else {
                set({ requestsError: 'generic', payoutRequests: [] });
            }
        }
    },

    fetchAnalystData: async (uid, analystKey) => {
        if (!uid || !analystKey) {
            console.warn("[Store] Skipping fetchAnalystData (missing uid or key)");
            return;
        }

        set({ loading: true, error: null });

        try {
            // Run independently. Invoices are critical. Requests are secondary.
            await get().fetchInvoicesForAnalyst(analystKey);
            await get().fetchPayoutRequestsForAnalyst(uid);

            set({ loading: false });
        } catch (err) {
            console.error("Critical Error fetching analyst data:", err);
            set({ error: err.message, loading: false });
        }
    },

    createPayoutRequest: async (uid, analystName, selectedInvoices, requiresInvoice) => {
        // selectedInvoices: Array of full invoice objects
        if (!uid || selectedInvoices.length === 0) return;

        set({ loading: true });
        try {
            // Debug Logs
            console.group("createPayoutRequest Debug");
            const totalAmount = selectedInvoices.reduce((sum, inv) => {
                const itemTotal = getAnalystTotal(inv);
                console.log(`Invoice ${inv.id} (${inv.nroFactura || inv.factura}): Raw=${JSON.stringify({
                    totalAPagarAnalista: inv.totalAPagarAnalista,
                    totalALiquidar: inv.totalALiquidar,
                    montoGestion: inv.montoGestion
                })} -> Parsed=${itemTotal}`);
                return sum + itemTotal;
            }, 0);
            console.log("Grand Total Calculated:", totalAmount);
            console.groupEnd();

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
