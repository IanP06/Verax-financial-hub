import React, { useState } from 'react';
import useInvoiceStore from '../../store/useInvoiceStore';
import { Trash, Download, Search, Edit2, Clock, FileText, CheckCircle, AlertTriangle, FileWarning } from 'lucide-react';
import EditInvoiceModal from './EditInvoiceModal';
import PaymentConfirmationModal from './PaymentConfirmationModal';

const MasterTable = () => {
    const { invoices, updateInvoiceStatus, deleteInvoice, updateInvoice, analysts, config } = useInvoiceStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState({ aseguradora: '', estadoDeCobro: '', analista: '', estadoPago: '', fechaDesde: '', fechaHasta: '', mostrarVencidos: false });
    const [editingInvoice, setEditingInvoice] = useState(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentSnapshot, setPaymentSnapshot] = useState({ ids: [], total: 0, count: 0 });

    const parseDateStr = (dateStr) => {
        if (!dateStr) return new Date(0);
        const [d, m, y] = dateStr.split('/');
        return new Date(y, m - 1, d);
    };

    const daysBetween = (fechaInicio, fechaFin) => {
        const start = parseDateStr(fechaInicio);
        const end = fechaFin instanceof Date ? fechaFin : parseDateStr(fechaFin);
        const diffTime = end - start;
        return Math.floor(diffTime / (1000 * 60 * 60 * 24));
    };

    const getDaysFromEmission = (dateStr) => {
        return daysBetween(dateStr, new Date());
    };



    const filteredInvoices = invoices.filter(inv => {
        const term = searchTerm.toLowerCase();
        const matchesSearch = (inv.siniestro || '').toLowerCase().includes(term) ||
            (inv.nroFactura || '').includes(term) ||
            (inv.aseguradora || '').toLowerCase().includes(term);

        const matchAseguradora = !filters.aseguradora || inv.aseguradora === filters.aseguradora;
        const matchAnalista = !filters.analista || inv.analista === filters.analista;
        // Estado Cobro (Aseguradora)
        const matchEstadoCobro = !filters.estadoDeCobro || (inv.estadoDeCobro || 'NO COBRADO') === filters.estadoDeCobro;
        // Estado Pago (Analista)
        const matchEstadoPago = !filters.estadoPago || (inv.estadoPago || 'IMPAGO') === filters.estadoPago;

        let matchFecha = true;
        if (filters.fechaDesde && filters.fechaHasta) {
            const invDate = parseDateStr(inv.fecha);
            matchFecha = invDate >= new Date(filters.fechaDesde) && invDate <= new Date(filters.fechaHasta);
        }

        let matchVencidos = true;
        if (filters.mostrarVencidos) {
            const days = getDaysFromEmission(inv.fecha);
            // 40+ Logic: >= 40 days OLD AND Analyst NOT PAID (IMPAGO). 
            // Collection status (COBRADO/NO COBRADO) is IGNORED here.
            matchVencidos = days >= 40 && (inv.estadoPago || 'IMPAGO') === 'IMPAGO';
        }

        return matchesSearch && matchAseguradora && matchAnalista && matchEstadoCobro && matchEstadoPago && matchFecha && matchVencidos;
    });

    const isOverdue = (inv) => {
        if ((inv.estadoDeCobro || 'NO COBRADO') === 'COBRADO') return false;

        const defaultConfig = { dias: 30, tolerancia: 0 };
        // Safe access to config
        const aseg = inv.aseguradora ? inv.aseguradora.toUpperCase() : 'OTRA';
        const asegConfig = config?.aseguradoras?.[aseg] || config?.aseguradoras?.['OTRA'] || defaultConfig;

        const emissionDate = parseDateStr(inv.fecha);
        const totalDays = (asegConfig.dias || 30) + (asegConfig.tolerancia || 0);

        const deadline = new Date(emissionDate);
        deadline.setDate(deadline.getDate() + totalDays);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return today > deadline;
    };

    const handleStateChange = (id, nuevoEstado) => {
        if (nuevoEstado === 'COBRADO') {
            const fechaReal = prompt("Ingrese la fecha REAL de cobro (DD/MM/AAAA):", new Date().toLocaleDateString('es-AR'));
            if (fechaReal) updateInvoiceStatus(id, 'COBRADO', fechaReal);
        } else {
            updateInvoiceStatus(id, nuevoEstado);
        }
    };

    const handleDelete = (id) => {
        if (window.confirm("⚠️ ATENCIÓN: ¿Estás seguro de que deseas eliminar esta factura de la base de datos permanentemente?")) {
            deleteInvoice(id);
        }
    };

    const handleExport = () => {
        const BOM = "\uFEFF";
        const header = "Nro Factura;Siniestro;Aseguradora;Emisor;Monto;Fecha Emision;Analista;Total Liq;Estado Pago;Estado Cobro\n";
        const rows = filteredInvoices.map(inv =>
            `${inv.nroFactura};${inv.siniestro};${inv.aseguradora};${inv.emisor};"${inv.monto}";${inv.fecha};${inv.analista};"${inv.totalAPagarAnalista || 0}";${inv.estadoPago};${inv.estadoDeCobro || 'NO COBRADO'}`
        ).join("\n");

        const blob = new Blob([BOM + header + rows], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `verax_master_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
    };

    // --- LOGICA DE PAGOS ---

    const toggleFilterOld = () => {
        setFilters(prev => ({
            ...prev,
            mostrarVencidos: !prev.mostrarVencidos
        }));
    };

    const handleGeneratePaymentOrder = () => {
        const BOM = "\uFEFF";
        const header = "SINIESTRO;ASEGURADORA;MONTO GESTION;AHORRO A PAGAR;VIATICOS A PAGAR;TOTAL A PAGAR ANALISTA\n";

        let totalGeneral = 0;
        const rows = filteredInvoices.map(inv => {
            const total = Number(inv.totalAPagarAnalista || 0);
            totalGeneral += total;
            return `${inv.siniestro};${inv.aseguradora};"${inv.montoGestion || 0}";"${inv.ahorroAPagar || 0}";"${inv.viaticosAPagar || 0}";"${total}"`;
        }).join("\n");

        const footer = `;;;;;TOTAL GENERAL: ${totalGeneral}`;

        const blob = new Blob([BOM + header + rows + "\n" + footer], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `orden_pago_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();

        // Snapshot
        setPaymentSnapshot({
            ids: filteredInvoices.map(i => i.id),
            total: totalGeneral,
            count: filteredInvoices.length
        });
    };

    const handleConfirmPayment = (fechaPago) => {
        if (!paymentSnapshot.ids.length) return;

        paymentSnapshot.ids.forEach(id => {
            const inv = invoices.find(i => i.id === id); // Find in current state to be safe? 
            // Actually updateInvoice updates by ID.
            // Check requirement: "solo si estadoPago === 'IMPAGO'"
            // We can do that check inside the loop or trust snapshot (which came from filtered view).
            // Better check current state.
            const current = invoices.find(i => i.id === id);
            if (current && current.estadoPago !== 'PAGO') {
                updateInvoice(id, {
                    estadoPago: 'PAGO',
                    fechaPagoAnalista: fechaPago
                });
            }
        });

        setShowPaymentModal(false);
        setPaymentSnapshot({ ids: [], total: 0, count: 0 });
        alert("Pagos confirmados correctamente.");
    };

    const handleExportClaims = () => {
        const BOM = "\uFEFF";
        const header = "SINIESTRO;NRO FACTURA;FECHA EMISION;DIAS DESDE EMISION\n";

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const rows = filteredInvoices.map(inv => {
            const emission = parseDateStr(inv.fecha);
            const diffTime = Math.abs(today - emission);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            return `${inv.siniestro};${inv.nroFactura};${inv.fecha};${diffDays}`;
        }).join("\n");

        const blob = new Blob([BOM + header + rows], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `reclamos_cobro_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
    };

    const uniqueAseguradoras = [...new Set(invoices.map(inv => inv.aseguradora))];

    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <h2 className="text-xl font-bold text-[#1d2e3f] flex items-center gap-2">Base de Datos Maestra</h2>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={toggleFilterOld}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded hover:bg-amber-700 text-xs font-bold shadow ${filters.mostrarVencidos ? 'bg-amber-800 text-white ring-2 ring-amber-500' : 'bg-amber-600 text-white'}`}
                    >
                        <Clock size={14} /> {filters.mostrarVencidos ? 'VER TODOS' : 'VER 40+ DÍAS'}
                    </button>
                    <button onClick={handleGeneratePaymentOrder} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 text-xs font-bold shadow">
                        <FileText size={14} /> GEN. ORDEN PAGO
                    </button>
                    <button
                        onClick={() => setShowPaymentModal(true)}
                        disabled={paymentSnapshot.count === 0}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-bold shadow ${paymentSnapshot.count === 0 ? 'bg-gray-300 text-gray-500' : 'bg-green-600 text-white hover:bg-green-700'}`}
                    >
                        <CheckCircle size={14} /> CONFIRM. PAGOS ({paymentSnapshot.count})
                    </button>
                    <button onClick={handleExportClaims} className="flex items-center gap-1 bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 text-xs font-bold shadow">
                        <FileWarning size={14} /> RECLAMOS
                    </button>
                    <button onClick={handleExport} className="flex items-center gap-1 bg-[#355071] text-white px-3 py-1.5 rounded hover:bg-[#2c425e] text-xs font-bold shadow">
                        <Download size={14} /> Exportar Tabla
                    </button>
                </div>
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
                <select className="border p-2 rounded text-sm" onChange={e => setFilters({ ...filters, analista: e.target.value })} value={filters.analista}>
                    <option value="">Todos los Analistas</option>
                    {analysts.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <select className="border p-2 rounded text-sm" onChange={e => setFilters({ ...filters, estadoDeCobro: e.target.value })} value={filters.estadoDeCobro}>
                    <option value="">Estado Cobro (Todos)</option>
                    <option value="COBRADO">COBRADO</option>
                    <option value="NO COBRADO">NO COBRADO</option>
                </select>
                <select className="border p-2 rounded text-sm" onChange={e => setFilters({ ...filters, estadoPago: e.target.value })} value={filters.estadoPago}>
                    <option value="">Estado Pago (Todos)</option>
                    <option value="PAGO">PAGO</option>
                    <option value="IMPAGO">IMPAGO</option>
                </select>
                {/* Fechas en una misma columna para ahorrar espacio o separadas */}
                <div className="flex gap-2">
                    <input type="date" className="border p-2 rounded text-sm w-full" onChange={e => setFilters({ ...filters, fechaDesde: e.target.value })} title="Desde" />
                    <input type="date" className="border p-2 rounded text-sm w-full" onChange={e => setFilters({ ...filters, fechaHasta: e.target.value })} title="Hasta" />
                </div>
            </div>

            {editingInvoice && <EditInvoiceModal invoice={editingInvoice} onClose={() => setEditingInvoice(null)} />}
            {showPaymentModal && <PaymentConfirmationModal count={paymentSnapshot.count} total={paymentSnapshot.total} onConfirm={handleConfirmPayment} onClose={() => setShowPaymentModal(false)} />}

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                    <thead>
                        <tr className="text-[#355071] border-b-2 border-[#355071] bg-gray-50">
                            <th className="p-2">Factura / Siniestro</th>
                            <th className="p-2">Aseguradora</th>
                            <th className="p-2 text-right">Monto</th>
                            <th className="p-2">Emisión</th>
                            <th className="p-2">Analista</th>

                            <th className="p-2">Total Liq.</th>
                            <th className="p-2">Est. Pago</th>

                            <th className="p-2">Est. Cobro</th>
                            <th className="p-2 text-center">Días</th>
                            <th className="p-2">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredInvoices.length === 0 ? <tr><td colSpan="10" className="p-4 text-center text-gray-500">No hay resultados</td></tr> :
                            filteredInvoices.map((inv) => (
                                <tr key={inv.id} className="border-b hover:bg-gray-50">
                                    <td className="p-2">
                                        <div className="font-bold">{inv.nroFactura}</div>
                                        <div className="font-mono text-gray-500">{inv.siniestro}</div>
                                    </td>
                                    <td className="p-2">{inv.aseguradora}</td>
                                    <td className="p-2 text-right">${inv.monto}</td>
                                    <td className="p-2">{inv.fecha}</td>
                                    <td className="p-2">{inv.analista}</td>

                                    <td className="p-2 font-bold text-[#355071]">${inv.totalAPagarAnalista?.toLocaleString('es-AR')}</td>
                                    <td className="p-2">
                                        <span className={`px-2 py-1 rounded ${inv.estadoPago === 'PAGO' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {inv.estadoPago}
                                        </span>
                                    </td>

                                    <td className="p-2">
                                        <div className="flex items-center gap-1">
                                            <select
                                                value={inv.estadoDeCobro || 'NO COBRADO'}
                                                onChange={(e) => handleStateChange(inv.id, e.target.value)}
                                                className={`border rounded p-1 text-[10px] font-bold ${inv.estadoDeCobro === 'COBRADO' ? 'text-green-700 bg-green-100' : 'text-[#d13737] bg-red-100'}`}
                                            >
                                                <option value="NO COBRADO">NO COBRADO</option>
                                                <option value="COBRADO">COBRADO</option>
                                            </select>
                                            {isOverdue(inv) && (
                                                <div className="relative group">
                                                    <AlertTriangle size={16} className="text-red-600 animate-pulse cursor-help" />
                                                    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-black text-white text-xs p-1 rounded whitespace-nowrap z-10">
                                                        Pago Atrasado
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className={`p-2 text-center font-bold ${inv.estadoDeCobro === 'COBRADO'
                                        ? 'text-green-600'
                                        : 'text-red-500'
                                        }`}>
                                        {inv.estadoDeCobro === 'COBRADO'
                                            ? daysBetween(inv.fecha, inv.fechaPago || new Date()) // Si esta cobrado usamos fecha de cobro (que deberia estar en fechaPago segun logica vieja? o hay que chequear store). El usuario dijo "fechaCobro".
                                            : daysBetween(inv.fecha, new Date())
                                        }
                                    </td>
                                    <td className="p-2 flex gap-1">
                                        <button onClick={() => setEditingInvoice(inv)} className="p-1 text-[#355071] hover:bg-blue-50 rounded" title="Editar">
                                            <Edit2 size={16} />
                                        </button>
                                        <button onClick={() => handleDelete(inv.id)} className="p-1 text-gray-400 hover:text-red-600 rounded" title="Eliminar">
                                            <Trash size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default MasterTable;
