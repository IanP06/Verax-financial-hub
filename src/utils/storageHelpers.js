
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

/**
 * Uploads a Liquidation PDF to Firebase Storage using the SDK.
 * Handles validation and path construction.
 * 
 * @param {Object} params
 * @param {File} params.file - The PDF file to upload.
 * @param {string} params.liquidationId - The liquidation ID/Number for path organization.
 * @returns {Promise<{pdfUrl: string, pdfStoragePath: string}>}
 */
export const uploadLiquidationPdf = async ({ file, liquidationId }) => {
    // 1. Validation
    if (!file) throw new Error("No se proporcionó ningún archivo.");
    if (file.type !== 'application/pdf') throw new Error("El archivo debe ser un PDF.");

    // Size limit: 20MB (20 * 1024 * 1024 bytes)
    const MAX_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE) throw new Error("El archivo excede el límite de 20MB.");

    // 2. Prepare Storage Reference
    const storage = getStorage();
    // Path: liquidations/{liquidationNumber}/{timestamp}_{filename}
    // Ensures unique paths and organization by liquidation
    const timestamp = Date.now();
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `liquidations/${liquidationId}/${timestamp}_${cleanFileName}`;
    const storageRef = ref(storage, storagePath);

    // 3. Upload with SDK (Resumable)
    // Metadata is important for some CORS configs, though strict SDK use usually bypasses preflight issues if bucket is standard.
    const metadata = {
        contentType: 'application/pdf'
    };

    return new Promise((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageRef, file, metadata);

        uploadTask.on('state_changed',
            (snapshot) => {
                // Optional: Monitor progress here if needed in future
                // const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                // console.log('Upload is ' + progress + '% done');
            },
            (error) => {
                // Handle unsuccessful uploads
                console.error("[Liquidations] Upload failed:", error);

                // Specific error handling based on code?
                // error.code === 'storage/unauthorized' etc.
                reject(new Error(`Error subiendo PDF: ${error.message}`));
            },
            async () => {
                // Handle successful uploads on complete
                try {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    resolve({
                        pdfUrl: downloadURL,
                        pdfStoragePath: storagePath
                    });
                } catch (e) {
                    reject(new Error("Error obteniendo URL de descarga: " + e.message));
                }
            }
        );
    });
};
