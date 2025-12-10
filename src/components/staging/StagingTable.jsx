import React from 'react';
import { Trash, Check } from 'lucide-react';
import useInvoiceStore from '../../store/useInvoiceStore';

const StagingTable = () => {
    // UPDATED: Using stagingInvoices, removeStagingInvoice, updateStagingInvoice from the new store structure
    const { stagingInvoices, removeStagingInvoice, updateStagingInvoice, confirmInvoice, analysts } = useInvoiceStore();

    const handleConfirm = (id) => {
        confirmInvoice(id);
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md mt-6">
            <h2 className="text-xl font-bold text-[#1d2e3f] mb-4">Staging Area</h2>
            <p className="text-sm text-gray-500 mb-4">Revisa y completa los datos antes de confirmar.</p>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="text-[#355071] border-b-2 border-[#355071]">
                            <th className="p-3">Siniestro</th>
                            <th className="p-3">Nro Fact.</th> {/* Added Column */}
                            <th className="p-3">Aseguradora</th>
                            <th className="p-3">Emisor</th>
                            <th className="p-3">Monto</th>
                            <th className="p-3">Analista *</th>
                            <th className="p-3">Resultado *</th>
                            <th className="p-3">Estado *</th>
                            <th className="p-3">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stagingInvoices.length === 0 ? (
                            <tr><td colSpan="9" className="p-4 text-center text-gray-400">No hay facturas pendientes.</td></tr>
                        ) : (
                            stagingInvoices.map((inv) => (
                                <tr key={inv.id} className="border-b hover:bg-gray-50">
                                    {/* Datos Solo Lectura (Limpios) */}
                                    <td className="p-3 font-mono text-sm">{inv.siniestro}</td>
                                    <td className="p-3 font-bold text-[#1d2e3f]">{inv.nroFactura}</td> {/* Added Data */}
                                    <td className="p-3 font-bold text-[#1d2e3f]">{inv.aseguradora}</td>
                                    <td className="p-3">{inv.emisor}</td>

                                    {/* Monto Editable */}
                                    <td className="p-3">
                                        <input
                                            type="text"
                                            value={inv.monto}
                                            onChange={(e) => updateStagingInvoice(inv.id, 'monto', e.target.value)}
                                            className="border rounded p-1 w-24 text-right"
                                        />
                                    </td>

                                    {/* Dropdown Analistas Dinámico */}
                                    <td className="p-3">
                                        <select
                                            value={inv.analista || ''}
                                            onChange={(e) => updateStagingInvoice(inv.id, 'analista', e.target.value)}
                                            className="border rounded p-2 w-full bg-white"
                                        >
                                            <option value="">Seleccionar...</option>
                                            {analysts.map((name) => (
                                                <option key={name} value={name}>{name}</option>
                                            ))}
                                        </select>
                                    </td>

                                    {/* Dropdown Resultado */}
                                    <td className="p-3">
                                        <select
                                            value={inv.resultado || ''}
                                            onChange={(e) => updateStagingInvoice(inv.id, 'resultado', e.target.value)}
                                            className="border rounded p-2 w-full"
                                        >
                                            <option value="">Seleccionar...</option>
                                            <option value="SIN INDICIOS">SIN INDICIOS</option>
                                            <option value="RECHAZO">RECHAZO</option>
                                            <option value="DESISTIDO">DESISTIDO</option>
                                        </select>
                                    </td>

                                    {/* Estado (Siempre IMPAGO al inicio) */}
                                    <td className="p-3">
                                        <span className="text-[#d13737] font-bold text-sm bg-red-100 px-2 py-1 rounded">
                                            IMPAGO
                                        </span>
                                    </td>

                                    {/* Acciones */}
                                    <td className="p-3 flex gap-2">
                                        <button
                                            onClick={() => handleConfirm(inv.id)}
                                            disabled={!inv.analista || !inv.resultado}
                                            className={`p-2 rounded text-white ${(!inv.analista || !inv.resultado) ? 'bg-gray-300' : 'bg-[#355071] hover:bg-[#2c425e]'}`}
                                        >
                                            <Check size={18} />
                                        </button>
                                        <button
                                            onClick={() => removeStagingInvoice(inv.id)}
                                            className="p-2 rounded text-[#d13737] hover:bg-red-50 border border-[#d13737]"
                                        >
                                            <Trash size={18} />
                                        </button>
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
