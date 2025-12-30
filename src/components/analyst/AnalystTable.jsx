import React, { useState, useMemo } from 'react';

// Helper for date diff
const getDaysSince = (dateStr) => {
    if (!dateStr) return "-";
    const [d, m, y] = dateStr.split('/');
    const issueDate = new Date(y, m - 1, d);
    const today = new Date();
    const diffTime = Math.abs(today - issueDate);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const AnalystTable = ({ invoices, onSelectionChange }) => {
    const [filter, setFilter] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);

    const filteredInvoices = useMemo(() => {
        if (!filter) return invoices;
        const lower = filter.toLowerCase();
        return invoices.filter(inv =>
            inv.invoiceNumber?.toLowerCase().includes(lower) ||
            inv.claimNumber?.toLowerCase().includes(lower) ||
            inv.insurer?.toLowerCase().includes(lower)
        );
    }, [invoices, filter]);

    const handleCheckbox = (id) => {
        setSelectedIds(prev => {
            const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
            onSelectionChange && onSelectionChange(next);
            return next;
        });
    };

    const isEligibleForCashout = (inv) => {
        const days = getDaysSince(inv.issueDate);
        return inv.paymentStatus === 'IMPAGO' && days >= 40 && !inv.linkedPayoutRequestId;
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
                            const days = getDaysSince(inv.issueDate);
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
                                        {inv.invoiceNumber}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {inv.claimNumber}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {inv.insurer}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {inv.issueDate}
                                    </td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold ${days >= 40 && inv.paymentStatus === 'IMPAGO' ? 'text-red-500' : 'text-gray-500'}`}>
                                        {days}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white font-mono">
                                        ${Number(inv.totalToLiquidate).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                                            ${inv.paymentStatus === 'PAGADO' ? 'bg-green-100 text-green-800' :
                                                inv.paymentStatus === 'EN_SOLICITUD' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                            {inv.paymentStatus}
                                        </span>
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
