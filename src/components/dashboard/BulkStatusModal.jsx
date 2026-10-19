import { useRef, useState } from 'react';
import useInvoiceStore from '../../store/useInvoiceStore';
import { validateBulkStatusChange } from '../../utils/bulkInvoiceStatus.js';

export default function BulkStatusModal({ rows, onClose, onSuccess }) {
    const updateStatuses = useInvoiceStore(s => s.updateSelectedInvoiceStatuses);
    const today = new Date().toLocaleDateString('en-CA');
    const [change, setChange] = useState({ estadoPago: '', estadoDeCobro: '', fechaPago: today, fechaCobro: today });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const sending = useRef(false);
    const field = (name, value) => { setChange(previous => ({ ...previous, [name]: value })); setError(''); };
    let validation = '';
    try { validateBulkStatusChange(rows, change); } catch (err) { validation = err.message; }
    const submit = async event => {
        event.preventDefault();
        if (sending.current || validation) return;
        sending.current = true;
        setBusy(true);
        setError('');
        try {
            const result = await updateStatuses(rows, change);
            if (!result.success) throw new Error(result.message);
            onSuccess(result.count);
        } catch (err) {
            setError(err.message || 'No se pudo guardar el cambio.');
        } finally { sending.current = false; setBusy(false); }
    };
    const inputClass = 'w-full border rounded p-2 bg-white dark:bg-slate-800 dark:border-slate-600';
    return <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
        <form role="dialog" aria-modal="true" aria-labelledby="bulk-status-title" onSubmit={submit} className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 dark:text-gray-100 rounded-lg p-6 shadow-xl">
            <h2 id="bulk-status-title" className="text-xl font-bold">Cambiar estados de {rows.length} casos</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Elegí pago, cobro o ambos. Solo se modificarán los casos de esta lista.</p>
            <fieldset disabled={busy} className="grid sm:grid-cols-2 gap-4 my-5">
                <label className="space-y-1">Estado de pago<select aria-label="Nuevo estado de pago" className={inputClass} value={change.estadoPago} onChange={e => field('estadoPago', e.target.value)}>
                    <option value="">Sin cambios</option><option value="PAGO">PAGO</option><option value="IMPAGO">IMPAGO</option>
                </select></label>
                <label className="space-y-1">Estado de cobro<select aria-label="Nuevo estado de cobro" className={inputClass} value={change.estadoDeCobro} onChange={e => field('estadoDeCobro', e.target.value)}>
                    <option value="">Sin cambios</option><option value="COBRADO">COBRADO</option><option value="NO COBRADO">NO COBRADO</option>
                </select></label>
                {change.estadoPago === 'PAGO' && <label>Fecha real de pago<input aria-label="Fecha real de pago" type="date" required className={inputClass} value={change.fechaPago} onChange={e => field('fechaPago', e.target.value)} /></label>}
                {change.estadoDeCobro === 'COBRADO' && <label>Fecha real de cobro<input aria-label="Fecha real de cobro" type="date" required className={inputClass} value={change.fechaCobro} onChange={e => field('fechaCobro', e.target.value)} /></label>}
            </fieldset>
            <div className="max-h-52 overflow-auto border dark:border-slate-700 rounded text-xs">
                <table className="w-full text-left text-gray-900 dark:text-gray-100"><thead className="bg-gray-100 dark:bg-slate-800"><tr><th className="p-2">Factura / Siniestro</th><th className="p-2">Pago actual → nuevo</th><th className="p-2">Cobro actual → nuevo</th></tr></thead><tbody>
                    {rows.map(row => <tr key={row.id} className="border-t dark:border-slate-700"><td className="p-2">{row.nroFactura}<br />{row.siniestro}</td><td className="p-2">{row.estadoPago || 'IMPAGO'} → {change.estadoPago || 'Sin cambios'}</td><td className="p-2">{row.estadoDeCobro || 'NO COBRADO'} → {change.estadoDeCobro || 'Sin cambios'}</td></tr>)}
                </tbody></table>
            </div>
            {(change.estadoPago === 'IMPAGO' || change.estadoDeCobro === 'NO COBRADO') && <p className="text-sm mt-3">Se borrará la fecha del pago o cobro que se revierta.</p>}
            {validation && <p role="status" className="text-sm text-amber-700 dark:text-amber-300 mt-3">{validation}</p>}
            {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300 mt-3">{error} Actualizá la tabla antes de reintentar.</p>}
            <div className="flex justify-end gap-3 mt-5"><button type="button" disabled={busy} onClick={onClose} className="px-4 py-2 border rounded">Cancelar</button><button type="submit" disabled={busy || !!validation} className="px-4 py-2 bg-blue-700 text-white rounded disabled:opacity-50">{busy ? 'Guardando…' : `Confirmar cambio en ${rows.length} casos`}</button></div>
        </form>
    </div>;
}
