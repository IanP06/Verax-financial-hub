import React from 'react';
import DropZone from './DropZone';
import useInvoiceStore from '../../store/useInvoiceStore';

const IngestView = () => {
    const { config } = useInvoiceStore();
    return (
        <div className="space-y-8">
            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-2xl font-bold text-primary mb-2">Ingesta de Facturas</h2>
                <p className="text-gray-500 mb-8">
                    Sube tus archivos PDF de ARCA/AFIP aquí. El sistema extraerá automáticamente los datos clave.
                </p>

                <DropZone config={config} />
            </div>

            {/* Instructions / Tips */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mb-4 font-bold">1</div>
                    <h3 className="font-semibold text-gray-800 mb-2">Sube tus PDFs</h3>
                    <p className="text-sm text-gray-500">Arrastra múltiples facturas a la vez. El sistema soporta el formato estándar de AFIP.</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="w-10 h-10 bg-purple-50 rounded-full flex items-center justify-center text-purple-600 mb-4 font-bold">2</div>
                    <h3 className="font-semibold text-gray-800 mb-2">Revisión Automática</h3>
                    <p className="text-sm text-gray-500">Detectamos Siniestro, Aseguradora, Montos y Fechas automáticamente.</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="w-10 h-10 bg-orange-50 rounded-full flex items-center justify-center text-orange-600 mb-4 font-bold">3</div>
                    <h3 className="font-semibold text-gray-800 mb-2">Enriquecimiento</h3>
                    <p className="text-sm text-gray-500">Completa los datos faltantes en la tabla de Staging antes de confirmar.</p>
                </div>
            </div>
        </div>
    );
};

export default IngestView;
