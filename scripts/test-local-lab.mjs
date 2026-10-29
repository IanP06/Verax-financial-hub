import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { getStorage, connectStorageEmulator, ref, uploadBytes, getBytes } from 'firebase/storage';
import { seedLocalLab } from './seed-local-lab.mjs';

if (process.env.GCLOUD_PROJECT !== 'demo-verax-lab' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8085') throw new Error('Solo laboratorio local.');
await seedLocalLab();
const clients = [];
async function client(uid) {
    const app = initializeApp({ projectId: 'demo-verax-lab', apiKey: 'demo-key', storageBucket: 'demo-verax-lab.appspot.com' }, uid);
    clients.push(app);
    const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    await signInWithEmailAndPassword(auth, `${uid}@verax.test`, 'Verax-Lab-2026!');
    const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8085);
    const functions = getFunctions(app, 'us-central1'); connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    const storage = getStorage(app); connectStorageEmulator(storage, '127.0.0.1', 9199);
    return { db, storage, command: async (action, requestId, payload = {}, operationId = randomUUID()) => (await httpsCallable(functions, 'payoutCommand')({ action, requestId, payload, operationId })).data };
}
async function waitState(db, id, state) {
    for (let attempt = 0; attempt < 120; attempt++) {
        const data = (await getDoc(doc(db, 'payoutRequests', id))).data();
        if (data?.processingError) throw new Error(data.processingError);
        if (data?.status === state && !data.activeOperation) return data;
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error(`El trigger no terminó en ${state}.`);
}
try {
    const analyst = await client('lab-analyst'), admin = await client('lab-admin'), other = await client('lab-other');
    const ids = Array.from({ length: 20 }, (_, i) => `lab-case-${String(i + 1).padStart(3, '0')}`);
    const created = await analyst.command('CREATE', null, { invoiceIds: ids });
    let request = await waitState(admin.db, created.requestId, 'SUBMITTED');
    assert.equal(request.caseCount, 20); assert.equal(request.totalAmount, 500005);
    await assert.rejects(() => analyst.command('APPROVE', created.requestId));
    await assert.rejects(() => getDoc(doc(other.db, 'payoutRequests', created.requestId)));
    await admin.command('APPROVE', created.requestId);
    request = await waitState(admin.db, created.requestId, 'READY_TO_PAY');
    assert.match(request.orderNumber, /^SOL\d{5,}$/); assert.equal(request.orderNumber, request.requestNumber);
    const { buildPayoutPdf } = await import('../src/utils/payoutPdf.js');
    const items = (await getDocs(collection(admin.db, 'payoutRequests', created.requestId, 'items'))).docs.map(d => d.data());
    const pdf = buildPayoutPdf({ ...request, id: created.requestId }, items).document.output('arraybuffer');
    const fileName = `${randomUUID()}.pdf`, storagePath = `payment_receipts/${created.requestId}/${fileName}`;
    await uploadBytes(ref(admin.storage, storagePath), new Uint8Array(pdf), { contentType: 'application/pdf', customMetadata: { uploadedByUid: 'lab-admin', requestId: created.requestId } });
    const payload = { receiptOnly: true, receipt: { fileName, storagePath, originalName: 'respaldo-ficticio.pdf' } };
    await assert.rejects(() => admin.command('PAY', created.requestId, { receiptOnly: true }));
    const operation = randomUUID();
    const first = await admin.command('PAY', created.requestId, payload, operation);
    const retry = await admin.command('PAY', created.requestId, payload, operation);
    assert.equal(first.jobId, retry.jobId);
    request = await waitState(admin.db, created.requestId, 'PAGO');
    assert.match(request.payment.receipt.sha256, /^[a-f0-9]{64}$/);
    assert.equal(request.payment.registrationMode, 'RECEIPT_ONLY');
    assert.equal(request.payment.amount, 500005);
    assert.equal((await getDocs(collection(admin.db, 'analystPayments'))).size, 1);
    assert.ok((await getBytes(ref(analyst.storage, storagePath))).byteLength > 0);
    await assert.rejects(() => getBytes(ref(other.storage, storagePath)));
    for (const id of ids) assert.equal((await getDoc(doc(admin.db, 'invoices', id))).data().estadoPago, 'PAGO');
    console.log('OK: Auth real del emulador + callable + triggers automáticos + 20 casos + Storage + PDF + pago único + permisos. Sin producción.');
} finally { await Promise.all(clients.map(app => deleteApp(app))); }
