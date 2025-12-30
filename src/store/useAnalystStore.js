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
            // Import batch
            const { writeBatch } = await import('firebase/firestore');
            const batch = writeBatch(db);

            // Calculate Total
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
                requiresInvoiceSnapshot: !!requiresInvoice, // Snapshot the rule state at creation time
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
                    paymentStatus: 'PENDIENTE_APROBACION', // Ensure consistent alias
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

            // Refresh local state
            await get().fetchAnalystData(uid);

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
            // 1. Upload File (Client-side usage of Firebase Storage would be ideal here calling a service, 
            // but we can assume a helper or do it here if we import storage).
            // For now, let's assume the component uploads and passes the URL, OR we implement simple upload locally.
            // The prompt says "Usar Firebase Storage (si ya está)".
            // Let's implement full upload here if we can import getStorage.

            const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
            const { updateDoc, arrayUnion } = await import('firebase/firestore');

            const storage = getStorage();
            const storageRef = ref(storage, `payout_receipts/${requestId}/${file.name}`);

            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);

            // 2. Update Request
            const reqRef = doc(db, 'payoutRequests', requestId);

            // Fetch request to get invoiceIds (for updating invoices)
            const reqSnap = await getDoc(reqRef);
            if (!reqSnap.exists()) throw new Error("Solicitud no encontrada");
            const reqData = reqSnap.data();

            const { writeBatch } = await import('firebase/firestore');
            const batch = writeBatch(db);

            // Request Update
            batch.update(reqRef, {
                status: 'READY_TO_PAY', // Flow Step 4: Analista sube comp -> READY_TO_PAY
                invoiceReceipt: {
                    url: url,
                    fileName: file.name,
                    uploadedAt: new Date().toISOString(),
                    uploadedByUid: analystUid,
                    storagePath: `payout_receipts/${requestId}/${file.name}`
                },
                history: arrayUnion({
                    at: new Date().toISOString(),
                    action: 'RECEIPT_UPLOADED',
                    note: `Factura subida: ${file.name}`
                })
            });

            // 3. Update Invoices (Main + Mirror) -> PENDIENTE_PAGO
            if (reqData.invoiceIds && reqData.invoiceIds.length > 0) {
                reqData.invoiceIds.forEach(invId => {
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

            // Refresh
            await get().fetchAnalystData(analystUid);
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
