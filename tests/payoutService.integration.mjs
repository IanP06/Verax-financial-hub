import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { payoutService } from '../functions/service.js';

let app, db, service, index = 0;
const now = new Date('2026-10-28T15:00:00Z');
before(() => {
    if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8085') throw new Error('Emulador local requerido.');
    app = initializeApp({ projectId: 'demo-verax-payouts' }, 'payout-tests'); db = getFirestore(app); service = payoutService(db, { now: () => now, verifyPaymentReceipt: async (uid, requestId, receipt) => { assert.equal(receipt.storagePath, `payment_receipts/${requestId}/test.pdf`); return { ...receipt, uploadedByUid: uid, sha256: "test-hash" }; } });
});
after(async () => { await db.terminate(); await deleteApp(app); });
beforeEach(async () => {
    const response = await fetch('http://127.0.0.1:8085/emulator/v1/projects/demo-verax-payouts/databases/(default)/documents', { method: 'DELETE' });
    assert.equal(response.ok, true);
    await db.doc('userProfiles/ana').set({ role: 'analyst', analystKey: 'ANA', isActive: true });
    await db.doc('userProfiles/admin').set({ role: 'admin' });
    await db.doc('settings/analystRules').set({ rules: [] });
});
const operation = () => `test-operation-${String(++index).padStart(16, '0')}`;
async function seed(count, changes = {}) {
    const ids = Array.from({ length: count }, (_, n) => `case-${String(n).padStart(4, '0')}`);
    for (let start = 0; start < ids.length; start += 200) {
        const batch = db.batch();
        ids.slice(start, start + 200).forEach(id => batch.set(db.doc(`invoices/${id}`), { analista: 'ANA', fecha: '01/08/2026', estadoPago: 'IMPAGO', totalAPagarAnalista: 100.25, siniestro: `ST-${id}`, ...changes }));
        await batch.commit();
    }
    return ids;
}
async function drain(result) {
    for (let i = 0; i < 100; i++) {
        const job = (await db.doc(`payoutJobs/${result.jobId}`).get()).data();
        if (['DONE', 'FAILED', 'BLOCKED'].includes(job.phase)) return job;
        await service.advance(result.jobId);
    }
    throw new Error('Proceso no termina');
}
const create = ids => service.command('ana', { action: 'CREATE', operationId: operation(), payload: { invoiceIds: ids } });
const action = (requestId, name, payload = {}) => service.command(name === 'UPLOAD' ? 'ana' : 'admin', { requestId, action: name, operationId: operation(), payload: name === 'PAY' ? { receiptReviewed: true, receipt: { storagePath: `payment_receipts/${requestId}/test.pdf` }, ...payload } : payload });
for (const count of [1, 5, 6, 20, 50, 100, 300]) test(`${count} cases create one request with exact total and absent mirrors`, async () => {
    const result = await create(await seed(count));
    assert.equal((await drain(result)).phase, 'DONE');
    const req = (await db.doc(`payoutRequests/${result.requestId}`).get()).data();
    assert.equal(req.status, 'SUBMITTED'); assert.equal(req.totalCents, count * 10025); assert.match(req.requestNumber, /^28102026_01_0001$/);
    assert.equal((await db.collection(`payoutRequests/${result.requestId}/items`).get()).size, count);
    assert.equal((await db.collection('analyst_invoices/ana/items').get()).size, count);
});
test('concurrent retries and competing selections cannot reserve cases twice', async () => {
    const ids = await seed(100), command = { action: 'CREATE', operationId: operation(), payload: { invoiceIds: ids } };
    const [a, b] = await Promise.all([service.command('ana', command), service.command('ana', command)]);
    assert.equal(a.requestId, b.requestId);
    await Promise.all([service.advance(a.jobId), service.advance(a.jobId)]); await drain(a);
    const competing = await create(ids); assert.equal((await drain(competing)).phase, 'FAILED');
    assert.equal((await db.doc(`invoices/${ids[0]}`).get()).data().linkedPayoutRequestId, a.requestId);
});
test('failure in a later chunk releases all reservations and leaves an auditable failed request', async () => {
    const ids = await seed(100); await db.doc(`invoices/${ids[99]}`).update({ analista: 'BETO' });
    const result = await create(ids); assert.equal((await drain(result)).phase, 'FAILED');
    assert.equal((await db.doc(`invoices/${ids[0]}`).get()).data().estadoPago, 'IMPAGO');
    assert.equal((await db.doc(`payoutRequests/${result.requestId}`).get()).data().totalCents, 0);
});
test('full 100-case lifecycle goes directly from approval to payment despite old invoice settings', async () => {
    await db.doc('settings/analystRules').set({ rules: [{ name: 'ANA', requiresInvoice: true }] });
    const result = await create(await seed(100)); await drain(result);
    await drain(await action(result.requestId, 'APPROVE'));
    let req = (await db.doc(`payoutRequests/${result.requestId}`).get()).data(); assert.match(req.orderNumber, /^28102026_01_0001$/);
    const payment = { amount: 10025, date: '2026-10-28', account: 'Banco A', reference: 'TRANSFER-1' };
    assert.equal(req.status, 'READY_TO_PAY'); assert.equal(req.requiresInvoiceSnapshot, false);
    await assert.rejects(() => action(result.requestId, 'VERIFY'), /Acción inválida/);
    await drain(await action(result.requestId, 'PAY', payment));
    req = (await db.doc(`payoutRequests/${result.requestId}`).get()).data(); assert.equal(req.status, 'PAGO');
    assert.equal(req.payment.receipt.sha256, 'test-hash'); assert.equal(req.payment.receiptReviewedByUid, 'admin');
    assert.equal((await db.collection('analystPayments').get()).size, 1);
    await assert.rejects(() => action(result.requestId, 'PAY', payment));
});
test('changed amount blocks approval; rejection releases cases without losing original snapshot', async () => {
    const ids = await seed(6), result = await create(ids); await drain(result);
    await db.doc(`invoices/${ids[0]}`).update({ totalAPagarAnalista: 999 });
    assert.equal((await drain(await action(result.requestId, 'APPROVE'))).phase, 'FAILED');
    await drain(await action(result.requestId, 'REJECT', { reason: 'Corregir importe' }));
    assert.equal((await db.doc(`invoices/${ids[0]}`).get()).data().estadoPago, 'IMPAGO');
    assert.equal((await db.doc(`payoutRequests/${result.requestId}/items/${ids[0]}`).get()).data().total, 100.25);
});
test('foreign users cannot approve or upload; reused operation keys cannot change payload', async () => {
    const ids = await seed(1), result = await create(ids); await drain(result);
    await assert.rejects(() => service.command('ana', { action: 'APPROVE', requestId: result.requestId, operationId: operation() }));
    await assert.rejects(() => service.command('unknown', { action: 'CREATE', operationId: operation(), payload: { invoiceIds: ids } }));
    const command = { action: 'CREATE', operationId: operation(), payload: { invoiceIds: ['another'] } };
    await service.command('ana', command);
    await assert.rejects(() => service.command('ana', { ...command, payload: { invoiceIds: ids } }));
});

