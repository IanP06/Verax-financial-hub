import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eligible, invoiceCents, transition, day } from '../functions/domain.js';
const now = new Date('2026-10-28T15:00:00Z');
test('eligibility is checked at 40 days using Argentina calendar and current ownership', () => {
    const invoice = { analista: 'ANA', fecha: '18/09/2026', totalAPagarAnalista: 100, estadoPago: 'IMPAGO' };
    assert.doesNotThrow(() => eligible(invoice, 'ANA', now));
    for (const change of [{ fecha: '19/09/2026' }, { analista: 'BETO' }, { estadoPago: 'PAGO' }, { linkedPayoutRequestId: 'other' }, { paymentStatus: 'PENDIENTE_PAGO' }]) assert.throws(() => eligible({ ...invoice, ...change }, 'ANA', now));
    assert.throws(() => day('2026-02-30'));
});
test('amounts preserve cents and never count the savings percentage as money', () => {
    assert.equal(invoiceCents({ totalAPagarAnalista: '1.234,56' }), 123456);
    assert.equal(invoiceCents({ montoGestion: 100, ahorroAPagar: 25.50, plusPorAhorro: 5, viaticosAPagar: 10 }), 13550);
    assert.throws(() => invoiceCents({ totalAPagarAnalista: 'error' }));
});
test('approval skips invoice workflow and legacy approved orders remain payable with bank proof', () => {
    assert.equal(transition({ status: 'SUBMITTED', requiresInvoiceSnapshot: true }, 'APPROVE', {}, now).status, 'READY_TO_PAY');
    const payment = { receiptReviewed: true, receipt: { storagePath: 'payment_receipts/test/test.pdf' }, date: '2026-10-28', amount: 100, account: 'Banco', reference: '123' };
    for (const status of ['READY_TO_PAY', 'APPROVED_WAITING_INVOICE', 'NEEDS_INVOICE', 'PENDIENTE_FACTURA', 'INVOICE_REVIEW']) {
        const req = { status, totalCents: 10000, invoiceStatus: 'REQUIRED', requiresInvoiceSnapshot: true };
        assert.equal(transition(req, 'PAY', payment, now).status, 'PAGO');
        for (const change of [{ receiptReviewed: false }, { receipt: null }, { amount: 101 }, { date: '2026-10-29' }, { reference: '' }]) assert.throws(() => transition(req, 'PAY', { ...payment, ...change }, now));
        for (const action of ['UPLOAD', 'VERIFY']) assert.throws(() => transition(req, action, {}, now), /Acción inválida/);
    }
    assert.throws(() => transition({ status: 'SUBMITTED', totalCents: 10000 }, 'PAY', payment, now), /lista para pagar/);
    assert.throws(() => transition({ status: 'PAGO' }, 'REJECT', { reason: 'error' }, now));
});
