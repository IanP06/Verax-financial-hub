import React from 'react';
import { Trash, Check } from 'lucide-react';
import useInvoiceStore from '../../store/useInvoiceStore';

const StagingTable = () => {
    // UPDATED: Using stagingInvoices, removeStagingInvoice, updateStagingInvoice from the new store structure
    const { stagingInvoices, removeStagingInvoice, updateStagingInvoice, confirmInvoice, analysts, config } = useInvoiceStore();

    const handleConfirm = (id) => {
        confirmInvoice(id);
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md mt-6">
            <h2 className="text-xl font-bold text-[#1d2e3f] mb-4">Staging Area</h2>
            <p className="text-sm text-gray-500 mb-4">Revisa y completa los datos antes de confirmar.</p>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                    <thead>
                        <tr className="text-[#355071] border-b-2 border-[#355071]">
                            <th className="p-2">Factura / Siniestro</th>
                            <th className="p-2">Aseguradora</th>
                            <th className="p-2">Monto Fact.</th>
                            <th className="p-2">Analista *</th>

                            {/* Liquidación */}
                            <th className="p-2 bg-blue-50">GESTION A PAGAR</th>
                            <th className="p-2 bg-blue-50">Plus Ahorro</th>
                            <th className="p-2 bg-blue-50">AHORRO A PAGAR</th>
                            <th className="p-2 bg-blue-50">Viaticos</th>
                            <th className="p-2 bg-blue-100 font-bold">Total Analista</th>

                            <th className="p-2">Resultado *</th>
                            <th className="p-2">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stagingInvoices.length === 0 ? (
                            <tr><td colSpan="14" className="p-4 text-center text-gray-400">No hay facturas pendientes.</td></tr>
                        ) : (
                            stagingInvoices.map((inv) => (
                                <tr key={inv.id} className="border-b hover:bg-gray-50 align-top">
                                    {/* Datos Invoice */}
                                    <td className="p-2">
                                        <div className="font-bold text-[#1d2e3f] mb-1">{inv.nroFactura}</div>
                                        <input
                                            value={inv.siniestro}
                                            onChange={(e) => updateStagingInvoice(inv.id, 'siniestro', e.target.value)}
                                            className="border rounded p-1 w-full text-xs font-mono text-gray-600 mb-1 focus:ring-1 focus:ring-blue-500 outline-none"
                                        />
                                        <div className="text-[10px] text-gray-400">{inv.emisor}</div>
                                    </td>
                                    <td className="p-2">
                                        <select
                                            value={inv.aseguradora}
                                            onChange={(e) => updateStagingInvoice(inv.id, 'aseguradora', e.target.value)}
                                            className="border rounded p-1 w-full font-bold text-[#1d2e3f] text-xs focus:ring-1 focus:ring-blue-500"
                                        >
                                            <option value="">...</option>
                                            {config?.validAseguradoras?.map(a => (
                                                <option key={a.nombre} value={a.nombre}>{a.nombre}</option>
                                            ))}
                                            {/* Fallback if current value not in list */}
                                            {!config?.validAseguradoras?.some(a => a.nombre === inv.aseguradora) && inv.aseguradora && (
                                                <option value={inv.aseguradora}>{inv.aseguradora}</option>
                                            )}
                                        </select>
                                    </td>

                                    {/* Monto Editable */}
                                    <td className="p-2">
                                        <input
                                            type="text"
                                            value={inv.monto}
                                            onChange={(e) => updateStagingInvoice(inv.id, 'monto', e.target.value)}
                                            className="border rounded p-1 w-20 text-right"
                                        />
                                    </td>

                                    {/* Analista */}
                                    <td className="p-2">
                                        <select
                                            value={inv.analista || ''}
                                            onChange={(e) => updateStagingInvoice(inv.id, 'analista', e.target.value)}
                                            className="border rounded p-1 w-24 bg-white"
                                        >
                                            <option value="">...</option>
                                            {analysts.map((name) => (
                                                <option key={name} value={name}>{name}</option>
                                            ))}
                                        </select>
                                    </td>

                                    {/* Liquidacion Inputs */}
                                    <td className="p-2 bg-blue-50">
                                        <input type="number" value={inv.montoGestion} onChange={(e) => updateStagingInvoice(inv.id, 'montoGestion', e.target.value)} className="border rounded p-1 w-16 text-right" />
                                    </td>
                                    <td className="p-2 bg-blue-50">
                                        <input type="number" value={inv.plusPorAhorro} onChange={(e) => updateStagingInvoice(inv.id, 'plusPorAhorro', e.target.value)} className="border rounded p-1 w-16 text-right" />
                                    </td>
                                    <td className="p-2 bg-blue-50">
                                        <input type="number" value={inv.ahorroAPagar} onChange={(e) => updateStagingInvoice(inv.id, 'ahorroAPagar', e.target.value)} className="border rounded p-1 w-16 text-right" />
                                    </td>
                                    <td className="p-2 bg-blue-50">
                                        <input type="number" value={inv.viaticosAPagar} onChange={(e) => updateStagingInvoice(inv.id, 'viaticosAPagar', e.target.value)} className="border rounded p-1 w-16 text-right" />
                                    </td>
                                    <td className="p-2 bg-blue-100 font-bold text-right text-[#355071]">
                                        ${inv.totalAPagarAnalista?.toLocaleString('es-AR') || 0}
                                    </td>

                                    {/* Resultado */}
                                    <td className="p-2">
                                        <select
                                            value={inv.resultado || ''}
                                            onChange={(e) => updateStagingInvoice(inv.id, 'resultado', e.target.value)}
                                            className="border rounded p-1 w-24"
                                        >
                                            <option value="">...</option>
                                            <option value="SIN INDICIOS">SIN INDICIOS</option>
                                            <option value="RECHAZO">RECHAZO</option>
                                            <option value="DESISTIDO">DESISTIDO</option>
                                        </select>
                                    </td>

                                    {/* Estado Cobro (Ex Estado) */}
                                    <td className="p-2">
                                        <select
                                            value={inv.estadoDeCobro || 'NO COBRADO'}
                                            onChange={(e) => updateStagingInvoice(inv.id, 'estadoDeCobro', e.target.value)}
                                            className={`border rounded p-1 w-24 text-xs font-bold ${inv.estadoDeCobro === 'COBRADO' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                                        >
                                            <option value="NO COBRADO">NO COBRADO</option>
                                            <option value="COBRADO">COBRADO</option>
                                        </select>
                                    </td>

                                    {/* Acciones */}
                                    <td className="p-2">
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => handleConfirm(inv.id)}
                                                disabled={!inv.analista || !inv.resultado}
                                                className={`p-1 rounded text-white ${(!inv.analista || !inv.resultado) ? 'bg-gray-300' : 'bg-[#355071] hover:bg-[#2c425e]'}`}
                                                title="Confirmar"
                                            >
                                                <Check size={16} />
                                            </button>
                                            <button
                                                onClick={() => removeStagingInvoice(inv.id)}
                                                className="p-1 rounded text-[#d13737] hover:bg-red-50 border border-[#d13737]"
                                                title="Eliminar"
                                            >
                                                <Trash size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default StagingTable;
