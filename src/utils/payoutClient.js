import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

// Keep the key after network errors: retrying a click must not create a second order.
export async function payoutCommand(action, requestId, payload = {}) {
    const uid = getAuth().currentUser?.uid;
    if (!uid) throw new Error('Iniciá sesión nuevamente.');
    const signature = JSON.stringify({ uid, action, requestId, payload });
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signature));
    const key = `payout-operation:${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')}`;
    const operationId = localStorage.getItem(key) || crypto.randomUUID();
    localStorage.setItem(key, operationId);
    try {
        const result = await httpsCallable(getFunctions(undefined, 'us-central1'), 'payoutCommand')({ action, requestId, payload, operationId });
        // CREATE keys stay until the request reaches a terminal result. A second click
        // with the same cases returns the original request instead of creating another.
        if (action !== 'CREATE') localStorage.removeItem(key);
        return result.data;
    } catch (error) {
        if (['functions/failed-precondition', 'functions/permission-denied'].includes(error.code)) localStorage.removeItem(key);
        throw error;
    }
}

export function clearCreateRetryKey() {
    // Only terminal failed/rejected requests can safely be resubmitted.
    // Called explicitly by the user from their request history.
    Object.keys(localStorage).filter(key => key.startsWith('payout-operation:')).forEach(key => localStorage.removeItem(key));
}

export const payoutLabels = { PROCESSING: 'Procesando selección', SUBMITTED: 'Solicitada', PENDIENTE_APROBACION: 'Solicitada',
    APPROVED_WAITING_INVOICE: 'Pendiente de pago', NEEDS_INVOICE: 'Pendiente de pago', PENDIENTE_FACTURA: 'Pendiente de pago',
    INVOICE_REVIEW: 'Pendiente de pago', READY_TO_PAY: 'Pendiente de pago', PENDIENTE_PAGO: 'Pendiente de pago', APPROVED_SCHEDULED: 'Pago programado',
    REJECTED: 'Rechazada', FAILED: 'No presentada · revisar casos', PAGO: 'Pagada', PAID: 'Pagada' };
export const requestNumber = req => req.requestNumber || `LEG-${req.id}`;
