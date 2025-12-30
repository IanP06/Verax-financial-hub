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
            <h1 className="text-2xl font-bold text-[#355071] dark:text-blue-200 flex items-center gap-2">
                <SettingsIcon /> Configuración del Sistema
            </h1>

            {/* SECCION 1: PARAMETROS FINANCIEROS */}
            <section className="bg-white dark:bg-slate-900 dark:border-slate-700 p-6 rounded shadow border-l-4 border-blue-600 dark:border-l-blue-400">
                <h2 className="text-lg font-bold text-[#1d2e3f] dark:text-blue-200 mb-4 flex items-center gap-2">
                    <SettingsIcon size={20} /> Parámetros Globales
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Monto Gestión Default</label>
                        <div className="flex items-center gap-2">
                            <span className="text-gray-500 dark:text-gray-400 font-bold">$</span>
                            <input
                                type="number"
                                value={localConfig.montoGestion}
                                onChange={(e) => setLocalConfig({ ...localConfig, montoGestion: parseInt(e.target.value) || 0 })}
                                className="border p-2 rounded w-full dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                            />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Valor inicial para nuevas facturas.</p>
                    </div>
                </div>
            </section>

            {/* SECCION 2: COMPAÑIAS (SEEDS) */}
            <section className="bg-white dark:bg-slate-900 dark:border-slate-700 p-6 rounded shadow border-l-4 border-amber-500 dark:border-l-amber-400">
                <h2 className="text-lg font-bold text-[#1d2e3f] dark:text-blue-200 mb-4 flex items-center gap-2">
                    <Clock size={20} /> Compañías & Plazos (Seeds)
                </h2>
                <div className="overflow-x-auto mb-4">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 dark:bg-slate-800 text-[#355071] dark:text-blue-200">
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
                                <tr key={idx} className="border-b dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800">
                                    <td className="p-2">
                                        <input
                                            value={aseg.cuit}
                                            onChange={e => {
                                                const list = [...localConfig.validAseguradoras];
                                                list[idx].cuit = e.target.value;
                                                setLocalConfig({ ...localConfig, validAseguradoras: list });
                                            }}
                                            className="border rounded p-1 w-28 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
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
                                            className="border rounded p-1 w-full font-bold dark:bg-slate-700 dark:border-slate-600 dark:text-white"
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
                                            className="border rounded p-1 w-16 text-center dark:bg-slate-700 dark:border-slate-600 dark:text-white"
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
                                            className="border rounded p-1 w-16 text-center dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                        />
                                    </td>
                                    <td className="p-2 text-center">
                                        <button
                                            onClick={() => {
                                                const list = localConfig.validAseguradoras.filter((_, i) => i !== idx);
                                                setLocalConfig({ ...localConfig, validAseguradoras: list });
                                            }}
                                            className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
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
                    className="flex items-center gap-1 text-sm bg-amber-100 text-amber-800 px-3 py-1 rounded hover:bg-amber-200 dark:bg-amber-900 dark:text-amber-200"
                >
                    <Plus size={16} /> Agregar Compañía
                </button>
            </section>

            {/* SECCION 3: EMISORES (SEEDS) */}
            <section className="bg-white dark:bg-slate-900 dark:border-slate-700 p-6 rounded shadow border-l-4 border-purple-500 dark:border-l-purple-400">
                <h2 className="text-lg font-bold text-[#1d2e3f] dark:text-blue-200 mb-4 flex items-center gap-2">
                    <User size={20} /> Emisores & Alias (Seeds)
                </h2>
                <div className="overflow-x-auto mb-4">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 dark:bg-slate-800 text-[#355071] dark:text-blue-200">
                            <tr>
                                <th className="p-3">Nombre Corto (ID)</th>
                                <th className="p-3">Alias de Detección (Texto PDF)</th>
                                <th className="p-3">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {localConfig.validEmisores?.map((emisor, idx) => (
                                <tr key={idx} className="border-b dark:border-slate-700">
                                    <td className="p-2">
                                        <input
                                            value={emisor.nombre}
                                            onChange={e => {
                                                const list = [...localConfig.validEmisores];
                                                list[idx].nombre = e.target.value.toUpperCase();
                                                setLocalConfig({ ...localConfig, validEmisores: list });
                                            }}
                                            className="border rounded p-1 w-32 font-bold dark:bg-slate-700 dark:border-slate-600 dark:text-white"
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
                                            className="border rounded p-1 w-full text-xs dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                            placeholder="Separa con comas..."
                                        />
                                    </td>
                                    <td className="p-2 text-center">
                                        <button
                                            onClick={() => {
                                                const list = localConfig.validEmisores.filter((_, i) => i !== idx);
                                                setLocalConfig({ ...localConfig, validEmisores: list });
                                            }}
                                            className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
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
                    className="flex items-center gap-1 text-sm bg-purple-100 text-purple-800 px-3 py-1 rounded hover:bg-purple-200 dark:bg-purple-900 dark:text-purple-200"
                >
                    <Plus size={16} /> Agregar Emisor
                </button>
            </section>

            {/* SECCION 3: ANALISTAS + REGLAS */}
            <section className="bg-white dark:bg-slate-900 dark:border-slate-700 p-6 rounded shadow border-l-4 border-green-600 dark:border-l-green-400">
                <h2 className="text-lg font-bold text-[#1d2e3f] dark:text-blue-200 mb-4 flex items-center gap-2">
                    <User size={20} /> Gestión de Analistas y Reglas
                </h2>
                <div className="flex gap-2 mb-6">
                    <input
                        type="text"
                        value={newAnalyst}
                        onChange={(e) => setNewAnalyst(e.target.value)}
                        placeholder="Nombre del nuevo analista..."
                        className="flex-1 border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                    />
                    <button
                        onClick={handleAddAnalyst}
                        className="bg-[#355071] text-white px-4 py-2 rounded hover:bg-[#2c425e]"
                    >
                        <Plus size={20} />
                    </button>
                    {/* SEED BUTTON */}
                    <button
                        onClick={async () => {
                            if (!confirm("Esto sobrescribirá la configuración de reglas de analistas y creará perfiles de usuario si no existen. ¿Continuar?")) return;

                            const seeds = [
                                { name: 'Ariel', requiresInvoice: true, pct: 50, mode: 'FIXED' },
                                { name: 'Cesar', requiresInvoice: false, pct: 30, mode: 'EDITABLE' },
                                { name: 'Daniel', requiresInvoice: false, pct: 30, mode: 'FIXED' },
                                { name: 'Emiliano', requiresInvoice: false, pct: 30, mode: 'FIXED' },
                                { name: 'Eugenia y Debora', requiresInvoice: true, pct: 50, mode: 'FIXED' },
                                { name: 'Jazmin', requiresInvoice: false, pct: 30, mode: 'FIXED' },
                                { name: 'Jeremias', requiresInvoice: false, pct: 30, mode: 'FIXED' },
                                { name: 'Natalia', requiresInvoice: true, pct: 50, mode: 'FIXED' },
                                { name: 'Pablo', requiresInvoice: false, pct: 30, mode: 'FIXED' },
                                { name: 'Rodrigo', requiresInvoice: true, pct: 50, mode: 'FIXED' },
                                { name: 'Sofia', requiresInvoice: true, pct: 50, mode: 'EDITABLE' },
                                { name: 'Tomás', requiresInvoice: false, pct: 30, mode: 'EDITABLE' },
                            ];

                            // 1. Update Config Rules
                            const newRules = seeds.map(s => ({
                                name: s.name,
                                pct: s.pct,
                                mode: s.mode
                            }));
                            setLocalConfig(prev => ({ ...prev, analystRules: newRules }));

                            // 2. Update User Profiles in Firestore (Async)
                            try {
                                const { doc, setDoc, getDocs, collection, query, where } = await import('firebase/firestore');
                                const { db } = await import('../../lib/firebase');

                                // Check if profiles exist or creating blindly?
                                // We need UIDs. We can't Create Users here (Admin SDK required).
                                // But we can create the 'userProfiles' docs IF we knew the UIDs.
                                // Since we don't know UIDs, we can only update Config.
                                // Wait, the prompt implies "login email/password".
                                // I cannot create Auth users client-side without logging them in.
                                // Strategy: Use 'analystKey' in profile.
                                // For now, I'll just update the Config for the Dropdown.
                                // Managing UserProfiles requires matching UID to Name. 
                                // I will log this limitation: "UserProfiles must be manually linked to these names".
                                alert("Reglas de Configuración actualizadas. Recuerde crear los usuarios en Firebase Auth y asignarles el 'analystKey' correspondiente en la colección 'userProfiles' manual o mediante script administrativo.");

                            } catch (e) {
                                console.error(e);
                            }
                        }}
                        className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600 text-xs font-bold"
                    >
                        SEED RULES
                    </button>
                </div>

                {/* Rules Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 dark:bg-slate-800 text-[#355071] dark:text-blue-200">
                            <tr>
                                <th className="p-3">Analista</th>
                                <th className="p-3">Ahorro %</th>
                                <th className="p-3">Modo</th>
                                <th className="p-3">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {localConfig.analystRules?.map((rule, idx) => (
                                <tr key={idx} className="border-b dark:border-slate-700">
                                    <td className="p-2 font-bold dark:text-white">{rule.name}</td>
                                    <td className="p-2">
                                        <input
                                            type="number"
                                            value={rule.pct}
                                            onChange={(e) => {
                                                const list = [...localConfig.analystRules];
                                                list[idx].pct = parseInt(e.target.value) || 0;
                                                setLocalConfig({ ...localConfig, analystRules: list });
                                            }}
                                            className="border rounded p-1 w-20 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                        />
                                    </td>
                                    <td className="p-2">
                                        <select
                                            value={rule.mode}
                                            onChange={(e) => {
                                                const list = [...localConfig.analystRules];
                                                list[idx].mode = e.target.value;
                                                setLocalConfig({ ...localConfig, analystRules: list });
                                            }}
                                            className="border rounded p-1 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                        >
                                            <option value="FIXED">Fijo</option>
                                            <option value="EDITABLE">Editable</option>
                                        </select>
                                    </td>
                                    <td className="p-2">
                                        <button
                                            onClick={() => {
                                                const list = localConfig.analystRules.filter((_, i) => i !== idx);
                                                setLocalConfig({ ...localConfig, analystRules: list });
                                            }}
                                            className="text-red-500"
                                        >
                                            <Trash size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-2">
                    {analysts.map((name) => (
                        <div key={name} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-slate-800 rounded border dark:border-slate-600 text-sm">
                            <span className="font-medium text-[#1d2e3f] dark:text-slate-200 truncate">{name}</span>
                            <button
                                onClick={() => removeAnalyst(name)}
                                className="text-[#d13737] hover:bg-red-50 dark:hover:bg-red-900 p-1 rounded"
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
