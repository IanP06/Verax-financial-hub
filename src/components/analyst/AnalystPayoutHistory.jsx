import React, { useState } from 'react';
import { Clock, CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import useAnalystStore from '../../store/useAnalystStore';

const AnalystPayoutHistory = () => {
    const { payoutRequests, requestsError } = useAnalystStore();
    const [expandedId, setExpandedId] = useState(null);

    if (requestsError === 'generic') {
        return <div className="text-red-500 text-sm mt-4">Error cargando historial de solicitudes.</div>;
    }

    if (!payoutRequests || payoutRequests.length === 0) {
        return (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 text-center mt-6">
                <p className="text-gray-500 dark:text-gray-400">No tienes solicitudes de pago anteriores.</p>
            </div>
        );
    }

    const toggleExpand = (id) => {
        setExpandedId(expandedId === id ? null : id);
    };

    const getStatusConfig = (status) => {
        switch (status) {
            case 'SUBMITTED': return { color: 'bg-blue-100 text-blue-800', label: 'Enviada', icon: Clock };
            case 'APPROVED_SCHEDULED':
            case 'APPROVED_NEEDS_INVOICE':
            case 'PENDING_PAYMENT':
                return { color: 'bg-yellow-100 text-yellow-800', label: 'Aprobada / Pendiente Pago', icon: CheckCircle };
            case 'PAID': return { color: 'bg-green-100 text-green-800', label: 'Pagada', icon: CheckCircle };
            case 'REJECTED': return { color: 'bg-red-100 text-red-800', label: 'Rechazada', icon: XCircle };
            default: return { color: 'bg-gray-100 text-gray-800', label: status, icon: AlertCircle };
        }
    };

    return (
        <div className="space-y-4 mt-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Mis Solicitudes de Pago</h3>
            {payoutRequests.map(req => {
                const { color, label, icon: Icon } = getStatusConfig(req.status);
                const dateStr = req.createdAt?.seconds ? new Date(req.createdAt.seconds * 1000).toLocaleDateString() : 'Pendiente';

                return (
                    <div key={req.id} className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-slate-700">
                        <div
                            className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                            onClick={() => toggleExpand(req.id)}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`p-2 rounded-full ${color.split(' ')[0]}`}>
                                    <Icon size={20} className={color.split(' ')[1]} />
                                </div>
                                <div>
                                    <p className="font-bold text-gray-900 dark:text-white">
                                        Solicitud del {dateStr}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>
                                            {label}
                                        </span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                            {req.invoiceIds?.length || 0} facturas
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="font-bold text-lg text-gray-700 dark:text-gray-200">
                                    ${Number(req.totalAmount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                </span>
                                {expandedId === req.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                            </div>
                        </div>

                        {expandedId === req.id && (
                            <div className="bg-gray-50 dark:bg-slate-900/50 p-4 border-t border-gray-200 dark:border-slate-700">
                                {/* Error Logic Visualization */}
                                {req.status === 'REJECTED' && req.rejectionReason && (
                                    <div className="mb-4 bg-red-50 dark:bg-red-900/20 p-3 rounded border border-red-200 dark:border-red-800">
                                        <p className="text-sm font-bold text-red-800 dark:text-red-300">Motivo del Rechazo:</p>
                                        <p className="text-sm text-red-700 dark:text-red-200">{req.rejectionReason}</p>
                                    </div>
                                )}

                                {/* Snapshot Table */}
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead>
                                            <tr className="text-gray-500 border-b dark:border-slate-700 text-left">
                                                <th className="pb-2">Factura</th>
                                                <th className="pb-2">Siniestro</th>
                                                <th className="pb-2 text-right">Monto</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                                            {req.invoiceSnapshot?.map((item, idx) => (
                                                <tr key={idx} className="text-gray-700 dark:text-gray-300">
                                                    <td className="py-2">{item.nroFactura}</td>
                                                    <td className="py-2">{item.siniestro}</td>
                                                    <td className="py-2 text-right font-mono">
                                                        ${Number(item.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* History Log */}
                                {req.history && req.history.length > 0 && (
                                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
                                        <p className="text-xs font-bold text-gray-500 uppercase mb-2">Historial</p>
                                        <ul className="space-y-2">
                                            {req.history.map((evt, i) => (
                                                <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex gap-2">
                                                    <span className="font-mono text-gray-400">
                                                        {new Date(evt.at).toLocaleString()}
                                                    </span>
                                                    <span className="font-semibold">{evt.action}:</span>
                                                    <span>{evt.note}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default AnalystPayoutHistory;
