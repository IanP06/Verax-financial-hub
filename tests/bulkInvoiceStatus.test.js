import test from 'node:test';
import assert from 'node:assert/strict';
import { executeBulkStatusChange, parseStatusDate, validateBulkStatusChange, visibleSelection } from '../src/utils/bulkInvoiceStatus.js';

const invoice = (id, extra = {}) => ({ id, nroFactura: id, analista: 'Áriel', estadoPago: 'IMPAGO', estadoDeCobro: 'NO COBRADO', ...extra });
const profiles = [{ uid: 'analyst-a', analystKey: ' ariel ', role: 'analyst' }];
function harness(rows, { role = 'admin', failCommit = false } = {}) {
    const docs = new Map([['userProfiles/admin', { role }], ...rows.map(row => [`invoices/${row.id}`, { ...row }])]);
    let writes = [];
    const api = {
        doc: (_db, ...path) => path.join('/'), serverTimestamp: () => 'SERVER_TIMESTAMP',
        Timestamp: { fromDate: date => date.getTime() },
        runTransaction: async (_db, callback) => {
            writes = [];
            const result = await callback({
                get: async ref => {
                    assert.equal(writes.length, 0, 'All reads must precede writes');
                    return { exists: () => docs.has(ref), data: () => docs.get(ref) };
                },
                update: (ref, data) => writes.push({ ref, data, method: 'update' }),
                set: (ref, data, options) => { assert.deepEqual(options, { merge: true }); writes.push({ ref, data, method: 'set' }); },
            });
            if (failCommit) throw new Error('permission-denied');
            for (const write of writes) if (write.method === 'update' && !docs.has(write.ref)) throw new Error('missing');
            for (const write of writes) docs.set(write.ref, { ...docs.get(write.ref), ...write.data });
            return result;
        },
    };
    return { docs, writes: () => writes, run: (selected, change, overrides = {}) => executeBulkStatusChange({ api, db: {}, actorUid: 'admin', profiles, rows: selected, change, ...overrides }) };
}

