import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import useInvoiceStore from '../../store/useInvoiceStore';

const labelClass = "block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1";
const inputClass = "w-full rounded-md border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 disabled:bg-slate-100 disabled:text-slate-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-400 p-2";
const selectClass = inputClass + " appearance-none";

const EditInvoiceModal = ({ invoice, onClose }) => {
    const { updateInvoice, analysts } = useInvoiceStore();
    const [formData, setFormData] = useState({ ...invoice });

    useEffect(() => {
        setFormData({ ...invoice });
    }, [invoice]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = () => {
        // Validation / Defaults
        const finalData = { ...formData };

        // Ensure numbers
        finalData.monto = finalData.monto; // Keep string for invoice amount? Yes usually.
        finalData.montoGestion = Number(finalData.montoGestion) || 0;
        finalData.plusPorAhorro = Number(finalData.plusPorAhorro) || 0;
        finalData.ahorroAPagar = Number(finalData.ahorroAPagar) || 0;
        finalData.viaticosAPagar = Number(finalData.viaticosAPagar) || 0;

        // Date default logic
        if (finalData.estadoPago === 'PAGO' && !finalData.fechaPagoAnalista) {
            const today = new Date().toISOString().split('T')[0];
            finalData.fechaPagoAnalista = today;
        }

        // Recalc total done in store or display? Store does it on updateInvoice.

        updateInvoice(invoice.id, finalData);
        onClose();
    };

    if (!invoice) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 shadow-xl border dark:border-slate-800">
                <div className="flex justify-between items-center mb-6 border-b dark:border-slate-800 pb-2">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Editar Factura / Liquidación</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                        <X size={24} />
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* SECCIÓN 1: DATOS FACTURA */}
                    <div className="space-y-4">
                        <h3 className="font-bold text-slate-800 dark:text-slate-200 border-b dark:border-slate-800 pb-1">Datos de Factura</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className={labelClass}>Nro Factura</label>
                                <input name="nroFactura" value={formData.nroFactura || ''} onChange={handleChange} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Siniestro</label>
                                <input name="siniestro" value={formData.siniestro || ''} onChange={handleChange} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Aseguradora</label>
                                <input name="aseguradora" value={formData.aseguradora || ''} onChange={handleChange} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Emisor</label>
                                <input name="emisor" value={formData.emisor || ''} onChange={handleChange} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Monto Factura</label>
                                <input name="monto" value={formData.monto || ''} onChange={handleChange} className={`${inputClass} text-right`} />
                            </div>
                            <div>
                                <label className={labelClass}>Fecha Emisión</label>
                                <input name="fecha" value={formData.fecha || ''} onChange={handleChange} className={inputClass} placeholder="DD/MM/AAAA" />
                            </div>
                        </div>
                    </div>

                    {/* SECCIÓN 2: GESTIÓN */}
                    <div className="space-y-4">
                        <h3 className="font-bold text-slate-800 dark:text-slate-200 border-b dark:border-slate-800 pb-1">Gestión y Resultados</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className={labelClass}>Analista</label>
                                <select name="analista" value={formData.analista || ''} onChange={handleChange} className={selectClass}>
                                    <option value="">Seleccionar...</option>
                                    {analysts.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>Resultado</label>
                                <select name="resultado" value={formData.resultado || ''} onChange={handleChange} className={selectClass}>
                                    <option value="">...</option>
                                    <option value="SIN INDICIOS">SIN INDICIOS</option>
                                    <option value="RECHAZO">RECHAZO</option>
                                    <option value="DESISTIDO">DESISTIDO</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>Estado Cobro (Aseguradora)</label>
                                <select name="estadoDeCobro" value={formData.estadoDeCobro || 'NO COBRADO'} onChange={handleChange} className={`${selectClass} font-semibold`}>
                                    <option value="NO COBRADO">NO COBRADO</option>
                                    <option value="COBRADO">COBRADO</option>
                                </select>
                            </div>
                            {/* Dias Cobro / Fecha Pago logic is handled by store logic usually, but here we clarify */}
                        </div>
                    </div>

                    {/* SECCIÓN 3: LIQUIDACIÓN */}
                    <div className="space-y-4 md:col-span-2">
                        <h3 className="font-bold text-slate-800 dark:text-slate-200 border-b dark:border-slate-800 pb-1">Liquidación al Analista (Valores Netos)</h3>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 bg-slate-50 dark:bg-slate-900 p-4 rounded border dark:border-slate-800">
                            <div>
                                <label className="block text-xs font-bold text-blue-700 dark:text-blue-400 mb-1">Monto Gestión</label>
                                <input type="number" name="montoGestion" value={formData.montoGestion || 0} onChange={handleChange} className={`${inputClass} text-right`} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-blue-700 dark:text-blue-400 mb-1">Plus Ahorro</label>
                                <input type="number" name="plusPorAhorro" value={formData.plusPorAhorro || 0} onChange={handleChange} className={`${inputClass} text-right`} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-blue-700 dark:text-blue-400 mb-1">Ahorro a Pagar</label>
                                <input type="number" name="ahorroAPagar" value={formData.ahorroAPagar || 0} onChange={handleChange} className={`${inputClass} text-right`} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-blue-700 dark:text-blue-400 mb-1">Viáticos</label>
                                <input type="number" name="viaticosAPagar" value={formData.viaticosAPagar || 0} onChange={handleChange} className={`${inputClass} text-right`} />
                            </div>
                            <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded text-center border dark:border-blue-800">
                                <label className="block text-xs font-bold text-blue-800 dark:text-blue-300">TOTAL</label>
                                <div className="font-bold text-lg text-slate-800 dark:text-blue-100">
                                    ${(Number(formData.montoGestion || 0) + Number(formData.ahorroAPagar || 0) + Number(formData.viaticosAPagar || 0)).toLocaleString('es-AR')}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* SECCIÓN 4: PAGO ANALISTA */}
                    <div className="space-y-4 md:col-span-2">
                        <h3 className="font-bold text-slate-800 dark:text-slate-200 border-b dark:border-slate-800 pb-1">Estado de Pago (Analista)</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className={labelClass}>Estado Pago</label>
                                <select
                                    name="estadoPago"
                                    value={formData.estadoPago || 'IMPAGO'}
                                    onChange={handleChange}
                                    className={`${selectClass} font-bold ${formData.estadoPago === 'PAGO' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                                >
                                    <option value="IMPAGO">IMPAGO</option>
                                    <option value="PAGO">PAGO</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>Fecha Pago</label>
                                <input
                                    type="date"
                                    name="fechaPagoAnalista"
                                    value={formData.fechaPagoAnalista || ''}
                                    onChange={handleChange}
                                    disabled={formData.estadoPago !== 'PAGO'}
                                    className={inputClass}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-8 flex justify-end gap-3 pt-4 border-t dark:border-slate-800">
                    <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded">Cancelar</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-blue-700 text-white rounded hover:bg-blue-800 flex items-center gap-2 shadow-sm">
                        <Save size={18} /> Guardar Cambios
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EditInvoiceModal; const { updateInvoice, analysts } = useInvoiceStore();
const [formData, setFormData] = useState({ ...invoice });

useEffect(() => {
    setFormData({ ...invoice });
}, [invoice]);

const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
};

const handleSave = () => {
    // Validation / Defaults
    const finalData = { ...formData };

    // Ensure numbers
    finalData.monto = finalData.monto; // Keep string for invoice amount? Yes usually.
    finalData.montoGestion = Number(finalData.montoGestion) || 0;
    finalData.plusPorAhorro = Number(finalData.plusPorAhorro) || 0;
    finalData.ahorroAPagar = Number(finalData.ahorroAPagar) || 0;
    finalData.viaticosAPagar = Number(finalData.viaticosAPagar) || 0;

    // Date default logic
    if (finalData.estadoPago === 'PAGO' && !finalData.fechaPagoAnalista) {
        const today = new Date().toISOString().split('T')[0];
        finalData.fechaPagoAnalista = today;
    }

    // Recalc total done in store or display? Store does it on updateInvoice.

    updateInvoice(invoice.id, finalData);
    onClose();
};

if (!invoice) return null;

return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 shadow-xl">
            <div className="flex justify-between items-center mb-6 border-b pb-2">
                <h2 className="text-xl font-bold text-[#1d2e3f]">Editar Factura / Liquidación</h2>
                <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                    <X size={24} />
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* SECCIÓN 1: DATOS FACTURA */}
                <div className="space-y-4">
                    <h3 className="font-bold text-[#355071] border-b pb-1">Datos de Factura</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-700">Nro Factura</label>
                            <input name="nroFactura" value={formData.nroFactura || ''} onChange={handleChange} className="border p-2 rounded w-full" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700">Siniestro</label>
                            <input name="siniestro" value={formData.siniestro || ''} onChange={handleChange} className="border p-2 rounded w-full" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700">Aseguradora</label>
                            <input name="aseguradora" value={formData.aseguradora || ''} onChange={handleChange} className="border p-2 rounded w-full" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700">Emisor</label>
                            <input name="emisor" value={formData.emisor || ''} onChange={handleChange} className="border p-2 rounded w-full" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700">Monto Factura</label>
                            <input name="monto" value={formData.monto || ''} onChange={handleChange} className="border p-2 rounded w-full text-right" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700">Fecha Emisión</label>
                            <input name="fecha" value={formData.fecha || ''} onChange={handleChange} className="border p-2 rounded w-full" placeholder="DD/MM/AAAA" />
                        </div>
                    </div>
                </div>

                {/* SECCIÓN 2: GESTIÓN */}
                <div className="space-y-4">
                    <h3 className="font-bold text-[#355071] border-b pb-1">Gestión y Resultados</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-700">Analista</label>
                            <select name="analista" value={formData.analista || ''} onChange={handleChange} className="border p-2 rounded w-full bg-white">
                                <option value="">Seleccionar...</option>
                                {analysts.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700">Resultado</label>
                            <select name="resultado" value={formData.resultado || ''} onChange={handleChange} className="border p-2 rounded w-full">
                                <option value="">...</option>
                                <option value="SIN INDICIOS">SIN INDICIOS</option>
                                <option value="RECHAZO">RECHAZO</option>
                                <option value="DESISTIDO">DESISTIDO</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700">Estado Cobro (Aseguradora)</label>
                            <select name="estadoDeCobro" value={formData.estadoDeCobro || 'NO COBRADO'} onChange={handleChange} className="border p-2 rounded w-full font-bold">
                                <option value="NO COBRADO">NO COBRADO</option>
                                <option value="COBRADO">COBRADO</option>
                            </select>
                        </div>
                        {/* Dias Cobro / Fecha Pago logic is handled by store logic usually, but here we clarify */}
                    </div>
                </div>

                {/* SECCIÓN 3: LIQUIDACIÓN */}
                <div className="space-y-4 md:col-span-2">
                    <h3 className="font-bold text-[#355071] border-b pb-1">Liquidación al Analista (Valores Netos)</h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 bg-gray-50 p-4 rounded">
                        <div>
                            <label className="block text-xs font-bold text-blue-800">Monto Gestión</label>
                            <input type="number" name="montoGestion" value={formData.montoGestion || 0} onChange={handleChange} className="border p-2 rounded w-full text-right" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-blue-800">Plus Ahorro</label>
                            <input type="number" name="plusPorAhorro" value={formData.plusPorAhorro || 0} onChange={handleChange} className="border p-2 rounded w-full text-right" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-blue-800">Ahorro a Pagar</label>
                            <input type="number" name="ahorroAPagar" value={formData.ahorroAPagar || 0} onChange={handleChange} className="border p-2 rounded w-full text-right" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-blue-800">Viáticos</label>
                            <input type="number" name="viaticosAPagar" value={formData.viaticosAPagar || 0} onChange={handleChange} className="border p-2 rounded w-full text-right" />
                        </div>
                        <div className="bg-blue-100 p-2 rounded text-center">
                            <label className="block text-xs font-bold text-blue-800">TOTAL</label>
                            <div className="font-bold text-lg text-[#355071]">
                                ${(Number(formData.montoGestion || 0) + Number(formData.ahorroAPagar || 0) + Number(formData.viaticosAPagar || 0)).toLocaleString('es-AR')}
                            </div>
                        </div>
                    </div>
                </div>

                {/* SECCIÓN 4: PAGO ANALISTA */}
                <div className="space-y-4 md:col-span-2">
                    <h3 className="font-bold text-[#355071] border-b pb-1">Estado de Pago (Analista)</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-700">Estado Pago</label>
                            <select name="estadoPago" value={formData.estadoPago || 'IMPAGO'} onChange={handleChange} className={`border p-2 rounded w-full font-bold ${formData.estadoPago === 'PAGO' ? 'text-green-700' : 'text-red-700'}`}>
                                <option value="IMPAGO">IMPAGO</option>
                                <option value="PAGO">PAGO</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700">Fecha Pago</label>
                            <input type="date" name="fechaPagoAnalista" value={formData.fechaPagoAnalista || ''} onChange={handleChange} disabled={formData.estadoPago !== 'PAGO'} className="border p-2 rounded w-full" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-8 flex justify-end gap-3 pt-4 border-t">
                <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancelar</button>
                <button onClick={handleSave} className="px-4 py-2 bg-[#355071] text-white rounded hover:bg-[#2c425e] flex items-center gap-2">
                    <Save size={18} /> Guardar Cambios
                </button>
            </div>
        </div>
    </div>
);
};

export default EditInvoiceModal;
