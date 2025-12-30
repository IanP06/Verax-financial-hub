import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, orderBy, getDocs, doc, updateDoc, writeBatch, serverTimestamp, getDoc } from 'firebase/firestore';
import { CheckCircle, XCircle, Clock, FileText, DollarSign, AlertCircle } from 'lucide-react';

const PayoutRequests = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedReq, setSelectedReq] = useState(null); // For detail view/modal

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'payoutRequests'), orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            setRequests(snap.docs.map(d => ({ ...d.data(), id: d.id })));
        } catch (error) {
            console.error("Error fetching payout requests:", error);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchRequests();
    }, []);

    const handleApprove = async (req) => {
        if (!confirm("¿Aprobar solicitud?")) return;

        try {
            const { writeBatch } = await import('firebase/firestore');
            const batch = writeBatch(db);
            const reqRef = doc(db, 'payoutRequests', req.id);

            const nextStatus = req.invoiceCRequired ? 'APPROVED_NEEDS_INVOICE' : 'APPROVED_SCHEDULED';

            // 1. Update Request
            const updates = {
                status: nextStatus,
                approvedAt: serverTimestamp(),
                // Append output history (arrayUnion equivalent manually or read/write? simpler to just set whole array if we had previous, but we don't fetch full object often. 
                // Let's assume we can push to array or use arrayUnion. Firestore arrayUnion is safe.)
            };

            const { arrayUnion } = await import('firebase/firestore');
            updates.history = arrayUnion({
                at: new Date().toISOString(),
                byRole: 'admin',
                action: 'APPROVED',
                note: 'Aprobado por administración'
            });

            if (!req.invoiceCRequired) {
                const date = new Date();
                date.setHours(date.getHours() + 48);
                updates.scheduledPaymentDate = date.toISOString();
            }

            batch.update(reqRef, updates);

            // 2. Update Invoices (Main + Mirror) to PENDIENTE_PAGO
            req.invoiceIds.forEach(invId => {
                // Main
                batch.update(doc(db, 'invoices', invId), {
                    estadoPago: 'PENDIENTE_PAGO',
                    paymentStatus: 'PENDIENTE_PAGO'
                });
                // Mirror
                batch.update(doc(db, `analyst_invoices/${req.analystUid}/items`, invId), {
                    paymentStatus: 'PENDIENTE_PAGO'
                });
            });

            await batch.commit();
            fetchRequests();
        } catch (e) {
            console.error("Error approving:", e);
        }
    };

    const handleReject = async (req) => {
        const reason = prompt("Motivo del rechazo (Obligatorio):");
        if (!reason) return;

        try {
            const { writeBatch, arrayUnion } = await import('firebase/firestore');
            const batch = writeBatch(db);
            const reqRef = doc(db, 'payoutRequests', req.id);

            batch.update(reqRef, {
                status: 'REJECTED',
                rejectionReason: reason,
                rejectedAt: serverTimestamp(),
                history: arrayUnion({
                    at: new Date().toISOString(),
                    byRole: 'admin',
                    action: 'REJECTED',
                    note: reason
                })
            });

            // Revert Invoices (Main + Mirror) to IMPAGO
            req.invoiceIds.forEach(invId => {
                const fieldsToReset = {
                    estadoPago: 'IMPAGO',
                    paymentStatus: 'IMPAGO',
                    linkedPayoutRequestId: null,
                    payoutRequestedAt: null
                };

                // Main
                batch.update(doc(db, 'invoices', invId), fieldsToReset);

                // Mirror
                batch.update(doc(db, `analyst_invoices/${req.analystUid}/items`, invId), {
                    paymentStatus: 'IMPAGO',
                    linkedPayoutRequestId: null
                });
            });

            await batch.commit();
            fetchRequests();

        } catch (e) {
            console.error("Error rejecting:", e);
        }
    };

    const handleConfirmInvoiceC = async (req) => {
        if (!confirm("¿Confirmar recepción de Factura C y programar pago?")) return;
        try {
            const date = new Date();
            date.setHours(date.getHours() + 48);

            await updateDoc(doc(db, 'payoutRequests', req.id), {
                status: 'APPROVED_SCHEDULED',
                scheduledPaymentDate: date.toISOString(),
                invoiceCConfirmedAt: serverTimestamp()
            });
            fetchRequests();
        } catch (e) {
            console.error(e);
        }
    };

    const handleMarkAsPaid = async (req) => {
        const dateStr = prompt("Fecha de pago (YYYY-MM-DD):", new Date().toISOString().split('T')[0]);
        if (!dateStr) return;

        try {
            const { writeBatch } = await import('firebase/firestore');
            const batch = writeBatch(db);
            const reqRef = doc(db, 'payoutRequests', req.id);

            batch.update(reqRef, {
                status: 'PAID',
                paidAt: dateStr
            });

            // Update MAIN Invoices Collection (Admin)
            // Need to update 'estadoDeCobro' to 'PAGADO'.
            // However, the PayoutRequest stores IDs of the *Mirror* or *Main* invoice?
            // The logic mirrored IDs from Main to Mirror. So IDs are same.

            // We need to look up these invoices in 'invoices' collection
            // But wait, 'invoiceIds' in request are just IDs.

            // IMPORTANT: We need to set 'paymentStatus' in Mirror ALSO to 'PAGADO'.

            req.invoiceIds.forEach(invId => {
                // 1. Update Main Invoice (Admin DB)
                const mainRef = doc(db, 'invoices', invId);
                // We use simplified logic here or should we invoke store?
                // Direct DB update is safer for Batch.
                batch.update(mainRef, {
                    estadoPago: 'PAGADO', // Assuming 'estadoPago' field exists (check schema in store)
                    // Store used 'estadoPago' for 'IMPAGO'/'PAGADO' (Analyst Status)
                    // Store used 'estadoDeCobro' for 'COBRADO'/'NO COBRADO' (Client Status)
                    // The prompt says: "actualizar invoices asociadas: paymentStatus = PAGADO"
                    // Wait, the store uses: `stagingInvoices` has `estadoPago`. `invoices` collection has `estadoPago`.
                    // Check useInvoiceStore: line 81 staging default `estadoPago: 'IMPAGO'`.
                    // So yes, update `estadoPago`.
                    fechaPagoAnalista: dateStr
                });

                // 2. Update Mirror Invoice (Analyst DB)
                const mirrorRef = doc(db, `analyst_invoices/${req.analystUid}/items`, invId);
                batch.update(mirrorRef, {
                    paymentStatus: 'PAGADO',
                    paymentDate: dateStr
                });
            });

            await batch.commit();
            fetchRequests();

        } catch (e) {
            console.error("Error marking as paid:", e);
        }
    };

    const getStatusBadge = (status) => {
        const styles = {
            SUBMITTED: 'bg-blue-100 text-blue-800',
            APPROVED_NEEDS_INVOICE: 'bg-yellow-100 text-yellow-800',
            APPROVED_SCHEDULED: 'bg-purple-100 text-purple-800',
            PAID: 'bg-green-100 text-green-800',
            REJECTED: 'bg-red-100 text-red-800'
        };
        return (
            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[status] || 'bg-gray-100'}`}>
                {status}
            </span>
        );
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Solicitudes de Pago</h2>

            <div className="bg-white dark:bg-slate-800 shadow overflow-hidden sm:rounded-md">
                <ul className="divide-y divide-gray-200 dark:divide-slate-700">
                    {loading ? <p className="p-4">Cargando...</p> : requests.length === 0 ? <p className="p-4">No hay solicitudes.</p> : requests.map((req) => (
                        <li key={req.id}>
                            <div className="px-4 py-4 sm:px-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center truncate">
                                        <p className="text-sm font-medium text-blue-600 truncate">{req.analystName}</p>
                                        <div className="ml-2 flex-shrink-0 flex">
                                            {getStatusBadge(req.status)}
                                        </div>
                                    </div>
                                    <div className="ml-2 flex-shrink-0 flex">
                                        <p className="text-sm font-bold text-gray-900 dark:text-white">${Number(req.totalAmount).toLocaleString()}</p>
                                    </div>
                                </div>
                                <div className="mt-2 sm:flex sm:justify-between">
                                    <div className="sm:flex">
                                        <p className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                                            <FileText className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                                            {req.invoiceIds?.length || 0} facturas
                                        </p>
                                        <p className="mt-2 flex items-center text-sm text-gray-500 dark:text-gray-400 sm:mt-0 sm:ml-6">
                                            <Clock className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                                            {req.createdAt?.seconds ? new Date(req.createdAt.seconds * 1000).toLocaleDateString() : '-'}
                                        </p>
                                    </div>
                                    <div className="mt-2 flex items-center text-sm sm:mt-0 gap-2">
                                        {req.status === 'SUBMITTED' && (
                                            <>
                                                <button onClick={() => handleApprove(req)} className="text-green-600 hover:text-green-900 font-medium">Aprobar</button>
                                                <button onClick={() => handleReject(req)} className="text-red-600 hover:text-red-900 font-medium">Rechazar</button>
                                            </>
                                        )}
                                        {req.status === 'APPROVED_NEEDS_INVOICE' && (
                                            <div className="flex items-center gap-2">
                                                {req.invoiceCUrl ? (
                                                    <a href={req.invoiceCUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">Ver F.C</a>
                                                ) : <span className="text-gray-400 italic">Esperando F.C...</span>}
                                                <button onClick={() => handleConfirmInvoiceC(req)} className="text-purple-600 font-medium">Confirmar OK</button>
                                            </div>
                                        )}
                                        {req.status === 'APPROVED_SCHEDULED' && (
                                            <button onClick={() => handleMarkAsPaid(req)} className="text-green-600 font-medium flex items-center">
                                                <DollarSign className="w-4 h-4 mr-1" /> Pagar
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {req.scheduledPaymentDate && (
                                    <div className="mt-2 text-xs text-purple-600 font-medium">
                                        Programado: {new Date(req.scheduledPaymentDate).toLocaleDateString()}
                                    </div>
                                )}

                                <div className="mt-4">
                                    <button
                                        onClick={() => setSelectedReq(selectedReq === req.id ? null : req.id)}
                                        className="text-xs text-gray-500 hover:text-gray-900 underline"
                                    >
                                        {selectedReq === req.id ? 'Ocultar Detalle' : 'Ver Detalle y Facturas'}
                                    </button>

                                    {selectedReq === req.id && (
                                        <div className="mt-3 bg-gray-50 p-3 rounded text-sm">
                                            {req.invoiceSnapshot ? (
                                                <table className="min-w-full text-xs">
                                                    <thead>
                                                        <tr className="text-left text-gray-500">
                                                            <th>Factura</th>
                                                            <th>Siniestro</th>
                                                            <th>Aseguradora</th>
                                                            <th className="text-right">Monto</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {req.invoiceSnapshot.map((inv, idx) => (
                                                            <tr key={idx} className="border-t border-gray-200">
                                                                <td className="py-1">{inv.nroFactura}</td>
                                                                <td className="py-1">{inv.siniestro}</td>
                                                                <td className="py-1">{inv.aseguradora}</td>
                                                                <td className="py-1 text-right">${Number(inv.total).toLocaleString()}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            ) : (
                                                <p className="text-gray-500 italic">No hay snapshot disponible.</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default PayoutRequests;
