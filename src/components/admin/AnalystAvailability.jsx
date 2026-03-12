import React, { useMemo } from 'react';
import useInvoiceStore from '../../store/useInvoiceStore';
import { normalizeInvoiceForAnalyst } from '../../utils/invoiceNormalizer';
import { normalizeName } from '../../utils/text';

const isEligibleForCashout = (inv) => {
    const status = inv.estadoPago || 'IMPAGO';
    if (status !== 'IMPAGO') return false;
    return (inv.diasDesdeEmision || 0) >= 40 && !inv.linkedPayoutRequestId;
};

const AnalystAvailability = () => {
    const { invoices, analysts } = useInvoiceStore();

    const normalizedInvoices = useMemo(() => {
        return (invoices || []).map(inv => normalizeInvoiceForAnalyst(inv));
    }, [invoices]);

    const { analystTotals, totalGlobal } = useMemo(() => {
        const devMode = import.meta.env?.DEV || process.env.NODE_ENV !== 'production';

        const totals = {};
        const matchesCount = {};
        const eligibleCount = {};
        let globalSum = 0;

        // Map normalized names back to original configured names
        const normalizedMap = {};
        analysts.forEach(analystName => {
            const norm = normalizeName(analystName);
            normalizedMap[norm] = analystName;
            totals[analystName] = 0;
            matchesCount[analystName] = 0;
            eligibleCount[analystName] = 0;
        });

        if (devMode) {
            console.log("[ADMIN AVAILABLE] loaded analyst rules:", analysts);
            console.log("[ADMIN AVAILABLE] normalized map:", normalizedMap);
        }

        normalizedInvoices.forEach(inv => {
            const rawName = inv.analista || inv.analyst;
            if (!rawName) return;

            const normInvName = normalizeName(rawName);
            const originalName = normalizedMap[normInvName];

            if (originalName) {
                matchesCount[originalName]++;
                
                if (isEligibleForCashout(inv)) {
                    eligibleCount[originalName]++;
                    // Use Number() just like the analyst dashboard
                    totals[originalName] += Number(inv.totalAPagarAnalista || 0);
                }
            }
        });

        const analystList = Object.entries(totals).map(([analyst, sum]) => {
            globalSum += sum;
            if (devMode) {
                console.log(`[ADMIN AVAILABLE] analyst: ${analyst}`);
                console.log(`[ADMIN AVAILABLE] matched invoices count: ${matchesCount[analyst]}`);
                console.log(`[ADMIN AVAILABLE] eligible invoices count: ${eligibleCount[analyst]}`);
                console.log(`[ADMIN AVAILABLE] available amount: ${sum}`);
                console.log(`[ADMIN AVAILABLE] source fields used: totalAPagarAnalista`);
                console.log(`[ADMIN AVAILABLE] matching mode: normalized string`);
                console.log("-----------------------------------------");
            }
            return { analyst, montoDisponible: sum };
        });

        analystList.sort((a, b) => b.montoDisponible - a.montoDisponible);

        if (devMode) console.log(`[ADMIN AVAILABLE] total global: $${globalSum}`);

        return { analystTotals: analystList, totalGlobal: globalSum };
    }, [invoices, analysts, normalizedInvoices]);


    return (
        <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Disponibilidad de Analistas</h2>

            <div className="bg-white dark:bg-slate-800 shadow rounded-lg overflow-hidden border border-gray-200 dark:border-slate-700 max-w-4xl">
                
                {/* Header Resumen */}
                <div className="px-6 py-5 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">Monto Disponible para Solicitud</h3>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Solo se cuantifican facturas impagas y con antigüedad {'>'} 40 días, listadas por analista.
                        </p>
                    </div>
                </div>

                {/* Total Global Alert */}
                <div className="bg-blue-50 dark:bg-blue-900/20 px-6 py-4 border-b border-gray-200 dark:border-slate-700">
                     <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                         Disponible total analistas:{' '}
                         <span className="text-lg ml-2 font-mono">
                             ${totalGlobal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                         </span>
                     </p>
                </div>

                {/* Basic Table */}
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                        <thead className="bg-gray-50 dark:bg-slate-900">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Analista
                                </th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Monto Disponible
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                            {analystTotals.map((item, index) => (
                                <tr key={item.analyst} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-white">
                                        {item.analyst}
                                    </td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-mono font-medium ${item.montoDisponible > 0 ? "text-green-600 dark:text-green-400" : "text-gray-500 dark:text-gray-400"}`}>
                                        ${item.montoDisponible.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            ))}
                            {analystTotals.length === 0 && (
                                <tr>
                                    <td colSpan="2" className="px-6 py-8 text-center text-sm text-gray-500">
                                        No hay analistas configurados en el sistema activos actualmente.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

            </div>
        </div>
    );
};

export default AnalystAvailability;
