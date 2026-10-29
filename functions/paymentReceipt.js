import { createHash } from 'node:crypto';
import { requireValue } from './domain.js';

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
export function validateReceiptFile(bytes, contentType) {
    requireValue(bytes.length > 0 && bytes.length <= MAX_RECEIPT_BYTES, 'El comprobante debe tener hasta 10 MB.');
    const valid = contentType === 'application/pdf' ? bytes.subarray(0, 5).toString() === '%PDF-'
        : contentType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : contentType === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    requireValue(valid, 'El contenido del comprobante no corresponde a un PDF, JPG o PNG válido.');
    return createHash('sha256').update(bytes).digest('hex');
}

export function paymentReceiptVerifier(bucket) {
    return async (uid, requestId, receipt) => {
        requireValue(receipt && typeof receipt.fileName === 'string' && /^[a-zA-Z0-9-]+\.(pdf|jpg|png)$/.test(receipt.fileName), 'Adjuntá el comprobante bancario.');
        requireValue(receipt.storagePath === `payment_receipts/${requestId}/${receipt.fileName}`, 'El comprobante no pertenece a esta orden.');
        requireValue(typeof receipt.originalName === 'string' && receipt.originalName.trim().length > 0 && receipt.originalName.length <= 200, 'Nombre del comprobante inválido.');
        const file = bucket.file(receipt.storagePath);
        const [metadata] = await file.getMetadata();
        requireValue(metadata.metadata?.uploadedByUid === uid && metadata.metadata?.requestId === requestId, 'El comprobante no pertenece a este registro de pago.');
        const types = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png' };
        requireValue(types[receipt.fileName.split('.').pop()] === metadata.contentType && Number(metadata.size) > 0 && Number(metadata.size) <= MAX_RECEIPT_BYTES, 'Formato o tamaño de comprobante inválido.');
        // Read the exact immutable generation checked above, not a subsequently replaced object.
        const [bytes] = await bucket.file(receipt.storagePath, { generation: metadata.generation }).download();
        const sha256 = validateReceiptFile(bytes, metadata.contentType);
        return { fileName: receipt.fileName, originalName: receipt.originalName.trim(), storagePath: receipt.storagePath,
            size: bytes.length, contentType: metadata.contentType, generation: String(metadata.generation), sha256,
            uploadedByUid: uid, uploadedAt: metadata.timeCreated };
    };
}