test('bank operation cannot be reused on a second order', async () => {
    const first = await create(await seed(1)); await drain(first); await drain(await action(first.requestId, 'APPROVE'));
    const payment = { amount: 100.25, date: '2026-10-28', account: 'Banco A', reference: 'BANK-123' };
    await drain(await action(first.requestId, 'PAY', payment));
    await db.doc('invoices/other').set({ analista: 'ANA', fecha: '01/08/2026', estadoPago: 'IMPAGO', totalAPagarAnalista: 100.25 });
    const second = await create(['other']); await drain(second); await drain(await action(second.requestId, 'APPROVE'));
    await assert.rejects(() => action(second.requestId, 'PAY', payment), /referencia bancaria/);
});

test('legacy requests keep IDs and original snapshots through approval and payment', async () => {
    const ids = await seed(1);
    await db.doc(`invoices/${ids[0]}`).update({ linkedPayoutRequestId: 'legacy', estadoPago: 'PENDIENTE_APROBACION' });
    await db.doc('payoutRequests/legacy').set({ analystUid: 'ana', analystName: 'ANA', status: 'SUBMITTED', invoiceIds: ids,
        totalAmount: 100.25, invoiceSnapshot: [{ id: ids[0], total: 100.25, siniestro: 'OLD-123' }] });
    await drain(await action('legacy', 'APPROVE'));
    await drain(await action('legacy', 'PAY', { date: '2026-10-28', amount: 100.25, account: 'A', reference: 'B' }));
    const req = (await db.doc('payoutRequests/legacy').get()).data();
    assert.equal(req.status, 'PAGO'); assert.equal(req.invoiceSnapshot[0].siniestro, 'OLD-123');
});

test('interrupted application can resume its cursor without repeating previous payments', async () => {
    const ids = await seed(100), result = await create(ids); await drain(result); await drain(await action(result.requestId, 'APPROVE'));
    const paid = await action(result.requestId, 'PAY', { date: '2026-10-28', amount: 10025, account: 'A', reference: 'B' });
    await service.advance(paid.jobId); await service.advance(paid.jobId); // validation chunks
    await service.advance(paid.jobId); // first apply chunk
    await db.doc(`invoices/${ids[99]}`).update({ totalAPagarAnalista: 999 }); // privileged external interference
    await service.advance(paid.jobId);
    assert.equal((await db.doc(`payoutJobs/${paid.jobId}`).get()).data().phase, 'BLOCKED');
    await db.doc(`invoices/${ids[99]}`).update({ totalAPagarAnalista: 100.25 });
    await action(result.requestId, 'RESUME');
    assert.equal((await drain(paid)).phase, 'DONE');
    assert.equal((await db.collection('analystPayments').get()).size, 1);
});

