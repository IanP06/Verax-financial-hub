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
test('upload does not authorize payment and payment must match amount/date/reference', () => {
    const uploaded = transition({ status: 'APPROVED_WAITING_INVOICE' }, 'UPLOAD', { receipt: {} }, true, now);
    assert.equal(uploaded.status, 'INVOICE_REVIEW');
    const req = { status: 'READY_TO_PAY', totalCents: 10000, invoiceStatus: 'UPLOADED' };
    const payment = { date: '2026-10-28', amount: 100, account: 'Banco', reference: '123' };
    assert.throws(() => transition(req, 'PAY', payment, true, now));
    assert.equal(transition({ ...req, invoiceStatus: 'VERIFIED' }, 'PAY', payment, true, now).status, 'PAGO');
    for (const change of [{ amount: 101 }, { date: '2026-10-29' }, { reference: '' }]) assert.throws(() => transition(req, 'PAY', { ...payment, ...change }, false, now));
    assert.throws(() => transition({ status: 'PAGO' }, 'REJECT', { reason: 'error' }, false, now));
});
