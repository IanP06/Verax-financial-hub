import logo from '../assets/veraxLogo.js';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { payoutLabels, requestNumber } from './payoutClient.js';

const text = value => value == null || value === '' ? 'No registrado' : String(value);
const money = value => Number(value || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const actionLabel = action => {
    const labels = { CREATE: 'Solicitud presentada', APPROVE: 'Aprobación', APPROVED: 'Aprobación', UPLOAD: 'Factura adjunta', INVOICE_UPLOADED: 'Factura adjunta', VERIFY: 'Factura verificada', INVOICE_VERIFIED: 'Factura verificada', PAY: 'Pago registrado', PAID: 'Pago registrado', REJECT: 'Rechazo', REJECTED: 'Rechazo', RESUME: 'Proceso reanudado', ERROR: 'Error de procesamiento', CREATE_FAILED: 'Solicitud no presentada', SUBMITTED: 'Solicitud presentada' };
    return action?.endsWith('_STARTED') ? `Inicio: ${labels[action.replace('_STARTED', '')] || action}` : labels[action] || text(action);
};
const asDate = value => value?.toDate ? value.toDate() : value?.seconds != null ? new Date(value.seconds * 1000) : value ? new Date(value) : null;
export function pdfDate(value) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('/');
    const date = asDate(value);
    return date && Number.isFinite(+date) ? date.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hourCycle: 'h23' }) : 'No registrada';
}

export function validatePayoutDocument(request, items) {
    if (request.activeOperation || request.status === 'PROCESSING') throw new Error('La solicitud se está procesando. Esperá a que termine para descargar el documento completo.');
    const ids = request.invoiceIds || [];
    if (!ids.length || items.length !== ids.length || new Set(items.map(item => item.id)).size !== ids.length || items.some(item => !ids.includes(item.id))) {
        throw new Error('No está disponible el detalle completo de la solicitud. No se generó un PDF parcial.');
    }
    const total = items.reduce((sum, item) => {
        const value = item.totalCents ?? Math.round(Number(item.total) * 100);
        if (!Number.isSafeInteger(value) || value < 0) throw new Error('Hay un importe inválido en el detalle.');
        return sum + value;
    }, 0);
    if (!Number.isSafeInteger(total) || total !== (request.totalCents ?? Math.round(Number(request.totalAmount) * 100))) throw new Error('El total de la solicitud no coincide con el detalle. Revisá los importes antes de emitir el PDF.');
}

