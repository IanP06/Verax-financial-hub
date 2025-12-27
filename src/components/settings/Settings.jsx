import React, { useState, useEffect } from 'react';
import { Trash, Plus, User, Settings as SettingsIcon, Save, Clock } from 'lucide-react';
import useInvoiceStore from '../../store/useInvoiceStore';

const Settings = () => {
    const { analysts, addAnalyst, removeAnalyst, config, updateConfig } = useInvoiceStore();
    const [newAnalyst, setNewAnalyst] = useState('');
    const [localConfig, setLocalConfig] = useState(null);

    useEffect(() => {
        if (config) {
            setLocalConfig(JSON.parse(JSON.stringify(config)));
        }
    }, [config]);

    const handleSaveConfig = () => {
        updateConfig(localConfig);
        alert("Configuración guardada correctamente.");
    };

    const handleAddAnalyst = () => {
        if (newAnalyst.trim()) {
            addAnalyst(newAnalyst.trim());
            setNewAnalyst('');
        }
    };

    const handleAsegChange = (aseg, field, value) => {
        setLocalConfig(prev => ({
            ...prev,
            aseguradoras: {
                ...prev.aseguradoras,
                [aseg]: {
                    ...prev.aseguradoras[aseg],
                    [field]: parseInt(value) || 0
                }
            }
        }));
    };

    if (!localConfig) return <div className="p-6">Cargando configuración...</div>;

    const aseguradorasList = ['SANCOR', 'PROVINCIA', 'ATM', 'AMCA', 'OTRA'];

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-8">
            <h1 className="text-2xl font-bold text-[#355071] flex items-center gap-2">
                <SettingsIcon /> Configuración del Sistema
            </h1>

            {/* SECCION 1: PARAMETROS FINANCIEROS */}
            <section className="bg-white p-6 rounded shadow border-l-4 border-blue-600">
                <h2 className="text-lg font-bold text-[#1d2e3f] mb-4 flex items-center gap-2">
                    <SettingsIcon size={20} /> Parámetros Globales
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Monto Gestión Default</label>
                        <div className="flex items-center gap-2">
                            <span className="text-gray-500 font-bold">$</span>
                            <input
                                type="number"
                                value={localConfig.montoGestion}
                                onChange={(e) => setLocalConfig({ ...localConfig, montoGestion: parseInt(e.target.value) || 0 })}
                                className="border p-2 rounded w-full"
                            />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Valor inicial para nuevas facturas.</p>
                    </div>
                </div>
            </section>

            {/* SECCION 2: COMPAÑIAS (SEEDS) */}
            <section className="bg-white p-6 rounded shadow border-l-4 border-amber-500">
                <h2 className="text-lg font-bold text-[#1d2e3f] mb-4 flex items-center gap-2">
                    <Clock size={20} /> Compañías & Plazos (Seeds)
                </h2>
                <div className="overflow-x-auto mb-4">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-[#355071]">
                            <tr>
                                <th className="p-3">CUIT</th>
                                <th className="p-3">Nombre</th>
                                <th className="p-3">Días Pago</th>
                                <th className="p-3">Tolerancia</th>
                                <th className="p-3">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {localConfig.validAseguradoras?.map((aseg, idx) => (
                                <tr key={idx} className="border-b">
                                    <td className="p-2">
                                        <input
                                            value={aseg.cuit}
                                            onChange={e => {
                                                const list = [...localConfig.validAseguradoras];
                                                list[idx].cuit = e.target.value;
                                                setLocalConfig({ ...localConfig, validAseguradoras: list });
                                            }}
                                            className="border rounded p-1 w-28"
                                            placeholder="30-..."
                                        />
                                    </td>
                                    <td className="p-2">
                                        <input
                                            value={aseg.nombre}
                                            onChange={e => {
                                                const list = [...localConfig.validAseguradoras];
                                                list[idx].nombre = e.target.value.toUpperCase();
                                                setLocalConfig({ ...localConfig, validAseguradoras: list });
                                            }}
                                            className="border rounded p-1 w-full font-bold"
                                        />
                                    </td>
                                    <td className="p-2">
                                        <input
                                            type="number"
                                            value={aseg.dias}
                                            onChange={e => {
                                                const list = [...localConfig.validAseguradoras];
                                                list[idx].dias = parseInt(e.target.value) || 0;
                                                setLocalConfig({ ...localConfig, validAseguradoras: list });
                                            }}
                                            className="border rounded p-1 w-16 text-center"
                                        />
                                    </td>
                                    <td className="p-2">
                                        <input
                                            type="number"
                                            value={aseg.tolerancia}
                                            onChange={e => {
                                                const list = [...localConfig.validAseguradoras];
                                                list[idx].tolerancia = parseInt(e.target.value) || 0;
                                                setLocalConfig({ ...localConfig, validAseguradoras: list });
                                            }}
                                            className="border rounded p-1 w-16 text-center"
                                        />
                                    </td>
                                    <td className="p-2 text-center">
                                        <button
                                            onClick={() => {
                                                const list = localConfig.validAseguradoras.filter((_, i) => i !== idx);
                                                setLocalConfig({ ...localConfig, validAseguradoras: list });
                                            }}
                                            className="text-red-500 hover:text-red-700"
                                        >
                                            <Trash size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <button
                    onClick={() => setLocalConfig({
                        ...localConfig,
                        validAseguradoras: [...(localConfig.validAseguradoras || []), { cuit: '', nombre: 'NUEVA', dias: 30, tolerancia: 3 }]
                    })}
                    className="flex items-center gap-1 text-sm bg-amber-100 text-amber-800 px-3 py-1 rounded hover:bg-amber-200"
                >
                    <Plus size={16} /> Agregar Compañía
                </button>
            </section>

            {/* SECCION 3: EMISORES (SEEDS) */}
            <section className="bg-white p-6 rounded shadow border-l-4 border-purple-500">
                <h2 className="text-lg font-bold text-[#1d2e3f] mb-4 flex items-center gap-2">
                    <User size={20} /> Emisores & Alias (Seeds)
                </h2>
                <div className="overflow-x-auto mb-4">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-[#355071]">
                            <tr>
                                <th className="p-3">Nombre Corto (ID)</th>
                                <th className="p-3">Alias de Detección (Texto PDF)</th>
                                <th className="p-3">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {localConfig.validEmisores?.map((emisor, idx) => (
                                <tr key={idx} className="border-b">
                                    <td className="p-2">
                                        <input
                                            value={emisor.nombre}
                                            onChange={e => {
                                                const list = [...localConfig.validEmisores];
                                                list[idx].nombre = e.target.value.toUpperCase();
                                                setLocalConfig({ ...localConfig, validEmisores: list });
                                            }}
                                            className="border rounded p-1 w-32 font-bold"
                                        />
                                    </td>
                                    <td className="p-2">
                                        <input
                                            value={emisor.alias?.join(', ')}
                                            onChange={e => {
                                                const list = [...localConfig.validEmisores];
                                                list[idx].alias = e.target.value.split(',').map(s => s.trim());
                                                setLocalConfig({ ...localConfig, validEmisores: list });
                                            }}
                                            className="border rounded p-1 w-full text-xs"
                                            placeholder="Separa con comas..."
                                        />
                                    </td>
                                    <td className="p-2 text-center">
                                        <button
                                            onClick={() => {
                                                const list = localConfig.validEmisores.filter((_, i) => i !== idx);
                                                setLocalConfig({ ...localConfig, validEmisores: list });
                                            }}
                                            className="text-red-500 hover:text-red-700"
                                        >
                                            <Trash size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <button
                    onClick={() => setLocalConfig({
                        ...localConfig,
                        validEmisores: [...(localConfig.validEmisores || []), { nombre: 'NUEVO', cuit: '', alias: [] }]
                    })}
                    className="flex items-center gap-1 text-sm bg-purple-100 text-purple-800 px-3 py-1 rounded hover:bg-purple-200"
                >
                    <Plus size={16} /> Agregar Emisor
                </button>
            </section>

            {/* SECCION 3: ANALISTAS */}
            <section className="bg-white p-6 rounded shadow border-l-4 border-green-600">
                <h2 className="text-lg font-bold text-[#1d2e3f] mb-4 flex items-center gap-2">
                    <User size={20} /> Gestión de Analistas
                </h2>
                <div className="flex gap-2 mb-6">
                    <input
                        type="text"
                        value={newAnalyst}
                        onChange={(e) => setNewAnalyst(e.target.value)}
                        placeholder="Nombre del nuevo analista..."
                        className="flex-1 border p-2 rounded"
                    />
                    <button
                        onClick={handleAddAnalyst}
                        className="bg-[#355071] text-white px-4 py-2 rounded hover:bg-[#2c425e]"
                    >
                        <Plus size={20} />
                    </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {analysts.map((name) => (
                        <div key={name} className="flex justify-between items-center p-2 bg-gray-50 rounded border text-sm">
                            <span className="font-medium text-[#1d2e3f] truncate">{name}</span>
                            <button
                                onClick={() => removeAnalyst(name)}
                                className="text-[#d13737] hover:bg-red-50 p-1 rounded"
                            >
                                <Trash size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            </section>

            <div className="fixed bottom-6 right-6">
                <button
                    onClick={handleSaveConfig}
                    className="bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 flex items-center gap-2 transition-transform hover:scale-105"
                >
                    <Save size={24} /> <span className="font-bold">Guardar Todo</span>
                </button>
            </div>
        </div>
    );
};

export default Settings;
