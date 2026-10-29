import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage, ref, uploadBytes } from 'firebase/storage';
import { db } from '../../lib/firebase';
import { payoutCommand, payoutLabels, requestNumber, clearCreateRetryKey } from '../../utils/payoutClient';
import PayoutTrace from './PayoutTrace';

export default function PayoutList({ requests, admin = false }) {
    const [query, setQuery] = useState(''), [status, setStatus] = useState(''), [expanded, setExpanded] = useState(null);
    const [start, setStart] = useState(''), [end, setEnd] = useState('');
    const [busy, setBusy] = useState(null), [error, setError] = useState(''), [matches, setMatches] = useState(new Set()), [searching, setSearching] = useState(false);
    const [payment, setPayment] = useState(null);
    useEffect(() => {
        let cancelled = false;
        if (!query.trim()) return;
        const timer = setTimeout(async () => {
            setSearching(true);
            const term = query.trim().toLowerCase();
            try {
                const found = await Promise.all(requests.map(async request => {
                    if ([requestNumber(request), request.orderNumber, request.id, request.analystName, request.payment?.reference].some(value => String(value || '').toLowerCase().includes(term))) return request.id;
                    const items = request.schemaVersion === 2 ? (await getDocs(collection(db, 'payoutRequests', request.id, 'items'))).docs.map(d => d.data()) : request.invoiceSnapshot || [];
                    return items.some(item => [item.siniestro, item.nroFactura].some(value => String(value || '').toLowerCase().includes(term))) ? request.id : null;
                }));
                if (!cancelled) setMatches(new Set(found.filter(Boolean)));
            } catch { if (!cancelled) setError('No se pudo completar la búsqueda.'); }
            finally { if (!cancelled) setSearching(false); }
        }, 400);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [query, requests]);
    const act = async (request, action, payload = {}) => {
        if (busy) return;
        setBusy(request.id); setError('');
        try { await payoutCommand(action, request.id, payload); setPayment(null); }
        catch (e) { setError(e.message); }
        finally { setBusy(null); }
    };
    const registerPayment = async () => {
        if (busy) return;
        setBusy(payment.request.id); setError('');
        try {
            if (!payment.reviewed) throw new Error('Confirmá el cotejo del comprobante antes de registrar el pago.');
            let receipt = payment.receipt;
            if (!receipt) {
                const file = payment.file;
                const extension = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }[file?.type];
                if (!extension || !file.size || file.size > 10 * 1024 * 1024) throw new Error('Adjuntá un PDF, JPG o PNG de hasta 10 MB.');
                const fileName = `${crypto.randomUUID()}.${extension}`;
                receipt = { fileName, originalName: file.name.slice(0, 200), storagePath: `payment_receipts/${payment.request.id}/${fileName}` };
                await uploadBytes(ref(getStorage(), receipt.storagePath), file, { contentType: file.type,
                    customMetadata: { uploadedByUid: getAuth().currentUser.uid, requestId: payment.request.id } });
                setPayment(current => ({ ...current, receipt }));
            }
            await payoutCommand('PAY', payment.request.id, { date: payment.date, amount: payment.amount, account: payment.account,
                reference: payment.reference, receipt, receiptReviewed: true });
            setPayment(null);
        } catch (e) { setError(e.message || 'No se pudo registrar el pago. Podés reintentar.'); }
        finally { setBusy(null); }
    };
    const filtered = requests.filter(request => {
        const date = request.createdAt?.toDate?.().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }) || '';
        return (!query.trim() || matches.has(request.id)) && (!status || (payoutLabels[request.status] || request.status) === status) && (!start || date >= start) && (!end || date <= end);
    });
    return <div className="space-y-4 text-slate-900 dark:text-slate-100">
        <div className="flex flex-wrap gap-3"><input aria-label="Buscar solicitud" className="rounded border p-2 dark:bg-slate-800 flex-1 min-w-64" placeholder="N° solicitud, orden, analista, siniestro, factura o referencia" value={query} onChange={e => setQuery(e.target.value)} />
            <select aria-label="Estado" className="rounded border p-2 dark:bg-slate-800" value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos los estados</option>{[...new Set(requests.map(r => payoutLabels[r.status] || r.status))].map(value => <option key={value} value={value}>{value}</option>)}</select>
            <label>Desde <input type="date" value={start} onChange={e => setStart(e.target.value)} className="dark:bg-slate-800" /></label><label>Hasta <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="dark:bg-slate-800" /></label>
        </div>
        {searching && <p>Buscando en solicitudes y casos…</p>}{error && <p role="alert" className="text-red-600">{error}</p>}
        {!filtered.length && !searching && <p>No hay solicitudes para estos filtros.</p>}
        {filtered.map(request => <article key={request.id} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-3">
            <div className="flex flex-wrap justify-between gap-3"><div><strong>{requestNumber(request)}</strong><p>{request.analystName} · {request.createdAt?.toDate?.().toLocaleString('es-AR') || 'Fecha no disponible'}</p><p>{request.orderNumber || 'Sin orden de pago emitida'}</p></div><div className="text-right"><strong>{Number(request.totalAmount || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</strong><p>{request.caseCount || request.invoiceIds?.length || 0} casos</p><p>{payoutLabels[request.status] || request.status}</p></div></div>
            {request.activeOperation && <p role="status" className="text-amber-600">Procesando {request.processedCount || 0} de {request.invoiceIds?.length || 0} casos. Podés cerrar esta pantalla; el proceso continúa.</p>}
            {request.processingError && <p className="text-red-600">{request.processingError}</p>}
            {request.rejectionReason && <p>Motivo de rechazo: {request.rejectionReason}</p>}
            <div className="flex flex-wrap gap-4">
                <button className="text-blue-500 underline" onClick={() => setExpanded(expanded === request.id ? null : request.id)}>{expanded === request.id ? 'Ocultar detalle' : 'Detalle e historial'}</button>
                {admin && request.activeOperation && request.processingError && <button disabled={!!busy} onClick={() => act(request, 'RESUME')}>Reintentar proceso</button>}
                {!request.activeOperation && admin && <>
                    {['SUBMITTED', 'PENDIENTE_APROBACION'].includes(request.status) && <button disabled={!!busy} onClick={() => confirm(`¿Aprobar ${requestNumber(request)}?`) && act(request, 'APPROVE')}>Aprobar</button>}
                    {['SUBMITTED', 'PENDIENTE_APROBACION', 'APPROVED_WAITING_INVOICE', 'INVOICE_REVIEW', 'READY_TO_PAY', 'PENDIENTE_PAGO', 'NEEDS_INVOICE', 'PENDIENTE_FACTURA'].includes(request.status) && <button disabled={!!busy} onClick={() => { const reason = prompt('Motivo del rechazo:'); if (reason) act(request, 'REJECT', { reason }); }}>Rechazar</button>}
                    {['READY_TO_PAY', 'PENDIENTE_PAGO', 'APPROVED_SCHEDULED', 'APPROVED_WAITING_INVOICE', 'NEEDS_INVOICE', 'PENDIENTE_FACTURA', 'INVOICE_REVIEW'].includes(request.status) && <button disabled={!!busy} onClick={() => setPayment({ request, date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }), amount: request.totalAmount, account: '', reference: '' })}>Registrar pago realizado</button>}
                </>}
                {!admin && ['FAILED', 'REJECTED'].includes(request.status) && <button onClick={() => { clearCreateRetryKey(); alert('Podés volver a seleccionar los casos habilitados desde el dashboard.'); }}>Preparar nueva solicitud</button>}
            </div>
            {expanded === request.id && <PayoutTrace request={request} />}
        </article>)}
        {payment && <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"><form className="bg-white dark:bg-slate-800 p-6 rounded-lg space-y-4 max-w-lg w-full max-h-[90vh] overflow-y-auto" onSubmit={e => { e.preventDefault(); registerPayment(); }}>
            <h3 className="font-bold">Registrar pago · {requestNumber(payment.request)}</h3><p>Confirmá los datos del pago ya realizado. Esta acción no ejecuta una transferencia.</p>
            {[['date', 'Fecha efectiva', 'date'], ['amount', 'Importe pagado', 'number'], ['account', 'Cuenta de origen', 'text'], ['reference', 'Referencia / operación bancaria', 'text']].map(([key, label, type]) => <label className="block" key={key}>{label}<input className="block w-full border p-2 dark:bg-slate-900" disabled={!!busy} required type={type} step={key === 'amount' ? '0.01' : undefined} value={payment[key]} onChange={e => setPayment({ ...payment, [key]: e.target.value, reviewed: false })} /></label>)}
            <label className="block">Comprobante de transferencia bancaria
                <input className="block w-full mt-2" type="file" accept="application/pdf,image/jpeg,image/png" disabled={!!busy} required={!payment.receipt} onChange={e => setPayment({ ...payment, file: e.target.files[0], receipt: null, reviewed: false })} />
                <span className="text-sm text-slate-500">PDF, JPG o PNG · Hasta 10 MB. Quedará vinculado a esta orden.</span>
            </label>
            {payment.receipt && <p className="text-sm">Comprobante cargado: {payment.receipt.originalName}</p>}
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" required disabled={!!busy} checked={!!payment.reviewed} onChange={e => setPayment({ ...payment, reviewed: e.target.checked })} />Cotejé beneficiario, importe, fecha y referencia bancaria con el comprobante adjunto.</label>
            <p className="text-xs text-slate-500">El cotejo queda registrado a tu nombre. La carga no consulta ni confirma movimientos en el banco.</p>
            {error && <p role="alert" className="text-red-600">{error}</p>}<button type="button" onClick={() => setPayment(null)} disabled={!!busy}>Cancelar</button><button className="bg-blue-600 text-white p-2 rounded ml-4" disabled={!!busy}>{busy ? 'Guardando comprobante y pago…' : 'Confirmar registro'}</button>
        </form></div>}
    </div>;
}