test('payment cannot bypass server receipt verification or explicit review', async () => {
    const result = await create(await seed(1)); await drain(result); await drain(await action(result.requestId, 'APPROVE'));
    const payload = { amount: 100.25, date: '2026-10-28', account: 'A', reference: 'proof-test', receiptReviewed: true, receipt: { storagePath: `payment_receipts/${result.requestId}/test.pdf`, sha256: 'forged' } };
    await assert.rejects(() => action(result.requestId, 'PAY', { ...payload, receiptReviewed: false }), /cotejo/);
    const unverified = payoutService(db, { now: () => now });
    await assert.rejects(() => unverified.command('admin', { requestId: result.requestId, action: 'PAY', operationId: operation(), payload }), /verificar el comprobante/);
    assert.equal((await db.doc(`payoutRequests/${result.requestId}`).get()).data().status, 'READY_TO_PAY');
    assert.equal((await db.collection('analystPayments').get()).size, 0);
});

for (const status of ['APPROVED_WAITING_INVOICE', 'NEEDS_INVOICE', 'PENDIENTE_FACTURA', 'INVOICE_REVIEW']) test(`legacy ${status} can be paid without a new invoice step`, async () => {
    const result = await create(await seed(1)); await drain(result); await drain(await action(result.requestId, 'APPROVE'));
    await db.doc(`payoutRequests/${result.requestId}`).update({ status, requiresInvoiceSnapshot: true, invoiceStatus: 'REQUIRED', invoiceReceipt: { fileName: 'historical.pdf' } });
    await drain(await action(result.requestId, 'PAY', { date: '2026-10-28', amount: 100.25, account: 'A', reference: status }));
    const request = (await db.doc(`payoutRequests/${result.requestId}`).get()).data();
    assert.equal(request.status, 'PAGO'); assert.equal(request.invoiceReceipt.fileName, 'historical.pdf');
});

test('simultaneous requests reserve distinct numbers and retries never advance the counter twice', async () => {
    const ids = await seed(8);
    const commands = ids.map(id => ({ action: 'CREATE', operationId: operation(), payload: { invoiceIds: [id] } }));
    const results = await Promise.all(commands.map(c => service.command('ana', c)));
    assert.equal(new Set(results.map(r => r.requestNumber)).size, 8);
    assert.deepEqual(results.map(r => Number(r.requestNumber.split('_')[2])).sort((a,b)=>a-b), [1,2,3,4,5,6,7,8]);
    const retry = await service.command('ana', commands[0]);
    assert.equal(retry.requestNumber, results[0].requestNumber);
    assert.equal((await db.doc('payoutCounters/analyst-01').get()).data().value, 8);
    assert.equal((await db.collection('payoutNumbers').get()).size, 8);
});
test('analyst IDs are stable, unique and numbering follows Argentina date without resetting sequence', async () => {
    const ids = await seed(3);
    await db.doc('userProfiles/beto').set({ role: 'analyst', analystKey: 'BETO' });
    const a = await create([ids[0]]);
    const b = await service.command('beto', { action: 'CREATE', operationId: operation(), payload: { invoiceIds: [ids[1]] } });
    assert.equal(a.requestNumber, '28102026_01_0001'); assert.equal(b.requestNumber, '28102026_02_0001');
    const later = payoutService(db, { now: () => new Date('2026-10-30T01:00:00Z') });
    const c = await later.command('ana', { action: 'CREATE', operationId: operation(), payload: { invoiceIds: [ids[2]] } });
    assert.equal(c.requestNumber, '29102026_01_0002');
    await drain(a); await drain(await action(a.requestId, 'APPROVE'));
    assert.equal((await db.doc(`payoutRequests/${a.requestId}`).get()).data().orderNumber, a.requestNumber);
});
test('reserved codes cannot be reused even if a counter is incorrectly rolled back', async () => {
    const ids = await seed(2); await create([ids[0]]);
    await db.doc('payoutCounters/analyst-01').update({ value: 0 });
    await assert.rejects(() => create([ids[1]]), /reservado/);
    assert.equal((await db.collection('payoutRequests').get()).size, 1);
});
test('two-digit analyst capacity is enforced and sequence grows beyond four digits', async () => {
    const ids = await seed(2);
    await db.doc('payoutCounters/analystRegistry').set({ value: 99, analysts: { previous: 99 } });
    await assert.rejects(() => create([ids[0]]), /IDs de analista/);
    await db.doc('payoutCounters/analystRegistry').set({ value: 1, analysts: { ana: 1 } });
    await db.doc('payoutCounters/analyst-01').set({ value: 9999, analystUid: 'ana' });
    assert.equal((await create([ids[1]])).requestNumber, '28102026_01_10000');
});
