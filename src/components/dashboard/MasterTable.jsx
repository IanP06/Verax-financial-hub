import React, { useState } from 'react';
import useInvoiceStore from '../../store/useInvoiceStore';
import { Trash, Download, Search } from 'lucide-react';

const MasterTable = () => {
    const { invoices, updateInvoiceStatus, deleteInvoice } = useInvoiceStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState({ aseguradora: '', estado: '', fechaDesde: '', fechaHasta: '' });

    const parseDateStr = (dateStr) => {
        if (!dateStr) return new Date(0);
        const [d, m, y] = dateStr.split('/');
        return new Date(y, m - 1, d);
    };

    const filteredInvoices = invoices.filter(inv => {
        const term = searchTerm.toLowerCase();
        const matchesSearch = (inv.siniestro || '').toLowerCase().includes(term) ||
            (inv.nroFactura || '').includes(term) ||
            (inv.aseguradora || '').toLowerCase().includes(term);

        const matchAseguradora = !filters.aseguradora || inv.aseguradora === filters.aseguradora;
        const matchEstado = !filters.estado || inv.estado === filters.estado;

        let matchFecha = true;
        if (filters.fechaDesde && filters.fechaHasta) {
            const invDate = parseDateStr(inv.fecha);
            matchFecha = invDate >= new Date(filters.fechaDesde) && invDate <= new Date(filters.fechaHasta);
        }
        return matchesSearch && matchAseguradora && matchEstado && matchFecha;
    });

    const handleStateChange = (id, nuevoEstado) => {
        if (nuevoEstado === 'PAGO') {
            const fechaReal = prompt("Ingrese la fecha REAL de pago (DD/MM/AAAA):", new Date().toLocaleDateString('es-AR'));
            if (fechaReal) updateInvoiceStatus(id, 'PAGO', fechaReal);
        } else {
            updateInvoiceStatus(id, nuevoEstado);
        }
    };

    const handleDelete = (id) => {
        // Modal nativo de confirmación
        if (window.confirm("⚠️ ATENCIÓN: ¿Estás seguro de que deseas eliminar esta factura de la base de datos permanentemente?")) {
            deleteInvoice(id);
        }
    };

    const handleExport = () => {
        // EXCEL FIX:
        // 1. Usamos BOM (\uFEFF) para que Excel reconozca UTF-8.
        // 2. Usamos punto y coma (;) como separador, estándar en regiones Latam/ES.
        const BOM = "\uFEFF";
        const header = "Nro Factura;Siniestro;Aseguradora;Emisor;Monto;Fecha Emision;Estado;Dias Cobro\n";
        const rows = filteredInvoices.map(inv =>
            `${inv.nroFactura};${inv.siniestro};${inv.aseguradora};${inv.emisor};"${inv.monto}";${inv.fecha};${inv.estado};${inv.diasCobro || '-'}`
        ).join("\n");

        const blob = new Blob([BOM + header + rows], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `reporte_verax_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
    };

    const uniqueAseguradoras = [...new Set(invoices.map(inv => inv.aseguradora))];

    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-[#1d2e3f] flex items-center gap-2">Base de Datos Maestra</h2>
                <button onClick={handleExport} className="flex items-center gap-2 bg-[#355071] text-white px-4 py-2 rounded hover:bg-[#2c425e] text-sm">
                    <Download size={16} /> Exportar CSV
                </button>
            </div>

            <div className="bg-gray-50 p-4 rounded mb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                    <input type="text" placeholder="Buscar..." className="pl-9 p-2 border rounded w-full text-sm" onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <select className="border p-2 rounded text-sm" onChange={e => setFilters({ ...filters, aseguradora: e.target.value })}>
                    <option value="">Todas las Cías</option>
                    {uniqueAseguradoras.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <select className="border p-2 rounded text-sm" onChange={e => setFilters({ ...filters, estado: e.target.value })}>
                    <option value="">Todos los Estados</option>
                    <option value="PAGO">Pagos</option>
                    <option value="IMPAGO">Impagos</option>
                </select>
                <input type="date" className="border p-2 rounded text-sm" onChange={e => setFilters({ ...filters, fechaDesde: e.target.value })} />
                <input type="date" className="border p-2 rounded text-sm" onChange={e => setFilters({ ...filters, fechaHasta: e.target.value })} />
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                    <thead>
                        <tr className="text-[#355071] border-b-2 border-[#355071] bg-gray-50">
                            <th className="p-3">Factura</th>
                            <th className="p-3">Siniestro</th>
                            <th className="p-3">Aseguradora</th>
                            <th className="p-3">Emisor</th>
                            <th className="p-3 text-right">Monto</th>
                            <th className="p-3">Emisión</th>
                            <th className="p-3">Analista</th>
                            <th className="p-3">Estado</th>
                            <th className="p-3 text-center">Días</th>
                            <th className="p-3"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredInvoices.length === 0 ? <tr><td colSpan="9" className="p-4 text-center text-gray-500">No hay resultados</td></tr> :
                            filteredInvoices.map((inv) => (
                                <tr key={inv.id} className="border-b hover:bg-gray-50">
                                    <td className="p-3 font-bold">{inv.nroFactura}</td>
                                    <td className="p-3 font-mono">{inv.siniestro}</td>
                                    <td className="p-3">{inv.aseguradora}</td>
                                    <td className="p-3">{inv.emisor}</td>
                                    <td className="p-3 text-right">${inv.monto}</td>
                                    <td className="p-3">{inv.fecha}</td>
                                    <td className="p-3">{inv.analista}</td>
                                    <td className="p-3">
                                        <select
                                            value={inv.estado}
                                            onChange={(e) => handleStateChange(inv.id, e.target.value)}
                                            className={`border rounded p-1 text-xs font-bold ${inv.estado === 'PAGO' ? 'text-green-700 bg-green-100' : 'text-[#d13737] bg-red-100'}`}
                                        >
                                            <option value="IMPAGO">IMPAGO</option>
                                            <option value="PAGO">PAGO</option>
                                        </select>
                                    </td>
                                    <td className="p-3 text-center">{inv.diasCobro || '-'}</td>
                                    <td className="p-3"><button onClick={() => handleDelete(inv.id)} className="text-gray-400 hover:text-red-600"><Trash size={16} /></button></td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default MasterTable;
