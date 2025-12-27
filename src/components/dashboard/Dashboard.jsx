import React, { useState } from 'react';
import useInvoiceStore from '../../store/useInvoiceStore';
import MasterTable from './MasterTable'; // IMPORTANTE: Importar la tabla
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const Dashboard = () => {
    const { invoices, config } = useInvoiceStore();
    const [dateRange, setDateRange] = useState({ from: '', to: '' });
    const [selectedCia, setSelectedCia] = useState('');

    const parseDateStr = (dateStr) => {
        if (!dateStr) return new Date();
        const [d, m, y] = dateStr.split('/');
        return new Date(y, m - 1, d);
    };

    // 1. Filtro Global (Afecta KPIs y Gráficos, pero NO a la MasterTable que tiene sus propios filtros)
    // 1. Filtro Global (Afecta KPIs y Gráficos, pero NO a la MasterTable que tiene sus propios filtros)
    const filteredInvoices = invoices.filter(inv => {
        const matchCia = !selectedCia || inv.aseguradora === selectedCia;
        if (!dateRange.from || !dateRange.to) return matchCia;
        const invDate = parseDateStr(inv.fecha);
        return matchCia && invDate >= new Date(dateRange.from) && invDate <= new Date(dateRange.to);
    });

    // 2. Cálculos de KPIs
    const parseMonto = (m) => parseFloat(String(m).replace(/\./g, '').replace(',', '.'));

    const totalFacturado = filteredInvoices.reduce((acc, curr) => acc + parseMonto(curr.monto), 0);
    const totalLiquidado = filteredInvoices.reduce((acc, curr) => acc + (curr.totalAPagarAnalista || 0), 0);

    const cobrados = filteredInvoices.filter(i => (i.estadoDeCobro || 'NO COBRADO') === 'COBRADO');
    const tasaCobro = filteredInvoices.length > 0 ? ((cobrados.length / filteredInvoices.length) * 100).toFixed(0) : 0;

    const diasSum = cobrados.reduce((acc, curr) => {
        const start = parseDateStr(curr.fecha);
        const end = curr.fechaPago ? parseDateStr(curr.fechaPago) : new Date(); // fechaPago should be set when marking as COBRADO
        // Fallback for end date if not present? User said "fechaCobro".
        // Assuming fechaPago is stored in DD/MM/YYYY or similar. parseDateStr handles it.
        const diff = Math.floor((end - start) / (1000 * 60 * 60 * 24));
        return acc + diff;
    }, 0);
    const promedioDias = cobrados.length > 0 ? (diasSum / cobrados.length).toFixed(0) : 0;

    // KPI: Promedio Días NO Cobradas (Deuda)
    const noCobrados = filteredInvoices.filter(i => (i.estadoDeCobro || 'NO COBRADO') !== 'COBRADO');
    const diasDeudaSum = noCobrados.reduce((acc, curr) => {
        const start = parseDateStr(curr.fecha);
        const diff = Math.floor((new Date() - start) / (1000 * 60 * 60 * 24));
        return acc + diff;
    }, 0);
    const promedioDiasDeuda = noCobrados.length > 0 ? (diasDeudaSum / noCobrados.length).toFixed(0) : 0;

    // 3. Datos Gráficos
    const byEmisor = filteredInvoices.reduce((acc, curr) => {
        acc[curr.emisor] = (acc[curr.emisor] || 0) + parseMonto(curr.monto);
        return acc;
    }, {});
    const dataEmisor = Object.keys(byEmisor).map(k => ({ name: k, total: byEmisor[k] }));

    const byAseguradora = filteredInvoices.reduce((acc, curr) => {
        acc[curr.aseguradora] = (acc[curr.aseguradora] || 0) + parseMonto(curr.monto);
        return acc;
    }, {});
    const dataAseguradora = Object.keys(byAseguradora).map(k => ({ name: k, total: byAseguradora[k] }));

    const COLORS = ['#355071', '#d13737', '#1d2e3f', '#556b2f'];

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
                </div>
                <div className="bg-white dark:bg-slate-900 dark:border dark:border-slate-700 p-4 rounded shadow border-l-4 border-orange-500 dark:border-l-orange-400">
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Promedio Días Cobro</p>
                    <p className="text-2xl font-bold text-orange-600 dark:text-orange-300">{promedioDias} días</p>
                </div>
                <div className="bg-white dark:bg-slate-900 dark:border dark:border-slate-700 p-4 rounded shadow border-l-4 border-[#1d2e3f] dark:border-l-slate-400">
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Facturas Emitidas</p>
                    <p className="text-2xl font-bold text-[#1d2e3f] dark:text-slate-200">{filteredInvoices.length}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 dark:border dark:border-slate-700 p-4 rounded shadow border-l-4 border-red-500 dark:border-l-red-400">
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Días Prom. Deuda</p>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-300">{promedioDiasDeuda} días</p>
                </div>
            </div>

            {/* Gráficos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-900 p-4 rounded shadow h-64 dark:text-slate-200">
                    <h3 className="text-sm font-bold text-[#1d2e3f] dark:text-slate-200 mb-2">Por Emisor</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dataEmisor}><XAxis dataKey="name" stroke="#888888" /><Tooltip contentStyle={{ backgroundColor: '#1f2937', color: '#fff', borderColor: '#374151' }} /><Bar dataKey="total" fill="#355071" /></BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded shadow h-64 dark:text-slate-200">
                    <h3 className="text-sm font-bold text-[#1d2e3f] dark:text-slate-200 mb-2">Por Aseguradora</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dataAseguradora} layout="vertical"><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={80} style={{ fontSize: '10px' }} stroke="#888888" /><Tooltip contentStyle={{ backgroundColor: '#1f2937', color: '#fff', borderColor: '#374151' }} /><Bar dataKey="total" fill="#d13737" /></BarChart>
                    </ResponsiveContainer>
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
