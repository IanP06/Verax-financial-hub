import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileSearch, CheckCircle, ArrowRight } from 'lucide-react';
import useInvoiceStore from '../../store/useInvoiceStore';
import { parseInvoicePDF } from '../../utils/pdfProcessor';
import { useNavigate } from 'react-router-dom';

const DropZone = () => {
    const { addStagingInvoice } = useInvoiceStore();
    const navigate = useNavigate();

    const onDrop = useCallback(async (acceptedFiles) => {
        let processedCount = 0;
        for (const file of acceptedFiles) {
            if (file.type === 'application/pdf') {
                try {
                    const data = await parseInvoicePDF(file);
                    addStagingInvoice(data);
                    processedCount++;
                } catch (error) {
                    console.error(`Error al procesar ${file.name}:`, error);
                    alert(`Error leyendo ${file.name}`);
                }
            }
        }
        if (processedCount > 0) {
            navigate('/staging');
        }
    }, [addStagingInvoice, navigate]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/pdf': ['.pdf'] },
        multiple: true
    });

    return (
        <div className="max-w-4xl mx-auto mt-10">
            <h2 className="text-2xl font-bold text-[#355071] mb-2">Ingesta de Comprobantes</h2>
            <p className="text-gray-500 mb-8">Sube las facturas de ARCA para iniciar el proceso de análisis.</p>

            {/* Zona de Drop */}
            <div
                {...getRootProps()}
                className={`border-3 border-dashed rounded-xl p-16 text-center cursor-pointer transition-all duration-300 group
          ${isDragActive
                        ? 'border-[#355071] bg-blue-50 scale-[1.02]'
                        : 'border-gray-300 hover:border-[#355071] hover:bg-gray-50 bg-white'
                    }`}
            >
                <input {...getInputProps()} />
                <div className="bg-blue-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-[#355071] transition-colors">
                    <UploadCloud className="h-10 w-10 text-[#355071] group-hover:text-white transition-colors" />
                </div>
                <p className="text-xl font-medium text-gray-700">Arrastra tus facturas PDF aquí</p>
                <p className="text-sm text-gray-400 mt-2">o haz clic para explorar archivos</p>
            </div>

            {/* Pasos Ilustrativos */}
            <div className="grid grid-cols-3 gap-8 mt-12">
                <div className="text-center p-4">
                    <div className="bg-gray-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-[#355071] font-bold">1</div>
                    <h3 className="font-bold text-[#1d2e3f] mb-2">Carga Automática</h3>
                    <p className="text-sm text-gray-500">El sistema lee el PDF, extrae el siniestro, monto y emisor automáticamente.</p>
                </div>
                <div className="text-center p-4 relative">
                    <ArrowRight className="absolute top-6 -left-4 text-gray-300 hidden md:block" />
                    <div className="bg-gray-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-[#355071] font-bold">2</div>
                    <h3 className="font-bold text-[#1d2e3f] mb-2">Verificación</h3>
                    <p className="text-sm text-gray-500">Revisa los datos en el Staging Area y asigna un analista responsable.</p>
                </div>
                <div className="text-center p-4 relative">
                    <ArrowRight className="absolute top-6 -left-4 text-gray-300 hidden md:block" />
                    <div className="bg-gray-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-[#355071] font-bold">3</div>
                    <h3 className="font-bold text-[#1d2e3f] mb-2">Gestión de Cobro</h3>
                    <p className="text-sm text-gray-500">Sigue el estado de pago y calcula los días de demora en el Dashboard.</p>
                </div>
            </div>
        </div>
    );
};

export default DropZone;
