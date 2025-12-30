import { create } from 'zustand';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, query, where, orderBy, doc, updateDoc, serverTimestamp, getDoc, onSnapshot } from 'firebase/firestore';
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
        set({ requestsError: null });
        const requestsRef = collection(db, 'payoutRequests');

        try {
            // Try Ordered Query (Needs Index)
            const qReq = query(requestsRef, where('analystUid', '==', uid), orderBy('createdAt', 'desc'));
            const reqSnap = await getDocs(qReq);
            const requests = reqSnap.docs.map(d => ({ ...d.data(), id: d.id }));
            set({ payoutRequests: requests });
        } catch (err) {
            // Fallback for missing index
            if (err.code === 'failed-precondition' || err.message.includes('index')) {
                console.warn("[Store] PayoutRequests index missing. Falling back to client-side sort.");
                try {
                    const qSimple = query(requestsRef, where('analystUid', '==', uid));
                    const simpleSnap = await getDocs(qSimple);
                    const requests = simpleSnap.docs.map(d => ({ ...d.data(), id: d.id }));
                    // Client Sort desc
                    requests.sort((a, b) => {
                        const tA = a.createdAt?.seconds || 0;
                        const tB = b.createdAt?.seconds || 0;
                        return tB - tA;
                    });
                    set({ payoutRequests: requests });
                } catch (fallbackErr) {
                    console.error("Fallback fetch failed:", fallbackErr);
                    set({ requestsError: 'generic', payoutRequests: [] });
                }
            } else {
                console.error("Error fetching requests:", err);
                set({ requestsError: 'generic', payoutRequests: [] });
            }
        }
    },

    // REAL-TIME SUBSCRIPTION (Replaces fetchAnalystData)
    // REAL-TIME SUBSCRIPTION (Replaces fetchAnalystData)
    subscribeToAnalystData: (uid, analystKey) => {
        if (!uid || !analystKey) return () => { };

        set({ loading: true, error: null });
        console.log(`[Store] Subscribing to data for: ${analystKey} (${uid})`);

        const me = normalizeName(analystKey);

        // --- 1. SETUP INVOICE LISTENERS (Dual Query Strategy) ---
        let legacyDocs = [];
        let futureDocs = [];

        const mergeAndSetInvoices = () => {
            const results = new Map();
            legacyDocs.forEach(d => results.set(d.id, d));
            futureDocs.forEach(d => results.set(d.id, d));

            let allDocs = Array.from(results.values());
            // Client-side Safe Filter
            allDocs = allDocs.filter(d => normalizeName(d.analista || d.analyst) === me);

            set({ analystInvoices: allDocs });
        };

        // Queries
        let unsubLegacy = () => { };
        let unsubFuture = () => { };
        let unsubRequests = () => { };

        try {
            // Query A: Legacy
            const qLegacy = query(collection(db, 'invoices'), where('analista', '==', analystKey));
            unsubLegacy = onSnapshot(qLegacy, (snap) => {
                legacyDocs = snap.docs.map(d => ({ ...d.data(), id: d.id }));
                mergeAndSetInvoices();
            }, (error) => console.warn("Legacy Invoice Listener Error", error));

            // Query B: Future
            const qFuture = query(collection(db, 'invoices'), where('analyst', '==', analystKey));
            unsubFuture = onSnapshot(qFuture, (snap) => {
                futureDocs = snap.docs.map(d => ({ ...d.data(), id: d.id }));
                mergeAndSetInvoices();
            }, (error) => console.warn("Future Invoice Listener Error", error));

            // --- 2. SETUP REQUESTS LISTENER ---
            const requestsRef = collection(db, 'payoutRequests');
            // Try Ordered
            const qReq = query(requestsRef, where('analystUid', '==', uid), orderBy('createdAt', 'desc'));

            unsubRequests = onSnapshot(qReq, (snap) => {
                const reqs = snap.docs.map(d => ({ ...d.data(), id: d.id }));
                set({ payoutRequests: reqs, loading: false });
            }, (err) => {
                // Index fallback logic
                if (err.code === 'failed-precondition' || err.message.includes('index')) {
                    console.warn("[Store] Index missing for listener. Fallback to simple query.");
                    const qSimple = query(requestsRef, where('analystUid', '==', uid));
                    unsubRequests = onSnapshot(qSimple, (snap) => {
                        const reqs = snap.docs.map(d => ({ ...d.data(), id: d.id }));
                        reqs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
                        set({ payoutRequests: reqs, loading: false });
                    });
                } else {
                    console.error("Requests Listener Error:", err);
                    set({ loading: false });
                }
            });

        } catch (e) {
            console.error("Setup Error:", e);
            set({ loading: false });
        }

        // Return Cleanup
        return () => {
            console.log("[Store] Unsubscribing observers...");
            if (unsubLegacy) unsubLegacy();
            if (unsubFuture) unsubFuture();
            if (unsubRequests) unsubRequests();
        };
    },



    // INTERNAL: Fetch Single Rule On-Demand (No Cache Reliance)
    fetchAnalystRule: async (analystName) => {
        if (!analystName) return null;
        try {
            const { normalizeName } = await import('../utils/text');
            const targetName = normalizeName(analystName);

            // Direct Firestore Fetch
            const rulesRef = doc(db, 'settings', 'analystRules');
            const docSnap = await getDoc(rulesRef);

            if (!docSnap.exists()) {
                console.warn(`[Rules] Rules document not found.`);
                return null;
            }

            const data = docSnap.data();
            const rules = data.rules || [];

            // Find match
            const match = rules.find(r => normalizeName(r.name) === targetName);
            return match || null;

        } catch (e) {
            console.error("[Rules] Error fetching rule:", e);
            return null;
        }
    },

    createPayoutRequest: async (uid, analystName, selectedInvoices, /* legacyArg ignored */) => {
        // selectedInvoices: Array of full invoice objects
        if (!uid || selectedInvoices.length === 0) return;

        set({ loading: true });
        try {
            // Import batch
            const { writeBatch } = await import('firebase/firestore');
            const batch = writeBatch(db);
            const { normalizeName } = await import('../utils/text');

            // --- CRITICAL RULE CHECK ---
            // Fetch fresh rule from Firestore (avoid store race conditions)
            const rule = await get().fetchAnalystRule(analystName);
            const requiresInvoice = rule?.requiresInvoice === true;

            const normName = normalizeName(analystName);
            console.log(`[Rules] Analyst ${analystName} normalized=${normName} requiresInvoice=${requiresInvoice} source=firestore`);
            // ---------------------------
            const totalAmount = selectedInvoices.reduce((sum, inv) => sum + getAnalystTotal(inv), 0);
            const invoiceIds = selectedInvoices.map(i => i.id);

            // Snapshot vital fields for history
            const invoiceSnapshot = selectedInvoices.map(inv => ({
                id: inv.id,
                nroFactura: inv.nroFactura || inv.factura || inv.invoiceNumber || '-',
                siniestro: inv.siniestro || inv.claimNumber || '-',
                aseguradora: inv.aseguradora || inv.insurer || '-',
                fechaEmision: inv.fechaEmision || inv.fecha || inv.issueDate || '-',
                total: getAnalystTotal(inv)
            }));

            // 1. Create Request Doc Reference
            const requestRef = doc(collection(db, 'payoutRequests'));
            const requestId = requestRef.id;

            const requestData = {
                analystUid: uid,
                analystName: analystName,
                createdAt: serverTimestamp(),
                status: 'SUBMITTED',
                invoiceIds: invoiceIds,
                invoiceSnapshot: invoiceSnapshot,
                totalAmount: totalAmount,
                expiresAt: null,
                requiresInvoiceSnapshot: !!requiresInvoice,
                invoiceStatus: requiresInvoice ? 'REQUIRED' : 'NOT_REQUIRED', // [NEW] Flow Control
                invoiceReceipt: null,
                history: [
                    {
                        at: new Date().toISOString(),
                        action: 'SUBMITTED',
                        note: 'Solicitud creada por analista'
                    }
                ]
            };

            // Add Request to Batch
            batch.set(requestRef, requestData);

            // 2. Update Invoices to PENDIENTE_APROBACION
            invoiceIds.forEach(invId => {
                // Update MAIN invoices collection
                const invRef = doc(db, 'invoices', invId);
                batch.update(invRef, {
                    estadoPago: 'PENDIENTE_APROBACION',
                    paymentStatus: 'PENDIENTE_APROBACION',
                    linkedPayoutRequestId: requestId,
                    payoutRequestedAt: serverTimestamp()
                });

                // Update MIRROR
                const mirrorRef = doc(db, `analyst_invoices/${uid}/items`, invId);
                batch.update(mirrorRef, {
                    paymentStatus: 'PENDIENTE_APROBACION',
                    estadoPago: 'PENDIENTE_APROBACION',
                    linkedPayoutRequestId: requestId
                });
            });

            await batch.commit();

            // Refresh local state - Handled by Listeners now
            // await get().fetchAnalystData(uid); -- Removed

            return { success: true };
        } catch (err) {
            console.error("Error creating payout request:", err);
            set({ loading: false, error: "Error creando solicitud" });
            return { success: false, error: err.message };
        }
    },

    uploadInvoiceReceipt: async (requestId, file, analystUid) => {
        set({ loading: true });
        try {
            const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
            const { updatedoc, arrayUnion } = await import('firebase/firestore'); // ensure imports

            const storage = getStorage();
            const storageRef = ref(storage, `payout_receipts/${requestId}/${file.name}`);

            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);

            // 2. Update Request
            const reqRef = doc(db, 'payoutRequests', requestId);

            // Fetch request 
            const reqSnap = await getDoc(reqRef);
            if (!reqSnap.exists()) throw new Error("Solicitud no encontrada");
            // const reqData = reqSnap.data(); // Not strictly needed unless logic depends on it

            const { writeBatch } = await import('firebase/firestore');
            const batch = writeBatch(db);

            // Request Update
            // NOTE: User prompt says: "Tras subir PDF... mover status a READY_TO_PAY"
            batch.update(reqRef, {
                status: 'READY_TO_PAY',
                invoiceStatus: 'UPLOADED',
                invoiceReceipt: {
                    url: url,
                    fileName: file.name,
                    uploadedAt: new Date().toISOString(),
                    uploadedByUid: analystUid,
                    storagePath: `payout_receipts/${requestId}/${file.name}`
                },
                history: arrayUnion({
                    at: new Date().toISOString(),
                    action: 'INVOICE_UPLOADED',
                    note: `Factura subida: ${file.name}`
                })
            });

            // 3. Update Invoices (Main + Mirror) -> PENDIENTE_PAGO
            // This enables "Pagar" flow
            const reqDataForIds = reqSnap.data();
            if (reqDataForIds.invoiceIds && reqDataForIds.invoiceIds.length > 0) {
                reqDataForIds.invoiceIds.forEach(invId => {
                    // Main
                    batch.update(doc(db, 'invoices', invId), {
                        estadoPago: 'PENDIENTE_PAGO',
                        paymentStatus: 'PENDIENTE_PAGO'
                    });
                    // Mirror
                    batch.update(doc(db, `analyst_invoices/${analystUid}/items`, invId), {
                        paymentStatus: 'PENDIENTE_PAGO',
                        estadoPago: 'PENDIENTE_PAGO'
                    });
                });
            }

            await batch.commit();

            // Refresh - Handled by Listeners
            // await get().fetchAnalystData(analystUid); -- Removed
            set({ loading: false });
            return { success: true, url };

        } catch (err) {
            console.error("Error uploading receipt:", err);
            set({ loading: false, error: "Error subiendo comprobante" });
            return { success: false, error: err.message };
        }
    }
}));

export default useAnalystStore;
