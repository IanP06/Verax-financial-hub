
import React, { useEffect } from 'react';
import { X, FileText, Calendar, DollarSign, CheckCircle } from 'lucide-react';
import useInvoiceStore from '../../store/useInvoiceStore';

const LiquidationListHelper = ({ onClose }) => {
    const { liquidations, fetchLiquidations } = useInvoiceStore();

    useEffect(() => {
        const unsub = fetchLiquidations();
        return () => { if (typeof unsub === 'function') unsub(); }
    }, [fetchLiquidations]);

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex flex-col relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    <X size={24} />
                </button>

                <div className="p-6 border-b dark:border-slate-700">
                    <h2 className="text-2xl font-bold text-[#1d2e3f] dark:text-blue-200 flex items-center gap-2">
                        <FileText /> Órdenes de Liquidación (SANCOR)
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Historial de órdenes procesadas.</p>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {liquidations.length === 0 ? (
                        <div className="text-center text-gray-400 py-10">
                            No hay órdenes registradas.
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {liquidations.map(liq => (
                                <div key={liq.id} className="bg-gray-50 dark:bg-slate-800 p-4 rounded-lg shadow border-l-4 border-blue-600 dark:border-slate-600 flex justify-between items-center group hover:bg-white dark:hover:bg-slate-700 transition-colors">
                                    <div>
                                        <h3 className="font-bold text-lg text-gray-800 dark:text-white">{liq.title}</h3>
                                        <div className="text-sm text-gray-500 flex gap-4 mt-1">
                                            <span className="flex items-center gap-1"><Calendar size={14} /> {liq.createdAt?.seconds ? new Date(liq.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}</span>
                                            <span className="flex items-center gap-1"><CheckCircle size={14} className={liq.status === 'POSTED' ? 'text-green-500' : 'text-orange-500'} /> {liq.status}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        {liq.pdfUrl && (
                                            <a
                                                href={liq.pdfUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="px-4 py-2 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 dark:bg-slate-900 dark:text-blue-400 font-bold"
                                            >
                                                Ver PDF
                                            </a>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LiquidationListHelper;
