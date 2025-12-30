import React from 'react';
import { Trash, Check } from 'lucide-react';
import useInvoiceStore from '../../store/useInvoiceStore';

const StagingTable = () => {
    // UPDATED: Using stagingInvoices, removeStagingInvoice, updateStagingInvoice from the new store structure
    const { stagingInvoices, removeStagingInvoice, updateStagingInvoice, confirmInvoice, analysts, config } = useInvoiceStore();

    const handleConfirm = (id) => {
        confirmInvoice(id);
    };

    const handleAnalystChange = (id, newAnalyst) => {
        updateStagingInvoice(id, 'analyst', newAnalyst); // Fix: store uses 'analyst' or 'analista'? Store init uses 'analista' in defaults but field in object is 'analista'? 
        // NOTE: In store addStagingInvoice: "analista: inv.analista || ''".
        // In updateStagingInvoice code: "const updated = { ...i, [field]: value };"
        // Let's use 'analista' to match store.
        updateStagingInvoice(id, 'analista', newAnalyst);

        // Auto-set Savings % based on rules
        const rule = config?.analystRules?.find(r => r.name === newAnalyst);
        if (rule) {
            // Prompt: plusPercentDefault
            const def = rule.plusPercentDefault || rule.plusPercent || 0;
            updateStagingInvoice(id, 'plusPorAhorro', def);
        }
    };

    const isRuleFixed = (analystName) => {
        const rule = config?.analystRules?.find(r => r.name === analystName);
        return rule?.plusMode === 'FIJO';
    };

    return (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-md mt-6 transition-colors">
            <h2 className="text-xl font-bold text-[#1d2e3f] dark:text-blue-200 mb-4">Staging Area</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Revisa y completa los datos antes de confirmar.</p>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                    <thead>
                        <tr className="text-[#355071] dark:text-blue-300 border-b-2 border-[#355071] dark:border-blue-500">
                            <th className="p-2">Factura / Siniestro</th>
                            <th className="p-2">Aseguradora</th>
                            <th className="p-2">Monto Fact.</th>
                            <th className="p-2">Analista *</th>

                            {/* Liquidación */}
                            <th className="p-2 bg-blue-50 dark:bg-slate-800">GESTION A PAGAR</th>
                            <th className="p-2 bg-blue-50 dark:bg-slate-800">Ahorro Total (Base)</th>
                            <th className="p-2 bg-blue-50 dark:bg-slate-800">Plus Ahorro (%)</th>
                            <th className="p-2 bg-blue-50 dark:bg-slate-800">AHORRO A PAGAR</th>
                            <th className="p-2 bg-blue-50 dark:bg-slate-800">Viaticos</th>
                            <th className="p-2 bg-blue-100 dark:bg-slate-700 font-bold">Total Analista</th>

                            <th className="p-2">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stagingInvoices.length === 0 ? (
                            <tr><td colSpan="11" className="p-4 text-center text-gray-400">No hay facturas pendientes.</td></tr>
                        ) : (
                            stagingInvoices.map((inv) => (
                                <tr key={inv.id} className="border-b dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 align-top transition-colors">
                                    {/* Datos Invoice */}
                                    <td className="p-2">
                                        <div className="font-bold text-[#1d2e3f] dark:text-slate-200 mb-1">{inv.nroFactura}</div>
                                        <input
                                            value={inv.siniestro}
                                            onChange={(e) => updateStagingInvoice(inv.id, 'siniestro', e.target.value)}
                                            className="border rounded p-1 w-full text-xs font-mono text-gray-600 mb-1 focus:ring-1 focus:ring-blue-500 outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                        />
                                        <div className="text-[10px] text-gray-400">{inv.emisor}</div>
                                    </td>
                                    <td className="p-2">
                                        <select
                                            value={inv.aseguradora}
                                            onChange={(e) => updateStagingInvoice(inv.id, 'aseguradora', e.target.value)}
                                            className="border rounded p-1 w-full font-bold text-[#1d2e3f] text-xs focus:ring-1 focus:ring-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                        >
                                            <option value="">...</option>
                                            {config?.validAseguradoras?.map(a => (
                                                <option key={a.nombre} value={a.nombre}>{a.nombre}</option>
                                            ))}
                                            {!config?.validAseguradoras?.some(a => a.nombre === inv.aseguradora) && inv.aseguradora && (
                                                <option value={inv.aseguradora}>{inv.aseguradora}</option>
                                            )}
                                        </select>
                                    </td>

                                    {/* Monto Fact (Display Only / Input?) kept for reference but not for calc now */}
                                    <td className="p-2">
                                        <input
                                            type="text"
                                            value={inv.monto}
                                            onChange={(e) => updateStagingInvoice(inv.id, 'monto', e.target.value)}
                                            className="border rounded p-1 w-20 text-right dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                        />
                                    </td>

                                    {/* Analista */}
                                    <td className="p-2">
                                        <select
                                            value={inv.analista || ''}
                                            onChange={(e) => handleAnalystChange(inv.id, e.target.value)}
                                            className="border rounded p-1 w-24 bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                        >
                                            <option value="">...</option>
                                            {analysts.map((name) => (
                                                <option key={name} value={name}>{name}</option>
                                            ))}
                                        </select>
                                    </td>

                                    {/* Liquidacion Inputs */}
                                    <td className="p-2 bg-blue-50 dark:bg-slate-800">
                                        <input type="number" value={inv.montoGestion} onChange={(e) => updateStagingInvoice(inv.id, 'montoGestion', e.target.value)} className="border rounded p-1 w-16 text-right dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                                    </td>
                                    <td className="p-2 bg-blue-50 dark:bg-slate-800">
                                        <input
                                            type="number"
                                            placeholder="0"
                                            value={inv.ahorroTotal || ''}
                                            onChange={(e) => updateStagingInvoice(inv.id, 'ahorroTotal', e.target.value)}
                                            className="border rounded p-1 w-20 text-right font-bold text-green-600 dark:bg-slate-700 dark:border-slate-600 dark:text-green-400"
                                        />
                                    </td>
                                    <td className="p-2 bg-blue-50 dark:bg-slate-800">
                                        {/* PLUS AHORRO SMART */}
                                        {(() => {
                                            const rule = config?.analystRules?.find(r => r.name === inv.analista);
                                            // Rules: plusMode: "FIJO" | "EDITABLE"
                                            const isFixed = rule?.plusMode === 'FIJO';
                                            // Handle default if not set on invoice yet but rule exists? 
                                            // Already handled in handleAnalystChange but good to enforce visual lock

                                            return (
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        value={inv.plusPorAhorro}
                                                        onChange={(e) => updateStagingInvoice(inv.id, 'plusPorAhorro', e.target.value)}
                                                        disabled={isFixed}
                                                        className={`border rounded p-1 w-16 text-right dark:border-slate-600 dark:text-white 
                                                            ${isFixed ? 'bg-gray-200 dark:bg-slate-600 text-gray-500 cursor-not-allowed' : 'bg-white dark:bg-slate-700'}`}
                                                    />
                                                    {isFixed && (
                                                        <span className="absolute top-0 right-0 -mt-2 -mr-1 text-[8px] bg-gray-200 px-1 rounded text-gray-500">FIJO</span>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </td>
                                    <td className="p-2 bg-blue-50 dark:bg-slate-800">
                                        <input
                                            type="number"
                                            value={inv.ahorroAPagar}
                                            readOnly
                                            className="border rounded p-1 w-16 text-right bg-gray-100 text-gray-600 dark:bg-black/20 dark:border-slate-600 dark:text-gray-300 cursor-not-allowed"
                                        />
                                    </td>
                                    <td className="p-2 bg-blue-50 dark:bg-slate-800">
                                        <input type="number" value={inv.viaticosAPagar} onChange={(e) => updateStagingInvoice(inv.id, 'viaticosAPagar', e.target.value)} className="border rounded p-1 w-16 text-right dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                                    </td>
                                    <td className="p-2 bg-blue-100 dark:bg-slate-700 font-bold text-right text-[#355071] dark:text-blue-200">
                                        ${inv.totalAPagarAnalista?.toLocaleString('es-AR') || 0}
                                    </td>

                                    {/* Acciones */}
                                    <td className="p-2">
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => handleConfirm(inv.id)}
                                                disabled={!inv.analista}
                                                className={`p-1 rounded text-white ${(!inv.analista) ? 'bg-gray-300 dark:bg-gray-700' : 'bg-[#355071] hover:bg-[#2c425e]'}`}
                                                title="Confirmar"
                                            >
                                                <Check size={16} />
                                            </button>
                                            <button
                                                onClick={() => removeStagingInvoice(inv.id)}
                                                className="p-1 rounded text-[#d13737] hover:bg-red-50 dark:hover:bg-red-900 border border-[#d13737]"
                                                title="Eliminar"
                                            >
                                                <Trash size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default StagingTable;
