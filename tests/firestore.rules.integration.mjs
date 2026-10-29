import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import * as api from 'firebase/firestore';
import { executeBulkStatusChange } from '../src/utils/bulkInvoiceStatus.js';

let env;
const inv = (extra = {}) => ({ analista: 'ANA', totalAPagarAnalista: 25000,
    estadoPago: 'IMPAGO', estadoDeCobro: 'NO COBRADO', ...extra });
before(async () => {
    if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8085') throw new Error('Solo se permite el emulador local 127.0.0.1:8085');
    env = await initializeTestEnvironment({ projectId: 'demo-verax-tests',
        firestore: { host: '127.0.0.1', port: 8085, rules: await readFile('firebase/firestore.rules', 'utf8') } });
});
after(async () => env?.cleanup());
beforeEach(async () => {
    await env.clearFirestore();
    await seed({
        'userProfiles/admin': { role: 'ADMIN' },
        'userProfiles/ana': { role: 'analyst', analystKey: 'ANA', isActive: true },
        'userProfiles/beto': { role: 'ANALYST', analystKey: 'BETO' },
        'userProfiles/inactive': { role: 'ADMIN', isActive: false },
        'invoices/a': inv(), 'invoices/b': inv({ analista: 'BETO' }),
        'settings/analystRules': { rules: [] }
    });
});
async function seed(docs) {
    await env.withSecurityRulesDisabled(async c => {
        const db = c.firestore(), batch = api.writeBatch(db);
        for (const [path, value] of Object.entries(docs)) batch.set(api.doc(db, path), value);
        await batch.commit();
    });
}
const dbFor = uid => uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
function requestBatch(db, ids = ['a'], options = {}) {
    const batch = api.writeBatch(db);
    batch.set(api.doc(db, 'payoutRequests/new'), {
        analystUid: 'ana', analystName: 'ANA', createdAt: api.serverTimestamp(), status: 'SUBMITTED',
        invoiceIds: ids, invoiceSnapshot: ids.map(id => ({ id, total: 25000 })),
        totalAmount: ids.length * 25000, expiresAt: null, requiresInvoiceSnapshot: false,
        invoiceStatus: 'NOT_REQUIRED', invoiceReceipt: null, history: [], ...options.request
    });
    if (!options.skipInvoices) for (const id of ids) {
        batch.update(api.doc(db, 'invoices', id), {
            estadoPago: 'PENDIENTE_APROBACION', paymentStatus: 'PENDIENTE_APROBACION',
            linkedPayoutRequestId: 'new', payoutRequestedAt: api.serverTimestamp(), ...options.invoice
        });
        batch.set(api.doc(db, 'analyst_invoices/ana/items', id), {
            estadoPago: 'PENDIENTE_APROBACION', paymentStatus: 'PENDIENTE_APROBACION', linkedPayoutRequestId: 'new'
        }, { merge: true });
    }
    return batch.commit();
}
test('anonymous cannot read or write financial data or profiles', async () => {
    const db = dbFor();
    for (const path of ['invoices/a', 'userProfiles/admin', 'settings/analystRules', 'payoutRequests/new']) {
        await assertFails(api.getDoc(api.doc(db, path)));
        await assertFails(api.setDoc(api.doc(db, path), { role: 'admin' }));
    }
});
test('analysts can use both ownership queries but cannot list all invoices or profiles', async () => {
    const db = dbFor('ana');
    for (const field of ['analista', 'analyst']) await assertSucceeds(api.getDocs(api.query(api.collection(db, 'invoices'), api.where(field, '==', 'ANA'))));
    await assertSucceeds(api.getDoc(api.doc(db, 'userProfiles/ana')));
    await assertSucceeds(api.getDoc(api.doc(db, 'settings/analystRules')));
    await assertFails(api.getDoc(api.doc(db, 'invoices/b')));
    await assertFails(api.getDocs(api.collection(db, 'invoices')));
    await assertFails(api.getDocs(api.collection(db, 'userProfiles')));
    await assertFails(api.updateDoc(api.doc(db, 'userProfiles/ana'), { role: 'admin' }));
});
test('unknown and inactive accounts have no financial access', async () => {
    for (const uid of ['unknown', 'inactive']) await assertFails(api.getDoc(api.doc(dbFor(uid), 'invoices/a')));
});
test('all browser payout creation is denied; service owns the workflow', async () => {
    for (const uid of ['ana', 'admin']) await assertFails(requestBatch(dbFor(uid)));
});

