import { normalizeName } from './text.js';

export const MAX_BULK_INVOICES = 200;
export const statusSnapshot = invoice => ({
    estadoPago: invoice.estadoPago || 'IMPAGO',
    paymentStatus: invoice.paymentStatus || invoice.estadoPago || 'IMPAGO',
    estadoDeCobro: invoice.estadoDeCobro || 'NO COBRADO',
    linkedPayoutRequestId: invoice.linkedPayoutRequestId || null,
    analyst: invoice.analyst || invoice.analista || '',
});

export function parseStatusDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!match) throw new Error('Ingresá una fecha válida.');
    const [, year, month, day] = match.map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) throw new Error('Ingresá una fecha válida.');
    return date;
}

export function validateBulkStatusChange(rows, change) {
    if (!rows.length) throw new Error('Seleccioná al menos un caso.');
    if (rows.length > MAX_BULK_INVOICES) throw new Error(`Seleccioná hasta ${MAX_BULK_INVOICES} casos por operación.`);
    if (new Set(rows.map(r => r.id)).size !== rows.length || rows.some(r => typeof r.id !== 'string' || !r.id || r.id.includes('/'))) throw new Error('La selección contiene identificadores inválidos o repetidos.');
    if (!change.estadoPago && !change.estadoDeCobro) throw new Error('Elegí un estado de pago, de cobro o ambos.');
    if (change.estadoPago && !['PAGO', 'IMPAGO'].includes(change.estadoPago)) throw new Error('Estado de pago inválido.');
    if (change.estadoDeCobro && !['COBRADO', 'NO COBRADO'].includes(change.estadoDeCobro)) throw new Error('Estado de cobro inválido.');
    if (change.estadoPago === 'PAGO') parseStatusDate(change.fechaPago);
    if (change.estadoDeCobro === 'COBRADO') parseStatusDate(change.fechaCobro);
    if (change.estadoPago) {
        const linked = rows.filter(r => r.linkedPayoutRequestId || !['PAGO', 'IMPAGO'].includes(r.estadoPago || 'IMPAGO') || !['PAGO', 'IMPAGO'].includes(r.paymentStatus || r.estadoPago || 'IMPAGO'));
        if (linked.length) throw new Error(`${linked.length} caso(s) tienen una solicitud de honorarios o un pago en trámite. Gestioná su pago desde Solicitudes; el cobro sí puede cambiarse aquí.`);
    }
}

export function visibleSelection(rows, selectedIds) {
    const selected = new Set(selectedIds);
    return rows.filter(row => selected.has(row.id));
}

// The adapter keeps the transaction orchestration testable without production access.
export async function executeBulkStatusChange({ api, db, actorUid, rows, change, profiles = [] }) {
    if (!actorUid) throw new Error('Iniciá sesión nuevamente.');
    validateBulkStatusChange(rows, change);
    return api.runTransaction(db, async transaction => {
        const actor = await transaction.get(api.doc(db, 'userProfiles', actorUid));
        if (!actor.exists() || actor.data().role?.toLowerCase() !== 'admin') throw new Error('Esta acción requiere un administrador.');
        const fresh = [];
        for (const row of rows) {
            const ref = api.doc(db, 'invoices', row.id);
            const snapshot = await transaction.get(ref);
            if (!snapshot.exists()) throw new Error(`La factura ${row.nroFactura || row.id} ya no existe. Actualizá la tabla.`);
            const invoice = { ...snapshot.data(), id: row.id };
            if (JSON.stringify(statusSnapshot(invoice)) !== JSON.stringify(statusSnapshot(row))) throw new Error(`La factura ${row.nroFactura || row.id} cambió desde la selección. Actualizá la tabla y revisá los estados.`);
            fresh.push({ invoice, ref });
        }
        validateBulkStatusChange(fresh.map(r => r.invoice), change);
        // Resolve all destinations before queuing writes. An ambiguous profile aborts all.
        const plans = fresh.map(({ invoice, ref }) => {
            let mirror = null;
            if (change.estadoPago) {
                const name = normalizeName(invoice.analyst || invoice.analista);
                const matches = profiles.filter(p => p.role?.toLowerCase() === 'analyst' && normalizeName(p.analystKey) === name);
                if (!name || matches.length !== 1 || !matches[0].uid) throw new Error(`No se pudo identificar de forma única al analista de la factura ${invoice.nroFactura || invoice.id}. Revisá su asignación.`);
                mirror = api.doc(db, 'analyst_invoices', matches[0].uid, 'items', invoice.id);
            }
            return { invoice, ref, mirror };
        });
        const updates = [];
        for (const { invoice, ref, mirror } of plans) {
            const fields = { updatedAt: api.serverTimestamp(), statusUpdatedBy: actorUid };
            if (change.estadoDeCobro) {
                fields.estadoDeCobro = change.estadoDeCobro;
                fields.fechaCobro = change.estadoDeCobro === 'COBRADO' ? api.Timestamp.fromDate(parseStatusDate(change.fechaCobro)) : null;
                fields.fechaPago = change.estadoDeCobro === 'COBRADO' ? change.fechaCobro.split('-').reverse().join('/') : null;
                fields.cobradoAt = change.estadoDeCobro === 'COBRADO' ? api.serverTimestamp() : null;
            }
            if (change.estadoPago) {
                fields.estadoPago = change.estadoPago;
                fields.paymentStatus = change.estadoPago;
                fields.fechaPagoAnalista = change.estadoPago === 'PAGO' ? change.fechaPago : null;
                transaction.set(mirror, { estadoPago: change.estadoPago, paymentStatus: change.estadoPago, paymentDate: fields.fechaPagoAnalista, updatedAt: api.serverTimestamp() }, { merge: true });
            }
            transaction.update(ref, fields);
            updates.push({ id: invoice.id, fields });
        }
        return updates;
    });
}
