
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

/**
 * Sanitizes a string for use in Storage paths.
 * Rules:
 * - Replace spaces with '_'
 * - Remove non-alphanumeric characters except '_', '-', and '.' (for extension)
 * - Remove common problematic chars like '°', '/', ':' explicitly just in case regex misses
 * 
 * @param {string} str 
 * @returns {string}
 */
const sanitizePathSegment = (str) => {
    if (!str) return 'untitled';
    // 1. Replace spaces with underscore
    let clean = str.replace(/\s+/g, '_');
    // 2. Remove specific troublesome chars explicitly (Unicode etc)
    clean = clean.replace(/[°ºª/\\:*?"<>|]/g, '');
    // 3. Keep only Alphanumeric, _, -, .
    clean = clean.replace(/[^a-zA-Z0-9_.-]/g, '');
    return clean;
};

/**
 * Uploads a Liquidation PDF to Firebase Storage using the SDK.
 * STRICT MODE: No XHR/Fetch manual calls.
 * 
 * @param {Object} params
 * @param {File} params.file - The PDF file to upload.
 * @param {string} params.liquidationId - The folder name (Liquidation Number).
 * @returns {Promise<{pdfUrl: string, pdfStoragePath: string}>}
 */
export const uploadLiquidationPdf = async ({ file, liquidationId }) => {
    // 1. Validation
    if (!file) throw new Error("No se proporcionó ningún archivo.");
    if (file.type !== 'application/pdf') throw new Error("El archivo debe ser un PDF.");

    const MAX_SIZE = 20 * 1024 * 1024; // 20MB
    if (file.size > MAX_SIZE) throw new Error("El archivo excede el límite de 20MB.");

    if (!liquidationId) throw new Error("Falta el ID de Liquidación para la carpeta.");

    // 2. Prepare Paths (Strict Normalization)
    const storage = getStorage();

    // Normalize Folder Name (e.g. "O.L. N° 123" -> "O.L._N_123")
    const safeFolder = sanitizePathSegment(liquidationId);

    // Normalize Filename
    const timestamp = Date.now();
    const safeFilename = sanitizePathSegment(file.name);

    // Final Path: liquidations/Safe_Folder/123456789_Safe_Name.pdf
    const storagePath = `liquidations/${safeFolder}/${timestamp}_${safeFilename}`;
    const storageRef = ref(storage, storagePath);

    // 3. Upload with SDK
    const metadata = {
        contentType: 'application/pdf'
    };

    console.log(`[Upload] Starting SDK upload to: ${storagePath}`);

    return new Promise((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageRef, file, metadata);

        uploadTask.on('state_changed',
            (snapshot) => {
                // Progress monitoring (optional)
            },
            (error) => {
                console.error("[Liquidations] Upload SDK Error:", error);
                // Map common storage errors to user-friendly messages
                let msg = error.message;
                if (error.code === 'storage/unauthorized') msg = "Permisos insuficientes para subir archivos.";
                if (error.code === 'storage/canceled') msg = "Subida cancelada.";
                reject(new Error(`Error subiendo PDF: ${msg}`));
            },
            async () => {
                try {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    console.log("[Upload] Success. URL:", downloadURL);
                    resolve({
                        pdfUrl: downloadURL,
                        pdfStoragePath: storagePath
                    });
                } catch (e) {
                    console.error("[Liquidations] getDownloadURL Error:", e);
                    reject(new Error("Error obteniendo URL de descarga: " + e.message));
                }
            }
        );
    });
};
