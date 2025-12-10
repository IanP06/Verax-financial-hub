import React, { useState } from 'react';
import useInvoiceStore from '../../store/useInvoiceStore';
import MasterTable from './MasterTable'; // IMPORTANTE: Importar la tabla
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const Dashboard = () => {
    const { invoices } = useInvoiceStore();
    const [dateRange, setDateRange] = useState({ from: '', to: '' });

    const parseDateStr = (dateStr) => {
        if (!dateStr) return new Date();
        const [d, m, y] = dateStr.split('/');
        return new Date(y, m - 1, d);
    };

    // 1. Filtro Global (Afecta KPIs y Gráficos, pero NO a la MasterTable que tiene sus propios filtros)
    const filteredInvoices = invoices.filter(inv => {
        if (!dateRange.from || !dateRange.to) return true;
        const invDate = parseDateStr(inv.fecha);
        return invDate >= new Date(dateRange.from) && invDate <= new Date(dateRange.to);
    });

    // 2. Cálculos de KPIs
    const parseMonto = (m) => parseFloat(String(m).replace(/\./g, '').replace(',', '.'));

    const totalFacturado = filteredInvoices.reduce((acc, curr) => acc + parseMonto(curr.monto), 0);

    const pagos = filteredInvoices.filter(i => i.estado === 'PAGO');
    const tasaCobro = invoices.length > 0 ? ((pagos.length / invoices.length) * 100).toFixed(0) : 0;

    const diasSum = pagos.reduce((acc, curr) => acc + (curr.diasCobro || 0), 0);
    const promedioDias = pagos.length > 0 ? (diasSum / pagos.length).toFixed(0) : 0;

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
                <h1 className="text-2xl font-bold text-[#355071]">Dashboard Financiero</h1>
                <div className="flex gap-2">
                    <input type="date" className="border p-2 rounded text-sm" onChange={e => setDateRange({ ...dateRange, from: e.target.value })} />
                    <input type="date" className="border p-2 rounded text-sm" onChange={e => setDateRange({ ...dateRange, to: e.target.value })} />
                </div>
            </div>

            {/* Tarjetas KPI */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded shadow border-l-4 border-[#355071]">
                    <p className="text-xs text-gray-500 uppercase">Total Facturado</p>
                    <p className="text-2xl font-bold text-[#355071]">${totalFacturado.toLocaleString('es-AR')}</p>
                </div>
                <div className="bg-white p-4 rounded shadow border-l-4 border-green-600">
                    <p className="text-xs text-gray-500 uppercase">Tasa de Cobro</p>
                    <p className="text-2xl font-bold text-green-700">{tasaCobro}%</p>
                </div>
                <div className="bg-white p-4 rounded shadow border-l-4 border-orange-500">
                    <p className="text-xs text-gray-500 uppercase">Promedio Días Cobro</p>
                    <p className="text-2xl font-bold text-orange-600">{promedioDias} días</p>
                </div>
                <div className="bg-white p-4 rounded shadow border-l-4 border-[#1d2e3f]">
                    <p className="text-xs text-gray-500 uppercase">Facturas Emitidas</p>
                    <p className="text-2xl font-bold text-[#1d2e3f]">{filteredInvoices.length}</p>
                </div>
            </div>

            {/* Gráficos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-4 rounded shadow h-64">
                    <h3 className="text-sm font-bold text-[#1d2e3f] mb-2">Por Emisor</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dataEmisor}><XAxis dataKey="name" /><Tooltip /><Bar dataKey="total" fill="#355071" /></BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="bg-white p-4 rounded shadow h-64">
                    <h3 className="text-sm font-bold text-[#1d2e3f] mb-2">Por Aseguradora</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dataAseguradora} layout="vertical"><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={80} style={{ fontSize: '10px' }} /><Tooltip /><Bar dataKey="total" fill="#d13737" /></BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* AQUÍ ESTÁ LA BASE DE DATOS MAESTRA INTEGRADA */}
            <div className="border-t pt-8">
                <MasterTable />
            </div>
        </div>
    );
};

export default Dashboard;
