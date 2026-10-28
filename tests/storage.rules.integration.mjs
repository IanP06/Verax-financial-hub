import { readFile } from 'node:fs/promises';
import { before, after, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getMetadata, deleteObject } from 'firebase/storage';
let env, sequence = 0;
const path = () => `payment_receipts/order/test-${sequence}.pdf`;
before(async () => {
    if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8085' || !process.env.FIREBASE_STORAGE_EMULATOR_HOST?.endsWith(':9199')) throw new Error('Emuladores locales requeridos.');
    env = await initializeTestEnvironment({ projectId: 'demo-verax-tests',
        firestore: { host: '127.0.0.1', port: 8085, rules: await readFile('firebase/firestore.rules', 'utf8') },
        storage: { host: '127.0.0.1', port: 9199, rules: await readFile('firebase/storage.rules', 'utf8') } });
});
after(async () => env?.cleanup());
beforeEach(async () => {
    sequence++;
    await env.clearStorage(); await env.clearFirestore();
    await env.withSecurityRulesDisabled(async c => {
        for (const [uid, role] of [['admin','ADMIN'],['ana','analyst'],['other','analyst'],['inactive','admin']]) await setDoc(doc(c.firestore(), 'userProfiles', uid), { role, isActive: uid !== 'inactive' });
        await setDoc(doc(c.firestore(), 'payoutRequests/order'), { analystUid: 'ana', status: 'READY_TO_PAY' });
    });
});
const object = uid => ref((uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).storage(), path());
const upload = (uid, custom = {}) => uploadBytes(object(uid), new TextEncoder().encode('%PDF-test'), { contentType: 'application/pdf', customMetadata: { uploadedByUid: uid, requestId: 'order', ...custom } });
test('only active admin can attach proof; metadata must match uploader and order', async () => {
    for (const uid of ['ana','other','inactive',null]) await assertFails(upload(uid));
    await assertFails(upload('admin', { requestId: 'other' }));
    await assertFails(upload('admin', { uploadedByUid: 'other' }));
    await assertSucceeds(upload('admin'));
});
test('proof is immutable and analyst can read only the receipt attached to their payment', async () => {
    await assertSucceeds(upload('admin'));
    await assertFails(upload('admin')); await assertFails(deleteObject(object('admin')));
    await assertFails(getMetadata(object('ana')));
    await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'payoutRequests/order'), { analystUid: 'ana', status: 'PAGO', payment: { receipt: { storagePath: path() } } }));
    await assertSucceeds(getMetadata(object('ana')));
    await assertFails(getMetadata(object('other'))); await assertFails(getMetadata(object(null)));
});
test('upload blocked for paid or processing order and disallowed content type', async () => {
    await assertFails(uploadBytes(object('admin'), new Uint8Array([1]), { contentType: 'text/html', customMetadata: { uploadedByUid: 'admin', requestId: 'order' } }));
    for (const change of [{ status: 'PAGO' }, { status: 'READY_TO_PAY', activeOperation: 'job' }]) {
        await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'payoutRequests/order'), { analystUid: 'ana', ...change }));
        await assertFails(upload('admin'));
    }
});
