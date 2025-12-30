import React, { useState, useMemo } from 'react';
import { normalizeInvoiceForAnalyst } from '../../utils/invoiceNormalizer';

const AnalystTable = ({ invoices, onSelectionChange }) => {
    const [filter, setFilter] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);

    // 1. Normalize Data
    const normalizedInvoices = useMemo(() => {
        return (invoices || []).map(inv => normalizeInvoiceForAnalyst(inv));
    }, [invoices]);

    // 2. Filter Normalized Data
    const filteredInvoices = useMemo(() => {
        if (!filter) return normalizedInvoices;
        const lower = filter.toLowerCase();
        return normalizedInvoices.filter(inv =>
            inv.factura?.toLowerCase().includes(lower) ||
            inv.siniestro?.toLowerCase().includes(lower) ||
            inv.compania?.toLowerCase().includes(lower)
        );
    }, [normalizedInvoices, filter]);

    const handleCheckbox = (id) => {
        setSelectedIds(prev => {
            const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
            onSelectionChange && onSelectionChange(next);
            return next;
        });
    };

    const isEligibleForCashout = (inv) => {
        // Exclude if PAGO, PENDIENTE, EN_SOLICITUD, PENDIENTE_PAGO
        const status = inv.estadoPago || 'IMPAGO';
        if (status !== 'IMPAGO') return false;
        // Strict IMPAGO check handles PENDIENTE/PAGO exclusion
        return (inv.diasDesdeEmision || 0) >= 40 && !inv.linkedPayoutRequestId;
    };

    return (
        <div className="bg-white dark:bg-slate-800 shadow rounded-lg overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Facturas Asignadas</h3>
                <input
                    type="text"
                    placeholder="Buscar (N° Factura, Siniestro, Cía)..."
                    className="px-3 py-2 border rounded text-sm dark:bg-slate-700 dark:text-white"
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                />
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                    <thead className="bg-gray-50 dark:bg-slate-900">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Select
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                N° Factura
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Siniestro
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Compañía
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Fecha Emisión
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Días
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                A Liquidar
                            </th>
                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Estado
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                        {filteredInvoices.map((inv) => {
                            const eligible = isEligibleForCashout(inv);

                            return (
                                <tr key={inv.id} className={eligible ? "bg-green-50 dark:bg-green-900/10" : ""}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {eligible && (
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(inv.id)}
                                                onChange={() => handleCheckbox(inv.id)}
                                                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                            />
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                        {inv.factura || '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {inv.siniestro || '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {inv.compania || '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {inv.fechaEmision || '-'}
                                    </td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold ${eligible ? 'text-red-500' : 'text-gray-500'}`}>
                                        {inv.diasDesdeEmision !== null ? inv.diasDesdeEmision : '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white font-mono">
                                        ${inv.aLiquidar.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        {getStatusBadge(inv.estadoPago)}
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredInvoices.length === 0 && (
                            <tr>
                                <td colSpan="8" className="px-6 py-4 text-center text-sm text-gray-500">
                                    No se encontraron facturas.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AnalystTable;
