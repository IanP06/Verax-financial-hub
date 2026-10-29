export class DomainError extends Error {
    constructor(message) { super(message); this.name = 'DomainError'; }
}
export function requireValue(condition, message) {
    if (!condition) throw new DomainError(message);
}
export const nameKey = value => String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
export function cents(value) {
    let text = String(value ?? '').replace(/[$\s]/g, '');
    if (text.includes(',')) text = text.lastIndexOf(',') > text.lastIndexOf('.') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
    else if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, '');
    const number = typeof value === 'number' ? value : Number(text);
    requireValue(text !== '' && Number.isFinite(number) && number >= 0 && Number.isSafeInteger(Math.round(number * 100)), 'Importe inválido. Revisar la factura.');
    return Math.round(number * 100);
}
export function invoiceCents(invoice) {
    for (const field of ['totalAPagarAnalista', 'totalALiquidar']) {
        if (invoice[field] != null && invoice[field] !== '') return cents(invoice[field]);
    }
    // plusPorAhorro is a percentage, not an amount.
    return cents(invoice.montoGestion || 0) + cents(invoice.ahorroAPagar || 0) + cents(invoice.viaticosAPagar || 0);
}
export function day(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    requireValue(match, 'Fecha inválida.');
    const date = new Date(`${value}T00:00:00Z`);
    requireValue(Number.isFinite(+date) && date.toISOString().slice(0, 10) === value, 'Fecha inválida.');
    return +date / 86400000;
}
export function localDate(now) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function eligible(invoice, analyst, now) {
    const raw = invoice.fechaEmision || invoice.fecha || invoice.issueDate || '';
    const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const issued = match ? `${match[3]}-${match[2]}-${match[1]}` : raw;
    requireValue([invoice.analista, invoice.analyst].some(n => nameKey(n) === nameKey(analyst)), 'El caso no pertenece al analista.');
    requireValue((invoice.estadoPago || 'IMPAGO') === 'IMPAGO' && (invoice.paymentStatus || 'IMPAGO') === 'IMPAGO' && !invoice.linkedPayoutRequestId, 'El caso ya está pagado o vinculado a otra solicitud.');
    requireValue(day(localDate(now)) - day(issued) >= 40, 'El caso todavía no cumple 40 días.');
    invoiceCents(invoice);
}
export function snapshot(id, inv) {
    return { id, nroFactura: inv.nroFactura || inv.factura || inv.invoiceNumber || '-', siniestro: inv.siniestro || inv.claimNumber || '-',
        aseguradora: inv.aseguradora || inv.insurer || '-', fechaEmision: inv.fechaEmision || inv.fecha || inv.issueDate || '-',
        totalCents: invoiceCents(inv), total: invoiceCents(inv) / 100, currency: 'ARS' };
}
export function transition(request, action, payload, now) {
    const state = request.status;
    if (action === 'APPROVE') {
        requireValue(['SUBMITTED', 'PENDIENTE_APROBACION'].includes(state), 'La solicitud ya no está pendiente de aprobación.');
        return { status: 'READY_TO_PAY', invoiceState: 'PENDIENTE_PAGO', requiresInvoiceSnapshot: false, invoiceStatus: 'NOT_REQUIRED' };
    }
    if (action === 'REJECT') {
        requireValue(['SUBMITTED', 'PENDIENTE_APROBACION', 'APPROVED_WAITING_INVOICE', 'NEEDS_INVOICE', 'PENDIENTE_FACTURA', 'INVOICE_REVIEW', 'READY_TO_PAY', 'PENDIENTE_PAGO'].includes(state), 'No se puede rechazar en este estado.');
        requireValue(typeof payload.reason === 'string' && payload.reason.trim().length >= 3 && payload.reason.length <= 1000, 'Ingresá el motivo del rechazo.');
        return { status: 'REJECTED', invoiceState: 'IMPAGO', rejectionReason: payload.reason.trim() };
    }
    if (action === 'PAY') {
        if (payload.receiptOnly === true) {
            requireValue(payload.receipt?.storagePath, 'Adjuntá el comprobante del pago.');
            requireValue(['READY_TO_PAY', 'PENDIENTE_PAGO', 'APPROVED_SCHEDULED', 'APPROVED_WAITING_INVOICE', 'NEEDS_INVOICE', 'PENDIENTE_FACTURA', 'INVOICE_REVIEW'].includes(state), 'La orden no está lista para pagar.');
            const amountCents = request.totalCents ?? cents(request.totalAmount);
            requireValue(Number.isSafeInteger(amountCents) && amountCents >= 0, 'Importe inválido.');
            const date = localDate(now);
            return { status: 'PAGO', invoiceState: 'PAGO', paidAt: date,
                payment: { date, amount: amountCents / 100, amountCents, currency: 'ARS', registrationMode: 'RECEIPT_ONLY' } };
        }
        requireValue(payload.receiptReviewed === true && payload.receipt?.storagePath, 'Adjuntá el comprobante y confirmá el cotejo de beneficiario, importe, fecha y referencia.');
        requireValue(['READY_TO_PAY', 'PENDIENTE_PAGO', 'APPROVED_SCHEDULED', 'APPROVED_WAITING_INVOICE', 'NEEDS_INVOICE', 'PENDIENTE_FACTURA', 'INVOICE_REVIEW'].includes(state), 'La orden no está lista para pagar.');
        requireValue(cents(payload.amount) === (request.totalCents ?? cents(request.totalAmount)), 'El importe pagado debe coincidir con el total de la orden.');
        requireValue(day(payload.date) <= day(localDate(now)), 'La fecha de pago no puede ser futura.');
        for (const field of ['account', 'reference']) requireValue(typeof payload[field] === 'string' && payload[field].trim().length > 0 && payload[field].length <= 200, 'Completá cuenta de origen y referencia bancaria.');
        return { status: 'PAGO', invoiceState: 'PAGO', paidAt: payload.date, payment: { date: payload.date, amount: cents(payload.amount) / 100, amountCents: cents(payload.amount), account: payload.account.trim(), reference: payload.reference.trim(), currency: 'ARS' } };
    }
    throw new DomainError('Acción inválida.');
}
