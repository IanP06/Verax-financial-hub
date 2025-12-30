import { create } from 'zustand';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, query, where, orderBy, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

const useAnalystStore = create((set, get) => ({
    analystInvoices: [],
    payoutRequests: [],
    loading: false,
    error: null,

    // KPI Helper Getters (computed)
    getStats: () => {
        const invoices = get().analystInvoices;
        const totalCases = invoices.length;
        const totalAmount = invoices.reduce((acc, curr) => acc + (Number(curr.totalToLiquidate) || 0), 0);

        // "Ready for Cashout": > 40 days AND PaymentStatus == IMPAGO (and not already requested)
        // We calculate "days since issue" at runtime
        const today = new Date();
        const readyInvoices = invoices.filter(inv => {
            if (inv.paymentStatus !== 'IMPAGO') return false;
            // Check if already in a submitted request (linkedPayoutRequestId)
            if (inv.linkedPayoutRequestId) return false;

            if (!inv.issueDate) return false;
            const [d, m, y] = inv.issueDate.split('/');
            const issueObj = new Date(y, m - 1, d);
            const diffTime = Math.abs(today - issueObj);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            return diffDays >= 40;
        });

        const readyCount = readyInvoices.length;
        const readyAmount = readyInvoices.reduce((acc, curr) => acc + (Number(curr.totalToLiquidate) || 0), 0);

        return { totalCases, totalAmount, readyCount, readyAmount, readyInvoices };
    },

    fetchAnalystData: async (uid) => {
        if (!uid) return;
        set({ loading: true, error: null });
        try {
            // 1. Fetch Invoices Mirror
            const invoicesRef = collection(db, `analyst_invoices/${uid}/items`);
            // Order by issueDate desc ideally, but string date is tricky. Client sort is fine for <1000 items.
            const invSnap = await getDocs(invoicesRef);
            const invoices = invSnap.docs.map(d => ({ ...d.data(), id: d.id }));

            // 2. Fetch Payout Requests
            const requestsRef = collection(db, 'payoutRequests');
            const qReq = query(requestsRef, where('analystUid', '==', uid), orderBy('createdAt', 'desc'));
            const reqSnap = await getDocs(qReq);
            const requests = reqSnap.docs.map(d => ({ ...d.data(), id: d.id }));

            set({ analystInvoices: invoices, payoutRequests: requests, loading: false });
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
