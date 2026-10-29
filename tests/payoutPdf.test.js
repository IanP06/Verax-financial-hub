import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildPayoutPdf, pdfDate, validatePayoutDocument } from '../src/utils/payoutPdf.js';

const items = Array.from({ length: 300 }, (_, index) => ({ id: `id${index}`, nroFactura: String(2000 + index), siniestro: `5353-${String(index).padStart(6, '0')}`, aseguradora: 'Compañía de seguros de prueba', fechaEmision: '01/08/2026', total: 1234567.89, totalCents: 123456789 }));
const request = { id: 'request-test', requestNumber: 'SOL-2026-000041', orderNumber: 'OP-2026-000018', status: 'PAGO', analystName: 'Analista de prueba', invoiceIds: items.map(i => i.id), totalAmount: 370370367, totalCents: 37037036700, paidAt: '2026-10-28', createdAt: new Date('2026-10-28T12:00:00Z') };
test('PDF includes all 300 cases and full amounts, identifiers, status and notes across pages', async () => {
    const { document, filename } = buildPayoutPdf(request, items, [{ action: 'UPLOAD', at: '2026-10-28T11:00:00Z', note: 'INVOICE-SHOULD-NOT-APPEAR' }, { at: '2026-10-28T12:00:00Z', action: 'PAY', byUid: 'admin-test', note: 'Observación final de prueba' }]);
    assert.match(filename, /OP-2026-000018_PAGO.pdf/);
    const pdf = await getDocument({ data: new Uint8Array(document.output('arraybuffer')), useSystemFonts: true }).promise;
    try {
        assert.ok(pdf.numPages > 5);
        const parts = [];
        for (let i = 1; i <= pdf.numPages; i++) parts.push((await (await pdf.getPage(i)).getTextContent()).items.map(x => x.str).join(' '));
        const text = parts.join(' ');
        assert.doesNotMatch(text, /Moneda|Factura del analista|INVOICE-SHOULD-NOT-APPEAR|Verificación de factura/);
        for (const item of items) assert.ok(text.includes(item.siniestro), `Missing case ${item.siniestro}`);
        for (const value of ['370.370.367,00', '1.234.567,89', 'SOL-2026-000041', 'OP-2026-000018', 'Pagada', 'admin-test', 'Observación final de prueba', 'No es un comprobante bancario']) assert.ok(text.includes(value), `Missing ${value}`);
        for (const part of parts) assert.ok(part.includes('SOL-2026-000041'));
    } finally { await pdf.destroy(); }
});
test('PDF rejects incomplete, stale processing, duplicated and mismatched financial details', () => {
    assert.throws(() => validatePayoutDocument(request, items.slice(1)), /completo/);
    assert.throws(() => validatePayoutDocument(request, items.map(() => items[0])), /completo/);
    assert.throws(() => validatePayoutDocument({ ...request, activeOperation: 'job' }, items), /procesando/);
    assert.throws(() => validatePayoutDocument({ ...request, totalCents: 1 }, items), /no coincide/);
});
test('legacy dates do not shift a payment to the previous day', () => {
    assert.equal(pdfDate('2026-10-28'), '28/10/2026');
    assert.equal(pdfDate(null), 'No registrada');
    assert.match(pdfDate('2026-10-28T16:00:00Z'), /13:00:00/);
});
