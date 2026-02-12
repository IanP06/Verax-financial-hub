import React, { useState } from 'react';
import useInvoiceStore from '../../store/useInvoiceStore';
import { Trash, Check, Plus, AlertTriangle, FileText } from 'lucide-react';

const StagingOL = () => {
    const { stagingLiquidation, addSproutToLiquidation, removeSproutFromLiquidation, updateSproutInLiquidation, updateLiquidationHeader, confirmLiquidation, resetStaging, analysts, config } = useInvoiceStore();
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!stagingLiquidation) return null;

    const { items = [], emisorNombre, emisorCuit, fechaEmision, numeroOL, totalOL } = stagingLiquidation;
    const sproutTotal = items.reduce((sum, item) => sum + (Number(item.totalAPagarAnalista) || 0), 0);

    const handleConfirm = async () => {
        // Validations
        if (items.length === 0) {
            alert("Debe agregar al menos un siniestro.");
            return;
        }
        if (!numeroOL) {
            alert("Falta el Número de OL.");
            return;
        }

        if (window.confirm("¿Confirmar Orden de Liquidación y generar facturas?")) {
            setIsSubmitting(true);
            await confirmLiquidation(stagingLiquidation.pdfFile);
            setIsSubmitting(false);
        }
    };

    const handleAddRow = () => {
        addSproutToLiquidation({
            siniestro: '',
            fechaInforme: '', // Must be filled
            analista: '',
            montoGestion: config?.montoGestion || 20000,
            plusPorAhorro: 0,
            ahorroTotal: 0,
            ahorroAPagar: 0,
            viaticos: 0,
            totalAPagarAnalista: config?.montoGestion || 20000
        });
    };

    const handleAnalystChange = (id, newAnalyst) => {
        updateSproutInLiquidation(id, 'analista', newAnalyst);
        const rule = config?.analystRules?.find(r => r.name === newAnalyst);
        if (rule) {
            const def = rule.plusPercentDefault || rule.plusPercent || 0;
            updateSproutInLiquidation(id, 'plusPorAhorro', def);
        }
    };

    return (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-md mt-6 transition-colors border-l-4 border-indigo-500">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h2 className="text-xl font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
                        <FileText /> Staging: Orden de Liquidación (SANCOR)
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Complete los detalles de la OL y desglose los siniestros.
                    </p>
                </div>
                <button onClick={resetStaging} className="text-gray-400 hover:text-red-500 text-xs underline">
                    Cancelar / Limpiar
                </button>
            </div>

            {/* HEADER OL */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg mb-6">
                <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">Emisor</label>
                    <div className="text-sm dark:text-white font-medium">{emisorNombre}</div>
                    <div className="text-xs text-gray-500">{emisorCuit}</div>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">N° Orden Liq.</label>
                    <input
                        type="text"
                        value={numeroOL || ''}
                        onChange={(e) => updateLiquidationHeader('numeroOL', e.target.value)}
                        className="w-full border rounded p-1 text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white font-bold"
                        placeholder="ej: 93280"
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">Fecha Emisión (Contable)</label>
                    <input
                        type="text"
                        value={fechaEmision || ''}
                        readOnly
                        className="w-full border-none bg-transparent p-0 text-sm dark:text-white"
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">Total OL (Neto)</label>
                    <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300">
                        ${stagingLiquidation.totalOL}
                    </div>
                </div>
            </div>

            {/* SPROUTS TABLE */}
            <div className="overflow-x-auto mb-4">
                <table className="w-full text-left border-collapse text-xs">
                    <thead>
                        <tr className="text-indigo-900 dark:text-indigo-200 border-b-2 border-indigo-200 dark:border-indigo-800">
                            <th className="p-2">Siniestro *</th>
                            <th className="p-2 w-32">Fecha Informe *</th>
                            <th className="p-2">Analista *</th>
                            <th className="p-2 bg-gray-50 dark:bg-slate-800">Monto Gestión</th>
                            <th className="p-2 bg-gray-50 dark:bg-slate-800">Ahorro Total</th>
                            <th className="p-2 bg-gray-50 dark:bg-slate-800">% Plus</th>
                            <th className="p-2 bg-gray-50 dark:bg-slate-800">Plus ($)</th>
                            <th className="p-2 bg-gray-50 dark:bg-slate-800">Viáticos</th>
                            <th className="p-2 bg-blue-50 dark:bg-slate-700 font-bold text-right">Total Item</th>
                            <th className="p-2 w-10"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item) => (
                            <tr key={item.id} className="border-b dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                                <td className="p-2">
                                    <input
                                        value={item.siniestro}
                                        onChange={(e) => updateSproutInLiquidation(item.id, 'siniestro', e.target.value)}
                                        className="w-full border rounded p-1 dark:bg-slate-700 dark:border-slate-600 dark:text-white font-mono"
                                        placeholder="N° Siniestro"
                                    />
                                </td>
                                <td className="p-2">
                                    <input
                                        type="date"
                                        value={item.fechaInforme?.split('/').reverse().join('-') || ''}
                                        onChange={(e) => {
                                            const val = e.target.value; // YYYY-MM-DD
                                            const [y, m, d] = val.split('-');
                                            const fmt = `${d}/${m}/${y}`;
                                            updateSproutInLiquidation(item.id, 'fechaInforme', fmt);
                                        }}
                                        className="w-full border rounded p-1 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                    />
                                    <div className="text-[10px] text-gray-400 mt-1">Base 40 días</div>
                                </td>
                                <td className="p-2">
                                    <select
                                        value={item.analista}
                                        onChange={(e) => handleAnalystChange(item.id, e.target.value)}
                                        className="w-full border rounded p-1 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                    >
                                        <option value="">Seleccionar...</option>
                                        {analysts.map(a => <option key={a} value={a}>{a}</option>)}
                                    </select>
                                </td>

                                {/* Numbers */}
                                <td className="p-2 bg-gray-50 dark:bg-slate-800">
                                    <input type="number" value={item.montoGestion} onChange={(e) => updateSproutInLiquidation(item.id, 'montoGestion', e.target.value)} className="w-16 border rounded p-1 text-right dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                                </td>
                                <td className="p-2 bg-gray-50 dark:bg-slate-800">
                                    <input type="number" value={item.ahorroTotal} onChange={(e) => updateSproutInLiquidation(item.id, 'ahorroTotal', e.target.value)} className="w-16 border rounded p-1 text-right dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                                </td>
                                <td className="p-2 bg-gray-50 dark:bg-slate-800">
                                    <input type="number" value={item.plusPorAhorro} onChange={(e) => updateSproutInLiquidation(item.id, 'plusPorAhorro', e.target.value)} className="w-12 border rounded p-1 text-right dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                                </td>
                                <td className="p-2 bg-gray-50 dark:bg-slate-800">
                                    <div className="text-right text-gray-500">${item.ahorroAPagar}</div>
                                </td>
                                <td className="p-2 bg-gray-50 dark:bg-slate-800">
                                    <input type="number" value={item.viaticos} onChange={(e) => updateSproutInLiquidation(item.id, 'viaticos', e.target.value)} className="w-16 border rounded p-1 text-right dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                                </td>
                                <td className="p-2 bg-blue-50 dark:bg-slate-700">
                                    <div className="text-right font-bold text-indigo-700 dark:text-indigo-300">
                                        ${item.totalAPagarAnalista?.toLocaleString('es-AR')}
                                    </div>
                                </td>
                                <td className="p-2">
                                    <button onClick={() => removeSproutFromLiquidation(item.id)} className="text-red-400 hover:text-red-600">
                                        <Trash size={14} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <button onClick={handleAddRow} className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 mb-6 border border-indigo-200 px-3 py-2 rounded bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-800 dark:text-indigo-300">
                <Plus size={14} /> Agregar Siniestro
            </button>

            {/* FOOTER ACTIONS */}
            <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-slate-700">
                <div className="flex items-center gap-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                        Total Items: <b>{items.length}</b>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={handleConfirm}
                        disabled={isSubmitting || items.length === 0}
                        className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2 rounded shadow hover:bg-indigo-700 disabled:opacity-50 font-bold transition-all"
                    >
                        {isSubmitting ? 'Procesando...' : (
                            <>
                                <Check size={18} /> CONFIRMAR OL
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default StagingOL;
