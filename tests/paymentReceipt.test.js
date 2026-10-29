import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paymentReceiptVerifier, validateReceiptFile, MAX_RECEIPT_BYTES } from '../functions/paymentReceipt.js';

const receipt = { fileName: 'test.pdf', originalName: 'Transferencia.pdf', storagePath: 'payment_receipts/order/test.pdf' };
const metadata = { contentType: 'application/pdf', size: 9, generation: '123', timeCreated: '2026-10-28T12:00:00Z', metadata: { uploadedByUid: 'admin', requestId: 'order' } };
const bucket = (meta = metadata, bytes = Buffer.from('%PDF-test')) => ({ file: (path, options) => ({
    getMetadata: async () => [meta], download: async () => { assert.equal(options.generation, '123'); return [bytes]; }
}) });
test('server pins receipt generation and derives audit metadata and hash from stored bytes', async () => {
    const result = await paymentReceiptVerifier(bucket())('admin', 'order', { ...receipt, sha256: 'forged', size: 1 });
    assert.equal(result.size, 9); assert.match(result.sha256, /^[a-f0-9]{64}$/);
    assert.equal(result.generation, '123'); assert.equal(result.uploadedByUid, 'admin');
});
test('receipt verification rejects foreign paths, uploader, absent file, wrong type and oversized files', async () => {
    const verify = paymentReceiptVerifier(bucket());
    for (const change of [null, { ...receipt, storagePath: 'payment_receipts/other/test.pdf' }, { ...receipt, fileName: '../test.pdf' }, { ...receipt, originalName: '' }]) await assert.rejects(() => verify('admin', 'order', change));
    await assert.rejects(() => verify('analyst', 'order', receipt));
    for (const change of [{ size: MAX_RECEIPT_BYTES + 1 }, { contentType: 'text/html' }, { metadata: {} }]) await assert.rejects(() => paymentReceiptVerifier(bucket({ ...metadata, ...change }))('admin', 'order', receipt));
    await assert.rejects(() => paymentReceiptVerifier(bucket(metadata, Buffer.from('<html>fake')) )('admin', 'order', receipt));
});
test('file signatures allow PDF/JPEG/PNG and reject spoofed and empty uploads', () => {
    for (const [type, bytes] of [['application/pdf', Buffer.from('%PDF-test')], ['image/jpeg', Buffer.from([255,216,255,224])], ['image/png', Buffer.from([137,80,78,71,13,10,26,10])]]) assert.match(validateReceiptFile(bytes, type), /^[a-f0-9]{64}$/);
    assert.throws(() => validateReceiptFile(Buffer.from('fake'), 'application/pdf'));
    assert.throws(() => validateReceiptFile(Buffer.alloc(0), 'image/png'));
});
