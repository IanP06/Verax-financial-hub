import React, { useState, useEffect } from 'react';
import useInvoiceStore from '../../store/useInvoiceStore';
import MasterTable from './MasterTable'; // IMPORTANTE: Importar la tabla
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const Dashboard = () => {
    const { config, fetchDashboardStats, dashboardStats, isDashboardStatsLoading } = useInvoiceStore();
    const [dateRange, setDateRange] = useState({ from: '', to: '' });
    const [selectedCia, setSelectedCia] = useState('');

    const parseDateStr = (dateStr) => {
        if (!dateStr) return new Date();
        const [d, m, y] = dateStr.split('/');
        return new Date(y, m - 1, d);
    };

    // 2. State for Server-Side KPIs
    // Ya no hacemos reducción local ni guardamos estado "stats" aislado en el componente.
    // Usamos el 'dashboardStats' provisto por el store.

    // 3. Effect to Hook up with Store Stats Fetcher
    useEffect(() => {
        fetchDashboardStats({ selectedCia, dateRange });
    }, [selectedCia, dateRange, fetchDashboardStats]);

    const {
        totalFacturado = 0,
        totalLiquidado = 0,
        totalCobrado = 0,
        tasaCobro = 0,
        promedioDias = 0,
        facturasEmitidas = 0,
        promedioDiasDeuda = 0,
        dataEmisor = [],
        dataAseguradora = []
    } = dashboardStats || {};

    const COLORS = ['#355071', '#d13737', '#1d2e3f', '#556b2f'];

    if (isDashboardStatsLoading && !dashboardStats) {
        return (
            <div className="p-6 flex justify-center items-center h-screen">
                <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-[#355071]"></div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-8">
            {/* Header y Filtro Dashboard */}
            <div className="flex justify-between items-end">
                <h1 className="text-2xl font-bold text-[#355071] dark:text-blue-300">Dashboard Financiero</h1>
                <div className="flex gap-2">
                    <select
                        className="border p-2 rounded text-sm w-40 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                        value={selectedCia}
                        onChange={e => setSelectedCia(e.target.value)}
                    >
                        <option value="">Todas las Cías</option>
                        {config?.validAseguradoras?.map(a => <option key={a.nombre} value={a.nombre}>{a.nombre}</option>)}
                    </select>
                    <input type="date" className="border p-2 rounded text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white" onChange={e => setDateRange({ ...dateRange, from: e.target.value })} />
                    <input type="date" className="border p-2 rounded text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white" onChange={e => setDateRange({ ...dateRange, to: e.target.value })} />
                </div>
            </div>

            {/* Tarjetas KPI */}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <div className="bg-white dark:bg-slate-900 dark:border dark:border-slate-700 p-4 rounded shadow border-l-4 border-[#355071] dark:border-l-blue-400">
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Total Facturado</p>
                    <p className="text-2xl font-bold text-[#355071] dark:text-blue-300">${totalFacturado.toLocaleString('es-AR')}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 dark:border dark:border-slate-700 p-4 rounded shadow border-l-4 border-indigo-600 dark:border-l-indigo-400">
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Total Liquidado</p>
                    <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">${totalLiquidado.toLocaleString('es-AR')}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 dark:border dark:border-slate-700 p-4 rounded shadow border-l-4 border-green-600 dark:border-l-green-400">
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Tasa de Cobro</p>
                    <p className="text-2xl font-bold text-green-700 dark:text-green-300">{tasaCobro}%</p>
                    <p className="text-xs text-gray-500 mt-1">
                        ${totalCobrado.toLocaleString('es-AR')} cobrados
                    </p>
                </div>
                <div className="bg-white dark:bg-slate-900 dark:border dark:border-slate-700 p-4 rounded shadow border-l-4 border-orange-500 dark:border-l-orange-400">
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Promedio Días Cobro</p>
                    <p className="text-2xl font-bold text-orange-600 dark:text-orange-300">{promedioDias} días</p>
                </div>
                <div className="bg-white dark:bg-slate-900 dark:border dark:border-slate-700 p-4 rounded shadow border-l-4 border-[#1d2e3f] dark:border-l-slate-400">
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Facturas Emitidas</p>
                    <p className="text-2xl font-bold text-[#1d2e3f] dark:text-slate-200">{facturasEmitidas}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 dark:border dark:border-slate-700 p-4 rounded shadow border-l-4 border-red-500 dark:border-l-red-400">
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Días Prom. Deuda</p>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-300">{promedioDiasDeuda} días</p>
                </div>
            </div>

            {/* Gráficos */}
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 transition-opacity ${isDashboardStatsLoading ? 'opacity-50' : ''}`}>
                <div className="bg-white dark:bg-slate-900 p-4 rounded shadow h-64 dark:text-slate-200">
                    <h3 className="text-sm font-bold text-[#1d2e3f] dark:text-slate-200 mb-2">Por Emisor (Montos Estimados)</h3>
                    {dataEmisor.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={dataEmisor}><XAxis dataKey="name" stroke="#888888" /><Tooltip contentStyle={{ backgroundColor: '#1f2937', color: '#fff', borderColor: '#374151' }} formatter={(val) => `$${Number(val).toLocaleString('es-AR')}`} /><Bar dataKey="total" fill="#355071" /></BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex justify-center items-center h-full text-gray-400 text-sm">Cargando gráficos o sin datos</div>
                    )}
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded shadow h-64 dark:text-slate-200">
                    <h3 className="text-sm font-bold text-[#1d2e3f] dark:text-slate-200 mb-2">Por Aseguradora (Montos Estimados)</h3>
                    {dataAseguradora.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={dataAseguradora} layout="vertical"><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={80} style={{ fontSize: '10px' }} stroke="#888888" /><Tooltip contentStyle={{ backgroundColor: '#1f2937', color: '#fff', borderColor: '#374151' }} formatter={(val) => `$${Number(val).toLocaleString('es-AR')}`} /><Bar dataKey="total" fill="#d13737" /></BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex justify-center items-center h-full text-gray-400 text-sm">Cargando gráficos o sin datos</div>
                    )}
                </div>
            </div>

            {/* AQUÍ ESTÁ LA BASE DE DATOS MAESTRA INTEGRADA */}
            <div className="border-t pt-8 dark:border-slate-700">
                <MasterTable />
            </div>
        </div>
    );
};

export default Dashboard;