test('rejects fake totals, duplicate IDs, foreign invoices, extra fields and incomplete batches', async () => {
    const db = dbFor('ana');
    await assertFails(requestBatch(db, ['a'], { request: { totalAmount: 1 } }));
    await assertFails(requestBatch(db, ['a'], { request: { invoiceSnapshot: [{ id: 'a', total: 1 }], totalAmount: 1 } }));
    await assertFails(requestBatch(db, ['a', 'a']));
    await assertFails(requestBatch(db, ['b']));
    await assertFails(requestBatch(db, ['a'], { request: { approvedAt: api.serverTimestamp() } }));
    await assertFails(requestBatch(db, ['a'], { skipInvoices: true }));
    await assertFails(requestBatch(db, ['a'], { invoice: { totalAPagarAnalista: 100000 } }));
});
test('paid or already-linked invoices cannot be requested twice', async () => {
    await seed({ 'invoices/a': inv({ estadoPago: 'PAGO' }) });
    await assertFails(requestBatch(dbFor('ana')));
    await seed({ 'invoices/a': inv({ linkedPayoutRequestId: 'old' }) });
    await assertFails(requestBatch(dbFor('ana')));
});
test('analyst cannot approve, pay, change amounts or write another mirror', async () => {
    const db = dbFor('ana');
    await seed({ 'payoutRequests/new': { analystUid: 'ana', status: 'SUBMITTED' } });
    await assertFails(api.updateDoc(api.doc(db, 'payoutRequests/new'), { status: 'READY_TO_PAY' }));
    await assertFails(api.updateDoc(api.doc(db, 'invoices/a'), { estadoPago: 'PAGO' }));
    await assertFails(api.updateDoc(api.doc(db, 'invoices/a'), { totalAPagarAnalista: 1 }));
    await assertFails(api.setDoc(api.doc(db, 'analyst_invoices/beto/items/a'), { estadoPago: 'PAGO' }));
    await assertFails(api.updateDoc(api.doc(db, 'analyst_invoices/ana/items/a'), { totalAPagarAnalista: 1 }));
});
test('browsers cannot alter ledger, audit or linked invoice amounts, including administrators', async () => {
    await seed({
        'payoutRequests/approved': { analystUid: 'ana', status: 'APPROVED_WAITING_INVOICE' },
        'payoutRequests/approved/items/a': { total: 25000 },
        'payoutRequests/approved/events/start': { action: 'CREATE' },
        'invoices/a': inv({ linkedPayoutRequestId: 'approved' })
    });
    for (const uid of ['ana', 'admin']) {
        const db = dbFor(uid);
        await assertFails(api.updateDoc(api.doc(db, 'payoutRequests/approved'), { status: 'PAGO' }));
        await assertFails(api.updateDoc(api.doc(db, 'payoutRequests/approved/items/a'), { total: 1 }));
        await assertFails(api.updateDoc(api.doc(db, 'payoutRequests/approved/events/start'), { action: 'PAGO' }));
        await assertFails(api.updateDoc(api.doc(db, 'invoices/a'), { totalAPagarAnalista: 1 }));
        await assertSucceeds(api.getDoc(api.doc(db, 'payoutRequests/approved/items/a')));
    }
    await assertFails(api.getDoc(api.doc(dbFor('beto'), 'payoutRequests/approved/events/start')));
});

test('actual admin bulk transaction updates 200 main invoices and 200 mirrors', async () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ id: `bulk${i}`, ...inv() }));
    await seed(Object.fromEntries(rows.map(({ id, ...data }) => [`invoices/${id}`, data])));
    const db = dbFor('admin');
    await assertSucceeds(executeBulkStatusChange({ api, db, actorUid: 'admin', rows,
        change: { estadoPago: 'PAGO', fechaPago: '2026-10-19', estadoDeCobro: 'COBRADO', fechaCobro: '2026-10-19' },
        profiles: [{ uid: 'ana', role: 'analyst', analystKey: 'ANA' }] }));
    assert.equal((await api.getDoc(api.doc(db, 'invoices/bulk199'))).data().estadoPago, 'PAGO');
    assert.equal((await api.getDoc(api.doc(db, 'analyst_invoices/ana/items/bulk199'))).data().estadoPago, 'PAGO');
});

