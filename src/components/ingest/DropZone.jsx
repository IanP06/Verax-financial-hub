import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileSearch, CheckCircle, ArrowRight } from 'lucide-react';
import useInvoiceStore from '../../store/useInvoiceStore';
import { parseInvoicePDF } from '../../utils/pdfProcessor';
import { useNavigate } from 'react-router-dom';

const DropZone = ({ config }) => {
    // FIX: Use explicit selectors to prevent ReferenceError
    const addStagingInvoice = useInvoiceStore((state) => state.addStagingInvoice);
    const setStagingLiquidation = useInvoiceStore((state) => state.setStagingLiquidation);
    const setUploadDiagnostics = useInvoiceStore((state) => state.setUploadDiagnostics);

    const navigate = useNavigate();

    const onDrop = useCallback(async (acceptedFiles) => {
        // Init Diagnostics
        setUploadDiagnostics({
            lastStep: 'start_upload',
            lastUploadFileName: acceptedFiles[0]?.name || 'unknown',
            olDetected: false,
            error: null
        });

        // Prepare dynamic seeds from config
        const companiesSeeds = config?.validAseguradoras || [];
        const emittersSeeds = config?.validEmisores || [];

        let processedCount = 0;
        for (const [index, file] of acceptedFiles.entries()) {
            if (file.type === 'application/pdf') {
                try {
                    // --- IS VALID PDF ---
                    setUploadDiagnostics({ lastStep: 'parsing_pdf' });

                    // 3. Parse content
                    const data = await parseInvoicePDF(file, { companiesSeeds, emittersSeeds });

                    // EMPTY TEXT CHECK
                    if (!data.rawTextLength || data.rawTextLength < 10) {
                        setUploadDiagnostics({ error: 'EMPTY_PDF_TEXT', lastStep: 'error' });
                        alert(`No se pudo leer texto de ${file.name}. ¿Es una imagen o está escaneado?`);
                        continue;
                    }

                    // 4. OL DETECTION vs NORMAL INVOICE
                    setUploadDiagnostics({
                        lastStep: 'analyzing_content',
                        olDetected: data.isOL,
                        lastUploadType: data.isOL ? 'OL' : 'NORMAL'
                    });

                    if (data.isOL) {
                        // MINIMAL VIABLE STAGING OBJECT
                        const safeLiquidation = {
                            kind: 'LIQUIDATION',
                            items: [
                                {
                                    id: Date.now(),
                                    siniestro: '',
                                    analista: '', // Explicit empty string
                                    montoGestion: 20000,
                                    ahorroTotal: 0,
                                    plusPorAhorro: 0,
                                    ahorroAPagar: 0,
                                    viaticos: 0,
                                    fechaInforme: '', // Must be filled by user
                                    totalAPagarAnalista: 20000
                                }
                            ],
                            emisorNombre: data.emisor !== 'DESCONOCIDO' ? data.emisor : 'SANCOR', // Force SANCOR if suspect
                            emisorCuit: '',
                            fechaEmision: data.fecha || new Date().toLocaleDateString(),
                            numeroOL: data.olNumero || data.nroFactura || '',
                            totalOL: data.monto,
                            pdfFile: file,
                            pdfFileName: file.name
                        };

                        setStagingLiquidation(safeLiquidation);

                        setUploadDiagnostics({
                            lastStep: 'staging_store_set',
                            stagingLiquidationPresent: true
                        });

                    } else {
                        // Normal Inv
                        addStagingInvoice({
                            id: Date.now() + index,
                            file,
                            ...data
                        });
                        setUploadDiagnostics({ lastStep: 'staging_normal_set' });
                    }
                    processedCount++;
                } catch (error) {
                    console.error(`Error al procesar ${file.name}:`, error);
                    setUploadDiagnostics({ error: error.message, lastStep: 'exception' });
                    alert(`Error leyendo ${file.name}`);
                }
            }
        }
        if (processedCount > 0) {
            setUploadDiagnostics({ lastStep: 'navigating_to_staging' });
            navigate('/staging');
        }
    }, [addStagingInvoice, setStagingLiquidation, setUploadDiagnostics, navigate, config]);

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