test('selected-only payment + collection commits all invoices and missing mirrors', async () => {
    const rows = [invoice('1'), invoice('2'), invoice('3')];
    const h = harness(rows);
    const result = await h.run(rows.slice(0, 2), { estadoPago: 'PAGO', fechaPago: '2026-10-19', estadoDeCobro: 'COBRADO', fechaCobro: '2026-10-18' });
    assert.equal(result.length, 2);
    for (const id of ['1', '2']) {
        assert.equal(h.docs.get(`invoices/${id}`).estadoPago, 'PAGO');
        assert.equal(h.docs.get(`invoices/${id}`).estadoDeCobro, 'COBRADO');
        assert.equal(h.docs.get(`invoices/${id}`).fechaPago, '18/10/2026');
        assert.equal(h.docs.get(`analyst_invoices/analyst-a/items/${id}`).paymentStatus, 'PAGO');
        assert.equal(h.docs.get(`invoices/${id}`).statusUpdatedBy, 'admin');
    }
    assert.deepEqual(h.docs.get('invoices/3'), rows[2]);
});
test('collection-only preserves payment and needs no analyst profile', async () => {
    const rows = [invoice('1', { linkedPayoutRequestId: 'req', estadoPago: 'PENDIENTE_FACTURA', analista: '' })];
    const h = harness(rows);
    await h.run(rows, { estadoDeCobro: 'COBRADO', fechaCobro: '2026-10-19' }, { profiles: [] });
    assert.equal(h.docs.get('invoices/1').estadoPago, 'PENDIENTE_FACTURA');
    assert.equal(h.writes().length, 1);
});
test('payment-only preserves collection data and existing mirror fields', async () => {
    const rows = [invoice('1', { estadoDeCobro: 'COBRADO', fechaCobro: 123 })];
    const h = harness(rows);
    h.docs.set('analyst_invoices/analyst-a/items/1', { invoiceNumber: '1' });
    await h.run(rows, { estadoPago: 'PAGO', fechaPago: '2026-10-19' });
    assert.equal(h.docs.get('invoices/1').fechaCobro, 123);
    assert.equal(h.docs.get('analyst_invoices/analyst-a/items/1').invoiceNumber, '1');
});
test('reverting clears only the corresponding dates', async () => {
    const rows = [invoice('1', { estadoPago: 'PAGO', paymentStatus: 'PAGO', estadoDeCobro: 'COBRADO', fechaPagoAnalista: '2026-10-18', fechaCobro: 123, fechaPago: '18/10/2026', cobradoAt: 456 })];
    const h = harness(rows);
    await h.run(rows, { estadoPago: 'IMPAGO', estadoDeCobro: 'NO COBRADO' });
    for (const key of ['fechaPagoAnalista', 'fechaCobro', 'fechaPago', 'cobradoAt']) assert.equal(h.docs.get('invoices/1')[key], null);
    assert.equal(h.docs.get('analyst_invoices/analyst-a/items/1').paymentDate, null);
});
test('missing invoice aborts all changes', async () => {
    const rows = [invoice('1'), invoice('2')];
    const h = harness(rows.slice(0, 1));
    await assert.rejects(h.run(rows, { estadoDeCobro: 'NO COBRADO' }), /ya no existe/);
    assert.deepEqual(h.docs.get('invoices/1'), rows[0]);
    assert.equal(h.writes().length, 0);
});
test('concurrent status change is detected from fresh transactional reads', async () => {
    const selected = invoice('1');
    const h = harness([invoice('1', { estadoDeCobro: 'COBRADO' })]);
    await assert.rejects(h.run([selected], { estadoDeCobro: 'NO COBRADO' }), /cambió/);
    assert.equal(h.writes().length, 0);
});
test('commit errors propagate and no local success can be returned', async () => {
    const rows = [invoice('1'), invoice('2')];
    const h = harness(rows, { failCommit: true });
    await assert.rejects(h.run(rows, { estadoPago: 'PAGO', fechaPago: '2026-10-19' }), /permission-denied/);
    assert.deepEqual(h.docs.get('invoices/1'), rows[0]);
    assert.equal(h.docs.has('analyst_invoices/analyst-a/items/1'), false);
});
test('linked requests and workflow payment statuses cannot be overwritten', async () => {
    for (const extra of [{ linkedPayoutRequestId: 'req' }, { estadoPago: 'PENDIENTE_PAGO' }, { paymentStatus: 'PENDIENTE_APROBACION' }]) {
        const rows = [invoice('1', extra)];
        const h = harness(rows);
        await assert.rejects(h.run(rows, { estadoPago: 'IMPAGO' }), /Solicitudes/);
        assert.equal(h.writes().length, 0);
    }
});
test('non-admin and signed-out users cannot submit', async () => {
    const rows = [invoice('1')];
    await assert.rejects(harness(rows, { role: 'analyst' }).run(rows, { estadoDeCobro: 'NO COBRADO' }), /administrador/);
    await assert.rejects(harness(rows).run(rows, { estadoDeCobro: 'NO COBRADO' }, { actorUid: null }), /sesión/);
});
test('missing or ambiguous analyst mapping aborts before all writes', async () => {
    const rows = [invoice('1'), invoice('2')];
    for (const mapping of [[], [...profiles, { ...profiles[0], uid: 'other' }]]) {
        const h = harness(rows);
        await assert.rejects(h.run(rows, { estadoPago: 'IMPAGO' }, { profiles: mapping }), /única/);
        assert.equal(h.writes().length, 0);
    }
});
test('dates are strict and leap days are validated', () => {
    for (const date of ['', '2026-02-29', '2026-04-31', '19/10/2026', '2026-13-01']) assert.throws(() => parseStatusDate(date), /válida/);
    assert.equal(parseStatusDate('2028-02-29').getDate(), 29);
});
test('empty selections, duplicates, oversized operations and invalid states are rejected', () => {
    assert.throws(() => validateBulkStatusChange([], {}), /Seleccioná/);
    assert.throws(() => validateBulkStatusChange([invoice('1'), invoice('1')], { estadoPago: 'IMPAGO' }), /repetidos/);
    assert.throws(() => validateBulkStatusChange(Array.from({ length: 201 }, (_, i) => invoice(String(i))), { estadoPago: 'IMPAGO' }), /200/);
    assert.throws(() => validateBulkStatusChange([invoice('1')], {}), /Elegí/);
    assert.throws(() => validateBulkStatusChange([invoice('1')], { estadoPago: 'OTHER' }), /inválido/);
});
test('filtered-out and deleted rows are excluded from the modal selection', () => {
    const visible = [invoice('3'), invoice('1')];
    assert.deepEqual(visibleSelection(visible, ['1', '2', 'deleted']).map(row => row.id), ['1']);
    assert.deepEqual(visibleSelection(visible, ['1', '3']).map(row => row.id), ['3', '1']);
});