export function buildPayoutPdf(request, items, events = [], generatedAt = new Date()) {
    validatePayoutDocument(request, items);
    const document = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const number = requestNumber(request);
    const title = request.orderNumber ? 'ORDEN DE PAGO' : 'SOLICITUD DE PAGO';
    const status = payoutLabels[request.status] || request.status;
    document.setProperties({ title: `${title} ${request.orderNumber || number}`, subject: `${number} - ${status}`, author: 'Verax Financial Hub' });
    const ink = [25, 25, 25], red = [172, 43, 50];
    let y = 48;
    const table = (head, body, widths, options = {}) => {
        autoTable(document, { startY: y, margin: { top: 46, bottom: 22, left: 15, right: 15 }, head, body,
            styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.8, overflow: 'linebreak', textColor: ink, lineColor: [225, 225, 225], lineWidth: 0.1 },
            headStyles: { fillColor: ink, textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [247, 247, 247] }, rowPageBreak: 'avoid', columnStyles: widths || {}, ...options });
        y = document.lastAutoTable.finalY + 8;
    };
    const section = (label, space = 30) => {
        if (y + space > 273) { document.addPage(); y = 48; }
        document.setFont('helvetica', 'bold'); document.setFontSize(11); document.setTextColor(...red); document.text(label, 15, y); y += 5;
    };
    section('Resumen de la orden');
    table([], [
        ['Analista', text(request.analystName)],
        ['Solicitud', `${number}  |  ${pdfDate(request.createdAt)}`],
        ['Estado actual', status],
        ...(request.approvedAt ? [['Aprobación', pdfDate(request.approvedAt)]] : []),
        ...(request.rejectedAt ? [['Rechazo', pdfDate(request.rejectedAt)]] : []),
        ['Casos incluidos', String(items.length)]
    ], { 0: { cellWidth: 39, fontStyle: 'bold' }, 1: { cellWidth: 141 } });
    table([], [['TOTAL DE LA SOLICITUD', `$ ${money(request.totalAmount)}`]], { 0: { cellWidth: 100 }, 1: { cellWidth: 80, halign: 'right' } },
        { styles: { fontSize: 13, fontStyle: 'bold', textColor: 255, fillColor: red, cellPadding: 4 }, bodyStyles: { fillColor: red }, alternateRowStyles: { fillColor: red } });
    if (request.rejectionReason || request.processingError) table([], [['Observaciones', request.rejectionReason || request.processingError]], { 0: { cellWidth: 39, fontStyle: 'bold' } });
    section('Detalle de casos');
    const ordered = [...items].sort((a, b) => text(a.siniestro).localeCompare(text(b.siniestro), 'es', { numeric: true }) || a.id.localeCompare(b.id));
    table([['N.º', 'Factura', 'Siniestro', 'Aseguradora', 'Emisión', 'Importe $']], ordered.map((item, index) => [
        String(index + 1), text(item.nroFactura), text(item.siniestro), text(item.aseguradora), text(item.fechaEmision), money((item.totalCents ?? Math.round(item.total * 100)) / 100)
    ]), { 0: { cellWidth: 10 }, 1: { cellWidth: 21 }, 2: { cellWidth: 35 }, 3: { cellWidth: 46 }, 4: { cellWidth: 26 }, 5: { cellWidth: 42, halign: 'right' } });
    table([], [[`${items.length} CASOS · TOTAL`, `$ ${money(request.totalAmount)}`]], { 0: { fontStyle: 'bold', cellWidth: 120 }, 1: { fontStyle: 'bold', halign: 'right', cellWidth: 60 } });
    if (request.payment) {
        section('Pago y respaldo bancario', 95);
        table([], [
            ['Fecha efectiva', pdfDate(request.payment.date || request.paidAt)],
            ['Importe pagado', `$ ${money(request.payment.amount)}`],
            ['Cuenta de origen', text(request.payment.account)],
            ['Referencia bancaria', text(request.payment.reference)],
            ['Comprobante', request.payment.receipt?.originalName || request.payment.receipt?.fileName || 'Sin comprobante adjunto (registro anterior)'],
            ['Registrado por', request.payment.recordedByName || text(request.payment.recordedByUid)],
            ['Fecha de registro', pdfDate(request.payment.recordedAt)],
            ...(request.payment.receipt ? [['Cotejo del comprobante', 'Confirmado por administración al registrar el pago.']] : [])
        ], { 0: { cellWidth: 45, fontStyle: 'bold' } }, { pageBreak: 'avoid' });
    }
    section('Trazabilidad de la solicitud');
    const invoiceActions = /^(UPLOAD|VERIFY|INVOICE_UPLOADED|INVOICE_VERIFIED)(_|$)/;
    const displayState = state => ['APPROVED_WAITING_INVOICE', 'INVOICE_REVIEW', 'NEEDS_INVOICE', 'PENDIENTE_FACTURA'].includes(state) ? 'Aprobada' : payoutLabels[state] || state;
    const actions = [...(request.history || []), ...events].filter(entry => !invoiceActions.test(entry.action || '')).sort((a, b) => (+asDate(a.at) || 0) - (+asDate(b.at) || 0));
    table([['Fecha / hora', 'Acción y responsable', 'Estado / observaciones']], actions.length ? actions.map(entry => [
        pdfDate(entry.at), `${actionLabel(entry.action)}\n${entry.actorName || entry.byUid || entry.byRole || 'Usuario no registrado'}`,
        [entry.toStatus && displayState(entry.toStatus), entry.note].filter(Boolean).join('\n') || '-'
    ]) : [['-', 'Sin historial disponible', 'Registro histórico sin eventos.']], { 0: { cellWidth: 38 }, 1: { cellWidth: 65 }, 2: { cellWidth: 77 } });
    section('Referencia de control', 40);
    table([], [['ID interno', request.id], ['Alcance', 'Documento de control interno. No es un comprobante bancario ni una factura fiscal. Consultar el estado vigente por número de solicitud u orden en Financial Hub.']], { 0: { cellWidth: 30, fontStyle: 'bold' } }, { pageBreak: 'avoid' });
    const pages = document.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
        document.setPage(page);
        document.addImage(logo, 'JPEG', 13, 5, 66, 30.16, 'verax-logo');
        document.setFont('helvetica', 'bold'); document.setFontSize(14); document.setTextColor(...ink); document.text(title, 195, 16, { align: 'right' });
        document.setFontSize(11); document.setTextColor(...red); document.text(request.orderNumber || number, 195, 24, { align: 'right' });
        document.setFont('helvetica', 'normal'); document.setFontSize(9); document.setTextColor(...ink); document.text(`Estado: ${status}`, 195, 32, { align: 'right' });
        document.setDrawColor(...red); document.setLineWidth(0.7); document.line(15, 39, 195, 39);
        document.setDrawColor(210); document.setLineWidth(0.2); document.line(15, 280, 195, 280);
        document.setTextColor(90); document.setFontSize(8); document.text(`${number} | Emitido: ${pdfDate(generatedAt)}`, 15, 286); document.text(`${page} / ${pages}`, 195, 286, { align: 'right' });
    }
    return { document, filename: `${request.orderNumber || number}_${request.status}.pdf`.replace(/[^a-zA-Z0-9_.-]/g, '_') };
}
