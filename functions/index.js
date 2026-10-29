import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { payoutService } from './service.js';
import { DomainError } from './domain.js';
import { paymentReceiptVerifier } from './paymentReceipt.js';

initializeApp();
const service = payoutService(getFirestore(), { verifyPaymentReceipt: (...args) => paymentReceiptVerifier(getStorage().bucket())(...args) });
export const payoutCommand = onCall({ region: 'us-central1', timeoutSeconds: 120 }, async request => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Iniciá sesión.');
    try {
        return await service.command(request.auth.uid, request.data || {});
    } catch (error) {
        if (error instanceof DomainError) throw new HttpsError('failed-precondition', error.message);
        console.error('Payout command failed', error);
        throw new HttpsError('internal', 'No se pudo procesar. Reintentá con la misma operación.');
    }
});
export const processPayout = onDocumentWritten({ document: 'payoutJobs/{jobId}', region: 'us-central1', retry: true, timeoutSeconds: 120 }, async event => {
    await service.advance(event.params.jobId);
});
