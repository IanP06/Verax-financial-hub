import { mkdir, writeFile } from 'node:fs/promises';
import { buildPayoutPdf } from '../src/utils/payoutPdf.js';
const items = Array.from({ length: 35 }, (_, index) => ({ id: `demo-${index}`, nroFactura: String(2100 + index), siniestro: `5353-${151387 + index}`, aseguradora: 'Aseguradora de ejemplo', fechaEmision: '01/08/2026', total: 55000.25, totalCents: 5500025 }));
const request = { id: 'muestra-sin-validez-operativa', requestNumber: 'SOL-2026-000041', orderNumber: 'OP-2026-000018', analystName: 'Analista de ejemplo - DATOS FICTICIOS', status: 'PAGO', createdAt: new Date('2026-10-28T12:00:00Z'), updatedAt: new Date('2026-10-28T16:00:00Z'), approvedAt: new Date('2026-10-28T13:00:00Z'), verifiedAt: new Date('2026-10-28T14:00:00Z'), paidAt: '2026-10-28', invoiceStatus: 'VERIFIED', invoiceIds: items.map(i => i.id), totalAmount: 1925008.75, totalCents: 192500875,
    invoiceReceipt: { fileName: 'factura-ejemplo.pdf', uploadedAt: '2026-10-28T13:30:00Z', uploadedByUid: 'analista-ejemplo' },
    payment: { amount: 1925008.75, account: 'Cuenta de ejemplo', reference: 'OPERACION-DEMO-001', recordedByUid: 'admin-ejemplo', recordedAt: '2026-10-28T16:00:00Z' } };
const events = [['CREATE', '12:00', 'SUBMITTED'], ['APPROVE', '13:00', 'APPROVED_WAITING_INVOICE'], ['UPLOAD', '13:30', 'INVOICE_REVIEW'], ['VERIFY', '14:00', 'READY_TO_PAY'], ['PAY', '16:00', 'PAGO']].map(([action, time, state]) => ({ action, at: `2026-10-28T${time}:00Z`, actorName: action === 'CREATE' || action === 'UPLOAD' ? 'Analista de ejemplo' : 'Administrador de ejemplo', toStatus: state, note: 'Evento ilustrativo. No corresponde a una operación real.' }));
const { document } = buildPayoutPdf(request, items, events, new Date('2026-10-28T17:00:00Z'));
await mkdir('output/pdf', { recursive: true });
await writeFile('output/pdf/orden-pago-ejemplo.pdf', new Uint8Array(document.output('arraybuffer')));
console.log(`PDF de ejemplo: ${document.getNumberOfPages()} páginas`);
