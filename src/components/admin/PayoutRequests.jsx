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
            const { writeBatch, arrayUnion } = await import('firebase/firestore');
            const batch = writeBatch(db);
            const reqRef = doc(db, 'payoutRequests', req.id);

            // Check if requires Invoice C
            // The field in request should be 'requiresInvoice' (as set in store)
            // Fallback to legacy 'invoiceCRequired' if older doc
            const needsInvoice = req.requiresInvoice || req.invoiceCRequired;

            const nextStatus = needsInvoice ? 'PENDIENTE_FACTURA' : 'PENDIENTE_PAGO';
            const nextInvoiceStatus = needsInvoice ? 'PENDIENTE_FACTURA' : 'PENDIENTE_PAGO';

            // 1. Update Request
            const updates = {
                status: nextStatus,
                approvedAt: serverTimestamp(),
                history: arrayUnion({
                    at: new Date().toISOString(),
                    byRole: 'admin',
                    action: 'APPROVED',
                    note: `Aprobado. Estado: ${nextStatus}`
                })
            };

            // Schedule payment date if direct to payment
            if (!needsInvoice) {
                const date = new Date();
                date.setHours(date.getHours() + 48); // Standard 48h
                updates.scheduledPaymentDate = date.toISOString();
            }

            batch.update(reqRef, updates);

            // 2. Update Invoices (Main + Mirror)
            if (req.invoiceIds && req.invoiceIds.length > 0) {
                req.invoiceIds.forEach(invId => {
                    // Main
                    batch.update(doc(db, 'invoices', invId), {
                        estadoPago: nextInvoiceStatus,
                        paymentStatus: nextInvoiceStatus
                    });
                    // Mirror
                    batch.update(doc(db, `analyst_invoices/${req.analystUid}/items`, invId), {
                        paymentStatus: nextInvoiceStatus,
                        estadoPago: nextInvoiceStatus // Sync state
                    });
                });
            }

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
            if (req.invoiceIds) {
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
                        estadoPago: 'IMPAGO',
                        linkedPayoutRequestId: null
                    });
                });
            }

            await batch.commit();
            fetchRequests();

        } catch (e) {
            console.error("Error rejecting:", e);
        }
    };

    const handleMarkAsPaid = async (req) => {
        const dateStr = prompt("Fecha de pago (YYYY-MM-DD):", new Date().toISOString().split('T')[0]);
        if (!dateStr) return;

        try {
            const { writeBatch, arrayUnion } = await import('firebase/firestore');
            const batch = writeBatch(db);
            const reqRef = doc(db, 'payoutRequests', req.id);

            batch.update(reqRef, {
                status: 'PAGO',
                paidAt: dateStr,
                history: arrayUnion({
                    at: new Date().toISOString(),
                    byRole: 'admin',
                    action: 'PAID',
                    note: `Pagado el ${dateStr}`
                })
            });

            if (req.invoiceIds) {
                req.invoiceIds.forEach(invId => {
                    // Main
                    batch.update(doc(db, 'invoices', invId), {
                        estadoPago: 'PAGO', // Final State
                        paymentStatus: 'PAGO',
                        // estadoDeCobro vs estadoPago: 'PAGO' is correct for Analyst.
                        fechaPagoAnalista: dateStr
                    });

                    // Mirror
                    batch.update(doc(db, `analyst_invoices/${req.analystUid}/items`, invId), {
                        paymentStatus: 'PAGO',
                        estadoPago: 'PAGO',
                        paymentDate: dateStr
                    });
                });
            }

            await batch.commit();
            fetchRequests();

        } catch (e) {
            console.error("Error marking as paid:", e);
        }
    };

    const getStatusBadge = (status) => {
        const styles = {
            SUBMITTED: 'bg-blue-100 text-blue-800',
            PENDIENTE_FACTURA: 'bg-orange-100 text-orange-800',
            APPROVED_NEEDS_INVOICE: 'bg-orange-100 text-orange-800', // Legacy support
            PENDIENTE_PAGO: 'bg-purple-100 text-purple-800',
            APPROVED_SCHEDULED: 'bg-purple-100 text-purple-800', // Legacy support
            PAGO: 'bg-green-100 text-green-800',
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
                    {loading ? <p className="p-4 dark:text-gray-300">Cargando...</p> : requests.length === 0 ? <p className="p-4 dark:text-gray-300">No hay solicitudes.</p> : requests.map((req) => (
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
                                            {req.invoiceIds?.length || 0} facturas
                                        </p>
                                        <p className="mt-2 flex items-center text-sm text-gray-500 dark:text-gray-400 sm:mt-0 sm:ml-6">
                                            {req.createdAt?.seconds ? new Date(req.createdAt.seconds * 1000).toLocaleDateString() : '-'}
                                        </p>
                                    </div>
                                    <div className="mt-2 flex items-center text-sm sm:mt-0 gap-2">
                                        {/* ACTION BUTTONS */}
                                        {req.status === 'SUBMITTED' && (
                                            <>
                                                <button onClick={() => handleApprove(req)} className="text-green-600 hover:text-green-900 font-medium">Aprobar</button>
                                                <button onClick={() => handleReject(req)} className="text-red-600 hover:text-red-900 font-medium">Rechazar</button>
                                            </>
                                        )}

                                        {req.status === 'PENDIENTE_FACTURA' && (
                                            <div className="flex items-center gap-2">
                                                {req.invoiceReceipt?.url ? (
                                                    <a
                                                        href={req.invoiceReceipt.url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-blue-600 underline font-medium"
                                                    >
                                                        Descargar F.C ({req.invoiceReceipt.fileName})
                                                    </a>
                                                ) : <span className="text-orange-500 italic text-xs">Esperando F.C...</span>}

                                                {/* Allow marking as paid only if receipt exists? Or give manual override? */}
                                                {/* Spec says: "cuando exista invoiceReceipt.url ... se habilita Pagar" */}
                                                {req.invoiceReceipt?.url && (
                                                    <button onClick={() => handleMarkAsPaid(req)} className="text-green-600 font-medium ml-2">
                                                        Pagar
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {(req.status === 'PENDIENTE_PAGO' || req.status === 'APPROVED_SCHEDULED') && (
                                            <div className="flex items-center gap-2">
                                                {/* If they had receipt, show logic */}
                                                {req.invoiceReceipt?.url && (
                                                    <a href={req.invoiceReceipt.url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 underline mr-2">Ver F.C</a>
                                                )}
                                                <button onClick={() => handleMarkAsPaid(req)} className="text-green-600 font-medium flex items-center">
                                                    <DollarSign className="w-4 h-4 mr-1" /> Pagar
                                                </button>
                                            </div>
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
                                        className="text-xs text-gray-500 hover:text-gray-900 dark:hover:text-gray-300 underline"
                                    >
                                        {selectedReq === req.id ? 'Ocultar Detalle' : 'Ver Detalle y Facturas'}
                                    </button>

                                    {/* DETAIL VIEW WITH FIXED CONTRAST */}
                                    {selectedReq === req.id && (
                                        <div className="mt-3 bg-gray-100 dark:bg-slate-700/50 p-3 rounded text-sm border border-gray-200 dark:border-slate-600">
                                            {req.invoiceSnapshot ? (
                                                <table className="min-w-full text-xs">
                                                    <thead>
                                                        <tr className="text-left text-gray-600 dark:text-gray-300 border-b border-gray-300 dark:border-gray-500">
                                                            <th className="pb-2">Factura</th>
                                                            <th className="pb-2">Siniestro</th>
                                                            <th className="pb-2">Aseguradora</th>
                                                            <th className="pb-2 text-right">Monto</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                                                        {req.invoiceSnapshot.map((inv, idx) => (
                                                            <tr key={idx} className="text-gray-800 dark:text-gray-200">
                                                                <td className="py-2">{inv.nroFactura}</td>
                                                                <td className="py-2">{inv.siniestro}</td>
                                                                <td className="py-2">{inv.aseguradora}</td>
                                                                <td className="py-2 text-right font-mono">${Number(inv.total).toLocaleString()}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            ) : (
                                                <p className="text-gray-500 dark:text-gray-400 italic">No hay snapshot disponible.</p>
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
