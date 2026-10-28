import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { payoutCommand, payoutLabels, requestNumber, clearCreateRetryKey } from '../../utils/payoutClient';
import PayoutTrace from './PayoutTrace';
import useAnalystStore from '../../store/useAnalystStore';

export default function PayoutList({ requests, admin = false }) {
    const [query, setQuery] = useState(''), [status, setStatus] = useState(''), [expanded, setExpanded] = useState(null);
    const [start, setStart] = useState(''), [end, setEnd] = useState('');
    const [busy, setBusy] = useState(null), [error, setError] = useState(''), [matches, setMatches] = useState(new Set()), [searching, setSearching] = useState(false);
    const [payment, setPayment] = useState(null);
    const upload = useAnalystStore(state => state.uploadInvoiceReceipt);
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
    const filtered = requests.filter(request => {
        const date = request.createdAt?.toDate?.().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }) || '';
        return (!query.trim() || matches.has(request.id)) && (!status || request.status === status) && (!start || date >= start) && (!end || date <= end);
    });
    return <div className="space-y-4 text-slate-900 dark:text-slate-100">
        <div className="flex flex-wrap gap-3"><input aria-label="Buscar solicitud" className="rounded border p-2 dark:bg-slate-800 flex-1 min-w-64" placeholder="N° solicitud, orden, analista, siniestro, factura o referencia" value={query} onChange={e => setQuery(e.target.value)} />
            <select aria-label="Estado" className="rounded border p-2 dark:bg-slate-800" value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos los estados</option>{[...new Set(requests.map(r => r.status))].map(value => <option key={value} value={value}>{payoutLabels[value] || value}</option>)}</select>
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
                    {request.invoiceStatus === 'UPLOADED' && <button disabled={!!busy} onClick={() => confirm('¿Verificaste la factura y su importe contra la orden?') && act(request, 'VERIFY')}>Verificar factura</button>}
                    {['READY_TO_PAY', 'PENDIENTE_PAGO', 'APPROVED_SCHEDULED'].includes(request.status) && <button disabled={!!busy || (request.requiresInvoiceSnapshot && request.invoiceStatus !== 'VERIFIED')} onClick={() => setPayment({ request, date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }), amount: request.totalAmount, account: '', reference: '' })}>Registrar pago realizado</button>}
                </>}
                {!admin && !request.activeOperation && ['APPROVED_WAITING_INVOICE', 'NEEDS_INVOICE', 'PENDIENTE_FACTURA'].includes(request.status) && <label className="text-blue-500 cursor-pointer">Adjuntar factura PDF<input aria-label="Adjuntar factura PDF" type="file" accept="application/pdf" disabled={!!busy} className="block" onChange={async e => { const file = e.target.files[0]; if (!file) return; setBusy(request.id); const result = await upload(request.id, file, request.analystUid); if (!result.success) setError(result.error); setBusy(null); }} /></label>}
                {!admin && ['FAILED', 'REJECTED'].includes(request.status) && <button onClick={() => { clearCreateRetryKey(); alert('Podés volver a seleccionar los casos habilitados desde el dashboard.'); }}>Preparar nueva solicitud</button>}
            </div>
            {expanded === request.id && <PayoutTrace request={request} />}
        </article>)}
        {payment && <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"><form className="bg-white dark:bg-slate-800 p-6 rounded-lg space-y-4 max-w-lg w-full" onSubmit={e => { e.preventDefault(); act(payment.request, 'PAY', { date: payment.date, amount: payment.amount, account: payment.account, reference: payment.reference }); }}>
            <h3 className="font-bold">Registrar pago · {requestNumber(payment.request)}</h3><p>Confirmá los datos del pago ya realizado. Esta acción no ejecuta una transferencia.</p>
            {[['date', 'Fecha efectiva', 'date'], ['amount', 'Importe pagado', 'number'], ['account', 'Cuenta de origen', 'text'], ['reference', 'Referencia / operación bancaria', 'text']].map(([key, label, type]) => <label className="block" key={key}>{label}<input className="block w-full border p-2 dark:bg-slate-900" required type={type} step={key === 'amount' ? '0.01' : undefined} value={payment[key]} onChange={e => setPayment({ ...payment, [key]: e.target.value })} /></label>)}
            {error && <p role="alert" className="text-red-600">{error}</p>}<button type="button" onClick={() => setPayment(null)} disabled={!!busy}>Cancelar</button><button className="bg-blue-600 text-white p-2 rounded ml-4" disabled={!!busy}>Confirmar registro</button>
        </form></div>}
    </div>;
}
