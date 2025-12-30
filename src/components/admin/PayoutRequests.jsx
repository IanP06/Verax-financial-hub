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
            // The field in request is 'requiresInvoiceSnapshot' (new) or 'requiresInvoice' (legacy/store param)
            const needsInvoice = req.requiresInvoiceSnapshot !== undefined ? req.requiresInvoiceSnapshot : (req.requiresInvoice || req.invoiceCRequired);

            // Flow Step 3:
            // If needsInvoice -> req: APPROVED_WAITING_INVOICE, inv: PENDIENTE_FACTURA
            // If NOT -> req: READY_TO_PAY, inv: PENDIENTE_PAGO
            const nextStatus = needsInvoice ? 'APPROVED_WAITING_INVOICE' : 'READY_TO_PAY';
            const nextInvoiceStatus = needsInvoice ? 'PENDIENTE_FACTURA' : 'PENDIENTE_PAGO';

            // 1. Update Request
            const updates = {
                status: nextStatus,
                invoiceStatus: needsInvoice ? 'REQUIRED' : 'NOT_REQUIRED', // [NEW]
                approvedAt: serverTimestamp(),
                history: arrayUnion({
                    at: new Date().toISOString(),
                    byRole: 'admin',
                    action: 'APPROVED',
                    note: `Aprobado. Estado: ${nextStatus}`
                })
            };

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

    const handleVerifyInvoice = async (req) => {
        if (!confirm("¿Marcar comprobante como VERIFICADO?")) return;

        try {
            const { writeBatch, arrayUnion } = await import('firebase/firestore');
            const batch = writeBatch(db);
            const reqRef = doc(db, 'payoutRequests', req.id);

            // Transition to READY_TO_PAY (if not already)
            // User prompt allows Admin to manually verify to unlock payment
            batch.update(reqRef, {
                status: 'READY_TO_PAY',
                invoiceStatus: 'VERIFIED',
                verifiedAt: serverTimestamp(),
                history: arrayUnion({
                    at: new Date().toISOString(),
                    byRole: 'admin',
                    action: 'INVOICE_VERIFIED',
                    note: 'Comprobante verificado por admin. Listo para pagar.'
                })
            });

            // Update Invoices to PENDIENTE_PAGO (Ready)
            if (req.invoiceIds) {
                req.invoiceIds.forEach(invId => {
                    batch.update(doc(db, 'invoices', invId), {
                        estadoPago: 'PENDIENTE_PAGO',
                        paymentStatus: 'PENDIENTE_PAGO'
                    });
                    batch.update(doc(db, `analyst_invoices/${req.analystUid}/items`, invId), {
                        paymentStatus: 'PENDIENTE_PAGO',
                        estadoPago: 'PENDIENTE_PAGO'
                    });
                });
            }

            await batch.commit();
            fetchRequests();
        } catch (e) {
            console.error("Error verifying invoice:", e);
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
                status: 'PAGO', // or PAID
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
            PENDIENTE_APROBACION: 'bg-yellow-100 text-yellow-800',

            APPROVED_WAITING_INVOICE: 'bg-orange-100 text-orange-800',
            NEEDS_INVOICE: 'bg-orange-100 text-orange-800', // Legacy
            PENDIENTE_FACTURA: 'bg-orange-100 text-orange-800', // Legacy

            READY_TO_PAY: 'bg-purple-100 text-purple-800',
            PENDIENTE_PAGO: 'bg-purple-100 text-purple-800', // Unified
            APPROVED_SCHEDULED: 'bg-purple-100 text-purple-800', // Legacy

            PAGO: 'bg-green-100 text-green-800',
            PAID: 'bg-green-100 text-green-800',
            REJECTED: 'bg-red-100 text-red-800'
        };
        return (
            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[status] || 'bg-gray-100'}`}>
                {status === 'APPROVED_WAITING_INVOICE' ? 'ESPERANDO FACTURA' : status}
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

                                        {(req.status === 'APPROVED_WAITING_INVOICE' || req.status === 'NEEDS_INVOICE' || req.status === 'PENDIENTE_FACTURA') && (
                                            <div className="flex flex-col items-end gap-2">
                                                {/* INVOICE STATUS */}
                                                {req.invoiceStatus === 'UPLOADED' ? (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded">
                                                            COMPROBANTE SUBIDO
                                                        </span>
                                                        <a
                                                            href={req.invoiceReceipt?.url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="text-xs text-blue-600 underline"
                                                        >
                                                            Ver PDF
                                                        </a>
                                                        <button
                                                            onClick={() => handleVerifyInvoice(req)}
                                                            className="px-3 py-1 text-xs font-bold text-white bg-green-600 rounded hover:bg-green-700"
                                                        >
                                                            Verificar
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-orange-600 italic font-medium bg-orange-50 px-2 py-1 rounded border border-orange-200">
                                                        Esperando comprobante...
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        {(req.status === 'READY_TO_PAY' || req.status === 'PENDIENTE_PAGO' || req.status === 'APPROVED_SCHEDULED') && (
                                            <div className="flex items-center gap-2">
                                                {/* If verification done */}
                                                {req.invoiceStatus === 'VERIFIED' && (
                                                    <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-1 rounded border border-green-200">
                                                        VERIFICADO
                                                    </span>
                                                )}

                                                {req.invoiceReceipt?.url && (
                                                    <a href={req.invoiceReceipt.url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 underline mr-2">Ver F.C</a>
                                                )}

                                                <button onClick={() => handleMarkAsPaid(req)} className="text-green-600 font-medium flex items-center bg-green-50 px-3 py-1 rounded hover:bg-green-100">
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
