import React, { useState } from 'react';
import { X, CheckCircle, AlertCircle, FileText, Search, Loader } from 'lucide-react';
import useInvoiceStore from '../../store/useInvoiceStore';

const BulkChargeModal = ({ onClose }) => {
    const { config, previewBulkCobroByEmisor, confirmBulkCobroByEmisor } = useInvoiceStore();
    const [step, setStep] = useState(1); // 1: Input, 2: Preview
    const [selectedEmisorName, setSelectedEmisorName] = useState('');
    const [invoiceNumbersText, setInvoiceNumbersText] = useState('');
    const [fechaCobro, setFechaCobro] = useState(new Date().toISOString().split('T')[0]);
    const [previewData, setPreviewData] = useState(null);
    const [loading, setLoading] = useState(false);

    // Helpers
    const getEmisorLabel = (e) => {
        // Find if any custom Alias is CUIT-like
        // Actually, 'cuit' field is not directly in emisor object in `validEmisores` seed based on reading code...
        // Wait, looking at Settings.jsx, validEmisores has { nombre, alias: [] }. 
        // It does NOT have a top-level 'cuit' field. The user prompt says "alias de Detección (Texto PDF) = CUIT".
        // SO checking if there is a CUIT-like string in alias array.
        const cuitAlias = e.alias?.find(a => /^\d{11}$/.test(a.replace(/-/g, '')));
        return `${e.nombre} (${cuitAlias || 'S/C'})`;
    };

    const handlePreview = async () => {
        if (!selectedEmisorName) return alert("Selecciona un emisor.");
        if (!invoiceNumbersText.trim()) return alert("Ingresa números de factura.");

        setLoading(true);
        // FIX: Parse logic as requested
        const rawTokens = invoiceNumbersText.match(/\d+/g) || [];
        // Normalize: parseInt to remove leading zeros, then String
        const normalizedNumbers = [...new Set(rawTokens.map(t => String(parseInt(t, 10))))];

        if (normalizedNumbers.length === 0) {
            setLoading(false);
            return alert("No se encontraron números válidos.");
        }

        const result = await previewBulkCobroByEmisor({
            emisorName: selectedEmisorName,
            invoiceNumbers: normalizedNumbers
        });

        setPreviewData(result);
        setStep(2);
        setLoading(false);
    };

    const handleConfirm = async () => {
        if (!previewData || previewData.toCharge.length === 0) return;

        if (!window.confirm(`¿Confirmás marcar como COBRADAS ${previewData.toCharge.length} facturas del emisor ${selectedEmisorName} con fecha ${fechaCobro}?`)) {
            return;
        }

        setLoading(true);
        // Only valid ones
        const ids = previewData.toCharge.map(i => i.id);
        const res = await confirmBulkCobroByEmisor({
            docIds: ids, // Pass IDs directly to be safe
            fechaCobro
        });

        setLoading(false);
        if (res.success) {
            alert(`Éxito: Se actualizaron ${res.count} facturas.`);
            onClose();
        } else {
            alert(`Error: ${res.message}`);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 flex flex-col max-h-[90vh]">

                {/* HEAD */}
                <div className="p-4 border-b dark:border-slate-700 flex justify-between items-center bg-gray-50 dark:bg-slate-800 rounded-t-lg">
                    <h3 className="text-lg font-bold text-[#355071] dark:text-blue-300 flex items-center gap-2">
                        <FileText size={20} /> Cobro Masivo por Emisor
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                        <X size={24} />
                    </button>
                </div>

                {/* BODY */}
                <div className="p-6 overflow-y-auto flex-1">
                    {step === 1 && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">1. Seleccionar Emisor</label>
                                <select
                                    className="w-full border p-2 rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                                    value={selectedEmisorName}
                                    onChange={e => setSelectedEmisorName(e.target.value)}
                                >
                                    <option value="">-- Seleccionar --</option>
                                    {config?.validEmisores?.map((e, idx) => (
                                        <option key={idx} value={e.nombre}>
                                            {getEmisorLabel(e)}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs text-gray-400 mt-1">Se mostrará el CUIT detectado en los alias del emisor.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">2. Fecha de Cobro</label>
                                <input
                                    type="date"
                                    className="w-full border p-2 rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                                    value={fechaCobro}
                                    onChange={e => setFechaCobro(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">3. Números de Factura</label>
                                <textarea
                                    className="w-full border p-2 rounded h-40 font-mono text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                                    placeholder={`976, 977, 978\n979 980`}
                                    value={invoiceNumbersText}
                                    onChange={e => setInvoiceNumbersText(e.target.value)}
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Acepta coma, espacio o salto de línea. Se normalizan automáticamente.</p>
                            </div>
                        </div>
                    )}

                    {step === 2 && previewData && (
                        <div className="space-y-6">
                            {/* Summary Cards */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-green-50 dark:bg-green-900/30 p-3 rounded border border-green-200 dark:border-green-800 text-center">
                                    <div className="text-2xl font-bold text-green-700 dark:text-green-400">{previewData.toCharge.length}</div>
                                    <div className="text-xs font-bold text-green-800 dark:text-green-300">A COBRAR</div>
                                </div>
                                <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded border border-blue-200 dark:border-blue-800 text-center">
                                    <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">{previewData.alreadyPaid.length}</div>
                                    <div className="text-xs font-bold text-blue-800 dark:text-blue-300">YA COBRADAS</div>
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700 text-center">
                                    <div className="text-2xl font-bold text-gray-700 dark:text-gray-400">{previewData.notFound.length}</div>
                                    <div className="text-xs font-bold text-gray-600 dark:text-gray-500">NO ENCONTRADAS</div>
                                </div>
                            </div>

                            {/* Tables */}
                            {previewData.toCharge.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-bold text-green-700 dark:text-green-400 mb-2 border-b">Detalle A Cobrar</h4>
                                    <div className="max-h-48 overflow-y-auto text-xs border rounded dark:border-slate-700">
                                        <table className="w-full text-left bg-white dark:bg-slate-800 select-text">
                                            <thead>
                                                <tr className="bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300">
                                                    <th className="p-2">Factura</th>
                                                    <th className="p-2">Siniestro</th>
                                                    <th className="p-2 text-right">Monto</th>
                                                    <th className="p-2">Emisión</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {previewData.toCharge.map(inv => (
                                                    <tr key={inv.id} className="border-b dark:border-slate-700">
                                                        <td className="p-2 font-bold dark:text-white">{inv.nroFactura}</td>
                                                        <td className="p-2 dark:text-gray-300">{inv.siniestro}</td>
                                                        <td className="p-2 text-right dark:text-gray-300">${inv.monto}</td>
                                                        <td className="p-2 dark:text-gray-400">{inv.fecha}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {(previewData.notFound.length > 0 || previewData.duplicated.length > 0) && (
                                <div className="text-xs space-y-2">
                                    {previewData.notFound.length > 0 && (
                                        <div className="p-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded">
                                            <strong>No Encontradas ({previewData.notFound.length}):</strong> {previewData.notFound.join(', ')}
                                        </div>
                                    )}
                                    {previewData.duplicated.length > 0 && (
                                        <div className="p-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded">
                                            <strong>Duplicadas en Input:</strong> {previewData.duplicated.join(', ')}
                                        </div>
                                    )}
                                </div>
                            )}

                            {previewData.toCharge.length === 0 && (
                                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded flex items-center gap-2">
                                    <AlertCircle size={20} />
                                    <span>No hay facturas válidas para cobrar en esta selección.</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* FOOTER */}
                <div className="p-4 border-t dark:border-slate-700 bg-gray-50 dark:bg-slate-800 rounded-b-lg flex justify-end gap-2">
                    {step === 1 ? (
                        <>
                            <button onClick={onClose} className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800">Cancelar</button>
                            <button
                                onClick={handlePreview}
                                disabled={loading || !selectedEmisorName || !invoiceNumbersText}
                                className="bg-[#355071] text-white px-4 py-2 rounded hover:bg-[#2c425e] flex items-center gap-2 disabled:opacity-50"
                            >
                                {loading && <Loader className="animate-spin" size={16} />}
                                Previsualizar
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={() => setStep(1)} className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800">Atrás</button>
                            <button
                                onClick={handleConfirm}
                                disabled={loading || previewData.toCharge.length === 0}
                                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 flex items-center gap-2 disabled:opacity-50"
                            >
                                {loading && <Loader className="animate-spin" size={16} />}
                                Confirmar Cobro Masivo
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BulkChargeModal;
