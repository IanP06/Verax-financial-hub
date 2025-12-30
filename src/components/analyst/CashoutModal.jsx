import React, { useState } from 'react';
import useAnalystStore from '../../store/useAnalystStore';

import { getAnalystTotal } from '../../utils/money';

const CashoutModal = ({ isOpen, onClose, selectedIds, invoices, user, userProfile }) => {
    const { createPayoutRequest } = useAnalystStore();
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    // Filter full invoice objects
    const selectedInvoices = invoices.filter(i => selectedIds.includes(i.id));
    const totalAmount = selectedInvoices.reduce((sum, i) => sum + getAnalystTotal(i), 0);

    const handleConfirm = async () => {
        setLoading(true);
        const requiresInvoice = userProfile?.requiresInvoice || false; // default false

        await createPayoutRequest(
            user.uid,
            user.displayName || user.email, // fallback name
            selectedInvoices,
            requiresInvoice
        );

        setLoading(false);
        onClose();
        // Ideally we should empty selection in dashboard, but we can handle that via store reload or passing a setter
        window.location.reload(); // Quick fix to reset selection state and refresh data
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/50">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-lg w-full p-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                    Confirmar Solicitud de Pago
                </h3>

                <div className="space-y-4 mb-6">
                    <p className="text-gray-600 dark:text-gray-300">
                        Está a punto de solicitar el pago por las siguientes facturas:
                    </p>
                    <ul className="max-h-40 overflow-y-auto list-disc pl-5 text-sm text-gray-500 space-y-1">
                        {selectedInvoices.map(inv => {
                            const amount = getAnalystTotal(inv);
                            return (
                                <li key={inv.id}>
                                    {inv.insurer || inv.aseguradora} - {inv.invoiceNumber || inv.factura || inv.nroFactura}
                                    {amount > 0 ? (
                                        <span className="font-semibold ml-1">
                                            (${amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })})
                                        </span>
                                    ) : (
                                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                            MONTO INVÁLIDO
                                        </span>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                    <div className="border-t pt-2 mt-4 flex justify-between font-bold text-gray-900 dark:text-white">
                        <span>Total a Solicitar:</span>
                        <span>${totalAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {userProfile?.requiresInvoice && (
                        <div className="bg-yellow-50 p-3 rounded text-xs text-yellow-800">
                            ⚠️ Usted emite Factura C. Deberá subir el comprobante una vez aprobada la solicitud.
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 border rounded-md text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700"
                        disabled={loading}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-500 disabled:opacity-50"
                        disabled={loading}
                    >
                        {loading ? 'Procesando...' : 'Confirmar Solicitud'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CashoutModal;
