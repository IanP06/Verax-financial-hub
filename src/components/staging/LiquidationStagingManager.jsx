
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Plus, Trash, AlertTriangle, CheckCircle, FileText } from 'lucide-react';
import useInvoiceStore from '../../store/useInvoiceStore';

const LiquidationStagingManager = ({ liquidationId, onBack, onComplete }) => {
    const { liquidations, analysts, postLiquidation, config, fetchLiquidations } = useInvoiceStore();
    const [liquidation, setLiquidation] = useState(null);
    const [items, setItems] = useState([]);

    // Form State
    const [newItem, setNewItem] = useState({
        siniestro: '',
        analystName: '',
        aseguradora: '',
        montoFactura: '',
        fechaEmision: new Date().toISOString().slice(0, 10), // Default to today or liquidation date
        totalAPagarAnalista: ''
    });

    useEffect(() => {
        // Find existing liquidation in store or fetch
        // Assuming fetchLiquidations is called by parent or we call it.
        // For draft flow, it might be in 'liquidations' store if listener is active, 
        // OR we might need to fetch it once if not posted yet (but `saveLiquidationDraft` puts it in DB).
        // Let's rely on store 'liquidations' if subscribed.
        const found = liquidations.find(l => l.id === liquidationId);
        if (found) {
            setLiquidation(found);
            // If it had pre-filled items they should be loaded here? 
            // Current model: 2 separate collections. 
            // If "Draft" only possesses header, items are purely local until POST?
            // "Staging Manual" implies we build it locally then commit.
        }
    }, [liquidations, liquidationId]);

    const handleAddItem = () => {
        if (!newItem.siniestro || !newItem.analystName) return alert("Siniestro y Analista son obligatorios");

        const itemPayload = {
            id: Date.now().toString(), // Temp ID
            siniestro: newItem.siniestro,
            analystName: newItem.analystName,
            aseguradora: newItem.aseguradora,
            montoFactura: Number(newItem.montoFactura) || 0,
            totalAPagarAnalista: Number(newItem.totalAPagarAnalista) || 0,
            fechaEmision: newItem.fechaEmision, // Should be saved as Timestamp on confirm? Store expects Date object or Timestamp? 
            // Store `postLiquidation` handles it? 
            // Just satisfy UI for now.
            estadoPago: 'IMPAGO',
            estadoCobro: 'NO_COBRADO'
        };

        setItems([...items, itemPayload]);
        setNewItem({ ...newItem, siniestro: '', montoFactura: '', totalAPagarAnalista: '' }); // Keep Analyst/Aseguradora? Maybe reset.
    };

    const handleRemoveItem = (id) => {
        setItems(items.filter(i => i.id !== id));
    };

    const handlePost = async () => {
        if (!liquidation) return;
        if (items.length === 0) return alert("Ingrese al menos un ítem");

        const confirmText = `Confirmar Orden con ${items.length} ítems? \nEsto creará las facturas para los analistas.`;
        if (!window.confirm(confirmText)) return;

        // Formato Fecha: YYYY-MM-DD (Input) -> DD/MM/YYYY (System Standard)
        const formatDateForSystem = (isoDate) => {
            if (!isoDate) return "";
            const [y, m, d] = isoDate.split('-'); // 2024-01-31
            return `${d}/${m}/${y}`;
        };

        // Remove temp IDs
        const finalItems = items.map(({ id, ...rest }) => ({
            ...rest,
            fechaEmision: formatDateForSystem(rest.fechaEmision),
            fecha: formatDateForSystem(rest.fechaEmision), // Redundancy for normalizer compatibility
            // Ensure types
            montoFactura: Number(rest.montoFactura),
            totalAPagarAnalista: Number(rest.totalAPagarAnalista)
        }));

        const result = await postLiquidation(liquidation, finalItems);
        if (result.success) {
            alert("Orden de Liquidación Publicada Correctamente");
            onComplete();
        } else {
            alert("Error: " + result.error);
        }
    };

    const totalItemsAmount = items.reduce((acc, curr) => acc + (Number(curr.montoFactura) || 0), 0);
    const totalPayable = items.reduce((acc, curr) => acc + (Number(curr.totalAPagarAnalista) || 0), 0);

    return (
        <div className="bg-white dark:bg-slate-900 min-h-screen p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 border-b pb-4 dark:border-slate-700">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full">
                        <ArrowLeft />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold dark:text-gray-100">
                            {liquidation?.title || "Cargando..."}
                        </h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {liquidationId} • {items.length} Ítems cargados
                        </p>
                    </div>
                </div>
                <div className="flex gap-3">
                    {liquidation?.pdfUrl && (
                        <a
                            href={liquidation.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 px-3 py-2 border rounded"
                        >
                            <FileText size={18} /> Ver PDF
                        </a>
                    )}
                    <button
                        onClick={handlePost}
                        className="bg-green-600 text-white px-6 py-2 rounded font-bold hover:bg-green-700 shadow flex items-center gap-2"
                    >
                        <CheckCircle size={18} /> CONFIRMAR Y PUBLICAR
                    </button>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Formulario de Carga */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-gray-50 dark:bg-slate-800 p-4 rounded-lg shadow border dark:border-slate-700">
                        <h3 className="font-bold mb-4 text-gray-700 dark:text-gray-200">Nuevo Ítem (Siniestro)</h3>

                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Analista</label>
                                <select
                                    className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                    value={newItem.analystName}
                                    onChange={e => setNewItem({ ...newItem, analystName: e.target.value })}
                                >
                                    <option value="">Seleccionar...</option>
                                    {analysts.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Aseguradora</label>
                                <input
                                    type="text"
                                    className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                    value={newItem.aseguradora}
                                    onChange={e => setNewItem({ ...newItem, aseguradora: e.target.value })}
                                    list="aseguradoras-list"
                                />
                                <datalist id="aseguradoras-list">
                                    {config?.validAseguradoras?.map(a => <option key={a.nombre} value={a.nombre} />)}
                                </datalist>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Nro Siniestro</label>
                                <input
                                    type="text"
                                    className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white font-mono"
                                    value={newItem.siniestro}
                                    onChange={e => setNewItem({ ...newItem, siniestro: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase">Monto Facturado ($)</label>
                                    <input
                                        type="number"
                                        className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white text-right"
                                        value={newItem.montoFactura}
                                        onChange={e => setNewItem({ ...newItem, montoFactura: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-blue-600 uppercase">A Pagar Analista ($)</label>
                                    <input
                                        type="number"
                                        className="w-full p-2 border-2 border-blue-100 rounded dark:bg-slate-700 dark:border-blue-900 dark:text-white text-right font-bold"
                                        value={newItem.totalAPagarAnalista}
                                        onChange={e => setNewItem({ ...newItem, totalAPagarAnalista: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Fecha Emisión</label>
                                <input
                                    type="date"
                                    className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                    value={newItem.fechaEmision}
                                    onChange={e => setNewItem({ ...newItem, fechaEmision: e.target.value })}
                                />
                            </div>

                            <button
                                onClick={handleAddItem}
                                className="w-full bg-blue-600 text-white p-2 rounded font-bold hover:bg-blue-700 mt-2 flex justify-center items-center gap-2"
                            >
                                <Plus size={18} /> Agregar Ítem
                            </button>
                        </div>
                    </div>

                    {/* Totales Resumen */}
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow border dark:border-slate-700">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-gray-500">Total Facturado</span>
                            <span className="font-bold text-lg dark:text-gray-200">${totalItemsAmount.toLocaleString('es-AR')}</span>
                        </div>
                        <div className="flex justify-between items-center text-blue-600 dark:text-blue-400">
                            <span className="font-bold">Total a Pagar Analistas</span>
                            <span className="font-bold text-xl">${totalPayable.toLocaleString('es-AR')}</span>
                        </div>
                    </div>
                </div>

                {/* Tabla de Items */}
                <div className="lg:col-span-2">
                    <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden border dark:border-slate-700">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-gray-200 uppercase text-xs font-bold">
                                <tr>
                                    <th className="p-3">Analista</th>
                                    <th className="p-3">Siniestro</th>
                                    <th className="p-3">Aseguradora</th>
                                    <th className="p-3 text-right">Monto</th>
                                    <th className="p-3 text-right">A Pagar</th>
                                    <th className="p-3 text-center">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                                {items.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-gray-400">
                                            Sin ítems cargados. Agregue el primero desde el formulario.
                                        </td>
                                    </tr>
                                ) : (
                                    items.map((item, idx) => (
                                        <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-slate-700 transition">
                                            <td className="p-3 font-medium dark:text-white">{item.analystName}</td>
                                            <td className="p-3 font-mono text-gray-600 dark:text-gray-300">{item.siniestro}</td>
                                            <td className="p-3 dark:text-gray-300">{item.aseguradora}</td>
                                            <td className="p-3 text-right numbers dark:text-gray-300">${item.montoFactura}</td>
                                            <td className="p-3 text-right font-bold text-blue-600 dark:text-blue-400">${item.totalAPagarAnalista}</td>
                                            <td className="p-3 text-center">
                                                <button
                                                    onClick={() => handleRemoveItem(item.id)}
                                                    className="text-red-400 hover:text-red-600 p-1"
                                                >
                                                    <Trash size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default LiquidationStagingManager;
