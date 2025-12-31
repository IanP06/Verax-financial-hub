
import React, { useState } from 'react';
import { Upload, X, FileText, Loader } from 'lucide-react';
import useInvoiceStore from '../../store/useInvoiceStore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const LiquidationUploadModal = ({ onClose, onSuccess }) => {
    const { saveLiquidationDraft } = useInvoiceStore();
    const [file, setFile] = useState(null);
    const [liquidationNumber, setLiquidationNumber] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleFileChange = (e) => {
        if (e.target.files[0]) {
            setFile(e.target.files[0]);
            // Attempt to extract number if filename has it
            const fname = e.target.files[0].name;
            const match = fname.match(/(\d{4,})/);
            if (match) setLiquidationNumber(match[0]);
        }
    };

    const handleUpload = async () => {
        if (!file) return setError("Seleccione un archivo PDF");
        if (!liquidationNumber) return setError("Ingrese el Número de Liquidación");

        setLoading(true);
        setError(null);

        try {
            // 1. Upload PDF
            const storage = getStorage();
            const storagePath = `liquidations/${Date.now()}_${file.name}`;
            const storageRef = ref(storage, storagePath);
            await uploadBytes(storageRef, file);
            const downloadUrl = await getDownloadURL(storageRef);

            // 2. Create Draft in Firestore
            const draftData = {
                type: "SANCOR_LIQUIDATION",
                provider: "SANCOR",
                liquidationNumber: liquidationNumber,
                title: `ORDEN DE LIQUIDACIÓN N° ${liquidationNumber}`,
                pdfUrl: downloadUrl,
                pdfStoragePath: storagePath,
                totalAmount: 0, // Initial
                currency: "ARS"
            };

            const result = await saveLiquidationDraft(draftData);

            if (result.success) {
                onSuccess(result.id); // Pass ID to parent to open Staging Manager
                onClose();
            } else {
                throw new Error(result.error);
            }

        } catch (err) {
            console.error(err);
            setError("Error al subir: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md p-6 relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    <X size={20} />
                </button>

                <h2 className="text-xl font-bold mb-4 text-[#1d2e3f] dark:text-blue-100 flex items-center gap-2">
                    <FileText /> Nueva Orden de Liquidación
                </h2>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Archivo PDF (Orden SANCOR)
                        </label>
                        <div className="border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg p-6 text-center hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors cursor-pointer relative">
                            <input
                                type="file"
                                accept="application/pdf"
                                onChange={handleFileChange}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            {file ? (
                                <div className="text-green-600 font-medium flex items-center justify-center gap-2">
                                    <FileText size={20} />
                                    {file.name}
                                </div>
                            ) : (
                                <div className="text-gray-500 flex flex-col items-center gap-2">
                                    <Upload size={24} />
                                    <span>Haga clic o arrastre el PDF aquí</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Número de Liquidación / Factura Madre
                        </label>
                        <input
                            type="text"
                            value={liquidationNumber}
                            onChange={(e) => setLiquidationNumber(e.target.value)}
                            className="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                            placeholder="Ej: 0001-12345678"
                        />
                    </div>

                    {error && (
                        <div className="bg-red-100 text-red-700 p-2 rounded text-sm">
                            {error}
                        </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700 rounded"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleUpload}
                            disabled={loading || !file || !liquidationNumber}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {loading ? <Loader className="animate-spin" size={16} /> : null}
                            {loading ? "Procesando..." : "Crear Borrador"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LiquidationUploadModal;
