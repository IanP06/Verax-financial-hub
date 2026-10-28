import React, { useEffect, useState } from 'react';
import { collection, doc, getDocFromServer, getDocsFromServer, onSnapshot } from 'firebase/firestore';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import { db } from '../../lib/firebase';
import { requestNumber, payoutLabels } from '../../utils/payoutClient';

const money = n => Number(n || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
export default function PayoutTrace({ request }) {
    const [items, setItems] = useState(request.invoiceSnapshot || []);
    const [events, setEvents] = useState([]);
    const [error, setError] = useState('');
    const [pdfLoading, setPdfLoading] = useState(false);
    const exportPDF = async () => {
        setPdfLoading(true); setError('');
        try {
            const requestRef = doc(db, 'payoutRequests', request.id);
            const before = await getDocFromServer(requestRef);
            if (!before.exists()) throw new Error('La solicitud ya no está disponible.');
            const fresh = { ...before.data(), id: before.id };
            const [details, history] = await Promise.all([
                fresh.schemaVersion === 2 ? getDocsFromServer(collection(requestRef, 'items')).then(s => s.docs.map(d => d.data())) : Promise.resolve(fresh.invoiceSnapshot || []),
                getDocsFromServer(collection(requestRef, 'events')).then(s => s.docs.map(d => d.data()))
            ]);
            const after = await getDocFromServer(requestRef);
            if (!after.exists() || JSON.stringify(before.data()) !== JSON.stringify(after.data())) throw new Error('La solicitud cambió durante la descarga. Volvé a generar el PDF.');
            const { buildPayoutPdf } = await import('../../utils/payoutPdf.js');
            const { document, filename } = buildPayoutPdf(fresh, details, history);
            document.save(filename);
        } catch (e) { setError(e.message || 'No se pudo generar el PDF.'); }
        finally { setPdfLoading(false); }
    };
    useEffect(() => {
        const stopEvents = onSnapshot(collection(db, 'payoutRequests', request.id, 'events'), snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.at.localeCompare(b.at))), e => setError(e.message));
        const stopItems = request.schemaVersion === 2 ? onSnapshot(collection(db, 'payoutRequests', request.id, 'items'), snap => setItems(snap.docs.map(d => d.data())), e => setError(e.message)) : () => {};
        return () => { stopEvents(); stopItems(); };
    }, [request.id, request.schemaVersion]);
    const exportCSV = () => {
        const quote = value => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
        const rows = [['Solicitud', 'Orden de pago', 'Estado', 'Analista', 'Fecha solicitud', 'Factura', 'Siniestro', 'Aseguradora', 'Monto caso', 'Total solicitud'],
            ...items.map(item => [requestNumber(request), request.orderNumber || '', payoutLabels[request.status] || request.status, request.analystName,
                request.createdAt?.toDate?.().toISOString() || '', item.nroFactura, item.siniestro, item.aseguradora, item.total, request.totalAmount])];
        const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(quote).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = `${requestNumber(request)}.csv`; link.click(); URL.revokeObjectURL(url);
    };
    const openReceipt = async () => {
        try {
            const url = request.invoiceReceipt.storagePath ? await getDownloadURL(ref(getStorage(), request.invoiceReceipt.storagePath)) : request.invoiceReceipt.url;
            if (url && /^https:\/\//.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
        } catch { setError('No se pudo abrir el comprobante.'); }
    };
    const openBankReceipt = async () => {
        try {
            const url = await getDownloadURL(ref(getStorage(), request.payment.receipt.storagePath));
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch { setError('No se pudo abrir el comprobante bancario.'); }
    };
    return <section className="space-y-3 text-sm text-slate-800 dark:text-slate-100">
        <div className="flex flex-wrap gap-3 items-center"><strong>{requestNumber(request)}</strong><span>{request.orderNumber || 'Orden de pago pendiente de aprobación'}</span><button className="text-blue-500 underline" onClick={exportCSV}>Exportar detalle CSV</button><button className="bg-blue-600 text-white rounded px-3 py-2 disabled:opacity-50" disabled={pdfLoading || !!request.activeOperation || request.status === 'PROCESSING'} onClick={exportPDF}>{pdfLoading ? 'Generando PDF…' : request.orderNumber ? 'Descargar orden PDF' : 'Descargar solicitud PDF'}</button></div>
        <p>{items.length} casos · Total registrado: {money(request.totalAmount)}</p>
        {request.processingError && <p role="alert" className="text-red-600">{request.processingError}</p>}
        {error && <p role="alert" className="text-red-600">{error}</p>}
        {request.invoiceReceipt && <button onClick={openReceipt} className="text-blue-500 underline">Consultar adjunto histórico</button>}
        {request.payment && <div className="rounded border border-green-600 p-3"><strong>Pago registrado</strong><p>{request.payment.date} · {money(request.payment.amount)} · {request.payment.account}</p><p>Referencia bancaria: {request.payment.reference}</p><p>Registrado por: {request.payment.recordedByName || request.payment.recordedByUid}</p>{request.payment.receipt && <><p>Cotejo del comprobante confirmado al registrar el pago.</p><button onClick={openBankReceipt} className="text-blue-500 underline">Abrir comprobante bancario · {request.payment.receipt.originalName}</button></>}</div>}
        <div className="overflow-auto max-h-80"><table className="w-full text-left"><thead><tr><th>Factura</th><th>Siniestro</th><th>Aseguradora</th><th className="text-right">Monto por caso</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.nroFactura}</td><td>{item.siniestro}</td><td>{item.aseguradora}</td><td className="text-right whitespace-nowrap">{money(item.total)}</td></tr>)}</tbody></table></div>
        <h4 className="font-bold">Historial de la solicitud</h4>
        {[...(request.history || []), ...events].filter(entry => !/^(UPLOAD|VERIFY|INVOICE_UPLOADED|INVOICE_VERIFIED)(_|$)/.test(entry.action || '')).map((entry, index) => <p key={entry.id || index}>{new Date(entry.at).toLocaleString('es-AR')} · {entry.action} · {entry.actorName || entry.byUid || entry.byRole || 'Registro anterior'} {entry.note && `· ${entry.note}`}</p>)}
    </section>;
}
