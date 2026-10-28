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
    let y = 48;
    const table = (head, body, widths) => {
        autoTable(document, { startY: y, margin: { top: 44, bottom: 20, left: 15, right: 15 }, head, body,
            styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.4, overflow: 'linebreak', textColor: [30, 41, 59] },
            headStyles: { fillColor: [29, 46, 63], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [244, 247, 250] }, rowPageBreak: 'avoid', columnStyles: widths || {} });
        y = document.lastAutoTable.finalY + 7;
    };
    const section = label => {
        if (y > 235) { document.addPage(); y = 47; }
        document.setFont('helvetica', 'bold'); document.setFontSize(11); document.setTextColor(29, 46, 63); document.text(label, 15, y); y += 4;
    };
    section('Identificación y estado');
    table([], [
        ['N.º de solicitud', number, 'Orden de pago', request.orderNumber || 'No emitida'],
        ['Analista', text(request.analystName), 'Estado', status],
        ['Fecha de solicitud', pdfDate(request.createdAt), 'Cantidad de casos', String(items.length)],
        ['Moneda', request.currency || 'ARS', 'TOTAL', `$ ${money(request.totalAmount)}`],
        ['Fecha de aprobación', pdfDate(request.approvedAt), 'Verificación de factura', pdfDate(request.verifiedAt)],
        ['Fecha de rechazo', pdfDate(request.rejectedAt), 'Fecha efectiva de pago', pdfDate(request.paidAt)]
    ], { 0: { cellWidth: 31, fontStyle: 'bold' }, 1: { cellWidth: 59 }, 2: { cellWidth: 32, fontStyle: 'bold' }, 3: { cellWidth: 58 } });
    if (request.rejectionReason || request.processingError) table([], [['Observaciones', request.rejectionReason || request.processingError]], { 0: { cellWidth: 31, fontStyle: 'bold' } });
    section('Detalle de casos - importes originales de la solicitud');
    const ordered = [...items].sort((a, b) => text(a.siniestro).localeCompare(text(b.siniestro), 'es', { numeric: true }) || a.id.localeCompare(b.id));
    table([['N.º', 'Factura', 'Siniestro', 'Aseguradora', 'Emisión', 'Importe (ARS)']], ordered.map((item, index) => [
        String(index + 1), text(item.nroFactura), text(item.siniestro), text(item.aseguradora), text(item.fechaEmision), money((item.totalCents ?? Math.round(item.total * 100)) / 100)
    ]), { 0: { cellWidth: 10 }, 1: { cellWidth: 23 }, 2: { cellWidth: 36 }, 3: { cellWidth: 42 }, 4: { cellWidth: 25 }, 5: { cellWidth: 44, halign: 'right' } });
    table([], [['TOTAL DE LA SOLICITUD (ARS)', money(request.totalAmount)]], { 0: { fontStyle: 'bold', cellWidth: 136 }, 1: { fontStyle: 'bold', halign: 'right', cellWidth: 44 } });
    section('Factura del analista y registro del pago');
    table([], [
        ['Estado de la factura', ({ REQUIRED: 'Requerida', NOT_REQUIRED: 'No requerida', UPLOADED: 'Subida, pendiente de verificación', VERIFIED: 'Verificada' })[request.invoiceStatus] || text(request.invoiceStatus)],
        ['Archivo adjunto', text(request.invoiceReceipt?.fileName)],
        ['Carga de la factura', pdfDate(request.invoiceReceipt?.uploadedAt)],
        ['Cargada por (usuario)', text(request.invoiceReceipt?.uploadedByUid)],
        ['Importe pagado', request.payment ? `ARS ${money(request.payment.amount)}` : 'No registrado en el detalle de pago'],
        ['Cuenta de origen', text(request.payment?.account)],
        ['Referencia bancaria', text(request.payment?.reference)],
        ['Registrado por (usuario)', text(request.payment?.recordedByUid)],
        ['Fecha del registro', pdfDate(request.payment?.recordedAt)]
    ], { 0: { cellWidth: 48, fontStyle: 'bold' } });
    section('Historial de acciones');
    const actions = [...(request.history || []), ...events].sort((a, b) => (+asDate(a.at) || 0) - (+asDate(b.at) || 0));
    table([['Fecha / hora (Argentina)', 'Acción y responsable', 'Transición / observaciones']], actions.length ? actions.map(entry => [
        pdfDate(entry.at), `${actionLabel(entry.action)}\n${entry.actorName || entry.byUid || entry.byRole || 'Usuario no registrado'}${entry.actorName && entry.byUid ? `\n${entry.byUid}` : ''}`,
        [entry.fromStatus && `De: ${payoutLabels[entry.fromStatus] || entry.fromStatus}`, entry.toStatus && `A: ${payoutLabels[entry.toStatus] || entry.toStatus}`, entry.note].filter(Boolean).join('\n') || '-'
    ]) : [['-', 'Sin historial disponible', 'Registro histórico sin eventos.']], { 0: { cellWidth: 37 }, 1: { cellWidth: 63 }, 2: { cellWidth: 80 } });
    section('Referencias para localizar el registro');
    table([], [['ID interno de solicitud', request.id], ['Documento emitido', pdfDate(generatedAt)], ['Actualización del registro', pdfDate(request.updatedAt)]], { 0: { cellWidth: 48, fontStyle: 'bold' } });
    table([], [['Alcance', 'Documento de control interno generado con el estado registrado al momento de la descarga. No es un comprobante bancario ni una factura fiscal. El estado puede cambiar posteriormente; cotejar el número de solicitud y de orden en Financial Hub.']], { 0: { cellWidth: 25, fontStyle: 'bold' } });
    const pages = document.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
        document.setPage(page);
        document.setFillColor(15, 23, 42); document.rect(0, 0, 210, 37, 'F');
        document.setFont('helvetica', 'bold'); document.setFontSize(17); document.setTextColor(255); document.text('VERAX', 15, 12);
        document.setFontSize(11); document.text(title, 195, 12, { align: 'right' });
        document.setFont('helvetica', 'normal'); document.setFontSize(9); document.text(`${number}${request.orderNumber ? ` / ${request.orderNumber}` : ''}`, 15, 22);
        document.text(`Estado: ${status}`, 15, 30);
        document.setTextColor(90); document.setFontSize(8); document.text(`${number} | Emitido: ${pdfDate(generatedAt)}`, 15, 287); document.text(`${page} / ${pages}`, 195, 287, { align: 'right' });
    }
    return { document, filename: `${request.orderNumber || number}_${request.status}.pdf`.replace(/[^a-zA-Z0-9_.-]/g, '_') };
}
