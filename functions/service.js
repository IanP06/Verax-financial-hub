import { createHash } from 'node:crypto';
import { DomainError, requireValue, nameKey, eligible, snapshot, transition, invoiceCents, cents, localDate } from './domain.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const CHUNK = 75;
const event = (uid, role, action, now, extra = {}) => ({ byUid: uid, byRole: role, action, at: now.toISOString(), ...extra });
// Admin SDK only. Client security rules deny writes to this ledger and its jobs.
export function payoutService(db, { now = () => new Date() } = {}) {
    const ref = path => db.doc(path);
    async function command(uid, data) {
        requireValue(uid, 'Iniciá sesión nuevamente.');
        requireValue(typeof data.operationId === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(data.operationId), 'Identificador de operación inválido.');
        const jobId = hash(`${uid}:${data.operationId}`);
        const jobRef = ref(`payoutJobs/${jobId}`);
        const requestId = data.action === 'CREATE' ? jobId : data.requestId;
        requireValue(typeof requestId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(requestId), 'Solicitud inválida.');
        const reqRef = ref(`payoutRequests/${requestId}`);
        const payload = data.payload || {};
        const fingerprint = hash(JSON.stringify({ action: data.action, requestId, payload }));
        return db.runTransaction(async tx => {
            const [profileDoc, existingJob, reqDoc, rulesDoc] = await Promise.all([
                tx.get(ref(`userProfiles/${uid}`)), tx.get(jobRef), tx.get(reqRef), tx.get(ref('settings/analystRules'))
            ]);
            const profile = profileDoc.data();
            requireValue(profile && profile.isActive !== false, 'Usuario inactivo o sin perfil.');
            const role = String(profile.role).toLowerCase();
            if (existingJob.exists) {
                requireValue(existingJob.data().fingerprint === fingerprint, 'El reintento tiene datos distintos.');
                return { requestId, requestNumber: reqDoc.data()?.requestNumber, jobId };
            }
            const timestamp = now();
            if (data.action === 'RESUME') {
                const request = reqDoc.data();
                requireValue(role === 'admin' && request?.activeOperation, 'No hay un proceso para reintentar.');
                const blockedRef = ref(`payoutJobs/${request.activeOperation}`);
                const blocked = (await tx.get(blockedRef)).data();
                requireValue(blocked?.phase === 'BLOCKED', 'El proceso sigue activo o ya terminó.');
                tx.update(blockedRef, { phase: 'APPLY', error: null, resumedAt: timestamp });
                tx.update(reqRef, { processingError: null });
                tx.create(ref(`payoutRequests/${requestId}/events/${jobId}-resume`), event(uid, role, 'RESUME', timestamp));
                tx.create(jobRef, { requestId, fingerprint, phase: 'DONE' });
                return { requestId, jobId };
            }
            const year = localDate(timestamp).slice(0, 4);
            let request = reqDoc.data();
            let ids, changes;
            if (data.action === 'CREATE') {
                requireValue(role === 'analyst', 'Solo un analista puede crear su solicitud.');
                ids = payload.invoiceIds;
                requireValue(Array.isArray(ids) && ids.length > 0 && ids.every(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id)), 'Seleccioná casos válidos.');
                requireValue(new Set(ids).size === ids.length, 'La selección contiene casos repetidos.');
                // Limit bytes, not five cases; details live in a subcollection.
                requireValue(Buffer.byteLength(JSON.stringify(ids)) < 500000, 'La selección excede el tamaño de una solicitud. Contactá a administración.');
                const analystName = profile.analystKey || profile.displayName;
                requireValue(analystName, 'El perfil no tiene analista asignado.');
                const counterRef = ref(`payoutCounters/SOL-${year}`);
                const counter = await tx.get(counterRef);
                const sequence = (counter.data()?.value || 0) + 1;
                request = { schemaVersion: 2, requestNumber: `SOL-${year}-${String(sequence).padStart(6, '0')}`, analystUid: uid, analystName,
                    createdAt: timestamp, status: 'PROCESSING', invoiceIds: ids, caseCount: ids.length, processedCount: 0,
                    totalCents: 0, totalAmount: 0, currency: 'ARS', invoiceStatus: 'NOT_REQUIRED', invoiceReceipt: null, invoiceSnapshot: [], history: [] };
                tx.set(counterRef, { value: sequence });
                tx.create(reqRef, request);
                changes = { status: 'SUBMITTED', invoiceState: 'PENDIENTE_APROBACION' };
            } else {
                requireValue(request && !request.activeOperation, 'La solicitud no existe o tiene una operación en curso.');
                requireValue(data.action === 'UPLOAD' ? (role === 'analyst' && request.analystUid === uid) : role === 'admin', 'No tenés permiso para esta acción.');
                ids = request.invoiceIds || [];
                requireValue(ids.length > 0, 'La solicitud no contiene casos.');
                const ownerDoc = await tx.get(ref(`userProfiles/${request.analystUid}`));
                const owner = ownerDoc.data();
                requireValue(owner, 'El perfil del analista no existe.');
                const rule = (rulesDoc.data()?.rules || []).find(r => nameKey(r.name) === nameKey(owner.analystKey || owner.displayName));
                const requiresInvoice = rule?.requiresInvoice === true || (data.action !== 'APPROVE' && request.requiresInvoiceSnapshot === true);
                if (data.action === 'UPLOAD') {
                    const receipt = payload.receipt;
                    requireValue(receipt && typeof receipt.fileName === 'string' && /^[a-zA-Z0-9_.-]+\.pdf$/i.test(receipt.fileName), 'Comprobante inválido.');
                    requireValue(receipt.storagePath === `payout_receipts/${requestId}/${receipt.fileName}`, 'Ruta de comprobante inválida.');
                    payload.receipt = { fileName: receipt.fileName, storagePath: receipt.storagePath, uploadedAt: timestamp.toISOString(), uploadedByUid: uid };
                }
                changes = transition(request, data.action, payload, requiresInvoice, timestamp);
                if (data.action === 'APPROVE' && !request.orderNumber) {
                    const counterRef = ref(`payoutCounters/OP-${year}`);
                    const counter = await tx.get(counterRef);
                    const sequence = (counter.data()?.value || 0) + 1;
                    changes.orderNumber = `OP-${year}-${String(sequence).padStart(6, '0')}`;
                    tx.set(counterRef, { value: sequence });
                }
                if (data.action === 'PAY') {
                    const paymentKey = hash(`${nameKey(changes.payment.account)}:${nameKey(changes.payment.reference)}`);
                    const paymentRef = ref(`payoutPaymentReferences/${paymentKey}`);
                    const duplicate = await tx.get(paymentRef);
                    requireValue(!duplicate.exists, 'Esta referencia bancaria ya fue registrada en otra orden.');
                    tx.create(paymentRef, { requestId, jobId, reservedAt: timestamp });
                    changes.payment.key = paymentKey;
                    changes.payment.recordedByUid = uid;
                    changes.payment.recordedAt = timestamp.toISOString();
                }
            }
            const audit = event(uid, role, `${data.action}_STARTED`, timestamp, { actorName: profile.displayName || profile.analystKey || uid, fromStatus: request.status, toStatus: changes.status, caseCount: ids.length, totalAmount: request.totalAmount });
            tx.set(reqRef, { activeOperation: jobId, processingAction: data.action, processedCount: 0, processingError: null, updatedAt: timestamp }, { merge: true });
            tx.create(ref(`payoutRequests/${requestId}/events/${jobId}-start`), audit);
            tx.create(jobRef, { requestId, fingerprint, action: data.action, actorUid: uid, actorRole: role,
                phase: data.action === 'CREATE' ? 'APPLY' : 'VALIDATE', cursor: 0, validatedCents: 0, changes, createdAt: timestamp });
            return { requestId, requestNumber: request.requestNumber || `LEG-${requestId}`, jobId };
        });
    }

    // Each chunk advances the durable cursor in the same transaction as its writes.
    // Duplicate/out-of-order trigger deliveries are safe; each write schedules the next chunk.
    async function advance(jobId) {
        const jobRef = ref(`payoutJobs/${jobId}`);
        try {
            return await db.runTransaction(async tx => {
                const jobDoc = await tx.get(jobRef);
                const job = jobDoc.data();
                if (!job || ['DONE', 'FAILED', 'BLOCKED'].includes(job.phase)) return;
                const reqRef = ref(`payoutRequests/${job.requestId}`);
                const reqDoc = await tx.get(reqRef);
                const req = reqDoc.data();
                requireValue(req?.activeOperation === jobId, 'La operación ya no controla esta solicitud.');
                const timestamp = now();
                const ids = req.invoiceIds.slice(job.cursor, job.cursor + CHUNK);
                const invoiceDocs = await Promise.all(ids.map(id => tx.get(ref(`invoices/${id}`))));
                const details = job.action === 'CREATE' || job.phase === 'ROLLBACK' ? [] : await Promise.all(ids.map(id => tx.get(ref(`payoutRequests/${job.requestId}/items/${id}`))));
                let added = 0, validatedCents = job.validatedCents || 0;
                for (let i = 0; i < ids.length; i++) {
                    const id = ids[i], inv = invoiceDocs[i].data();
                    if (job.phase === 'ROLLBACK') {
                        if (inv?.linkedPayoutRequestId === job.requestId) {
                            const reset = { estadoPago: 'IMPAGO', paymentStatus: 'IMPAGO', linkedPayoutRequestId: null, payoutRequestedAt: null };
                            tx.update(ref(`invoices/${id}`), reset);
                            tx.set(ref(`analyst_invoices/${req.analystUid}/items/${id}`), reset, { merge: true });
                        }
                        continue;
                    }
                    requireValue(inv, `No existe el caso ${id}.`);
                    if (job.action === 'CREATE') {
                        try { eligible(inv, req.analystName, timestamp); }
                        catch (e) { throw new DomainError(`Caso ${inv.siniestro || id}: ${e.message}`); }
                        const item = snapshot(id, inv);
                        added += item.totalCents;
                        tx.create(ref(`payoutRequests/${job.requestId}/items/${id}`), item);
                    } else {
                        const item = details[i]?.data() || req.invoiceSnapshot?.find(row => row.id === id);
                        requireValue(item, `Falta el detalle original del caso ${id}.`);
                        requireValue(inv.linkedPayoutRequestId === job.requestId, `El caso ${id} ya no está vinculado a esta solicitud.`);
                        requireValue([inv.analista, inv.analyst].some(n => nameKey(n) === nameKey(req.analystName)), `Cambió el analista del caso ${id}.`);
                        if (job.action !== 'REJECT') requireValue(invoiceCents(inv) === (item.totalCents ?? cents(item.total)), `Cambió el importe del caso ${inv.siniestro || id}. Revisá la orden antes de continuar.`);
                        if (job.phase === 'VALIDATE') validatedCents += item.totalCents ?? cents(item.total);
                        requireValue(!['PAGO', 'PAID'].includes(inv.estadoPago), `El caso ${id} ya está pagado.`);
                    }
                    if (job.phase === 'VALIDATE') continue;
                    const fields = { estadoPago: job.changes.invoiceState, paymentStatus: job.changes.invoiceState };
                    if (job.action === 'CREATE') Object.assign(fields, { linkedPayoutRequestId: job.requestId, payoutRequestedAt: timestamp });
                    if (job.action === 'REJECT') Object.assign(fields, { linkedPayoutRequestId: null, payoutRequestedAt: null });
                    if (job.action === 'PAY') Object.assign(fields, { fechaPagoAnalista: job.changes.paidAt });
                    tx.update(ref(`invoices/${id}`), fields);
                    tx.set(ref(`analyst_invoices/${req.analystUid}/items/${id}`), { ...fields, ...(job.action === 'PAY' ? { paymentDate: job.changes.paidAt } : {}) }, { merge: true });
                }
                const cursor = job.cursor + ids.length;
                const totalCents = req.totalCents + added;
                if (job.action === 'CREATE' && job.phase !== 'ROLLBACK') requireValue(Number.isSafeInteger(totalCents), 'El total excede el rango permitido.');
                if (cursor < req.invoiceIds.length) {
                    tx.update(jobRef, { cursor, validatedCents, updatedAt: timestamp });
                    tx.update(reqRef, { processedCount: cursor, ...(job.action === 'CREATE' && job.phase !== 'ROLLBACK' ? { totalCents, totalAmount: totalCents / 100 } : {}) });
                    return;
                }
                if (job.phase === 'VALIDATE') {
                    if (job.action !== 'REJECT') requireValue(validatedCents === (req.totalCents ?? cents(req.totalAmount)), 'El total de la orden no coincide con el detalle original.');
                    tx.update(jobRef, { phase: 'APPLY', cursor: 0 });
                    return;
                }
                const failed = job.phase === 'ROLLBACK';
                const { invoiceState: ignored, ...changes } = job.changes;
                void ignored;
                const finalStatus = failed ? 'FAILED' : changes.status;
                const finished = event(job.actorUid, job.actorRole, failed ? 'CREATE_FAILED' : job.action, timestamp,
                    { fromStatus: req.status, toStatus: finalStatus, note: job.error || changes.rejectionReason || '', jobId });
                tx.update(reqRef, { ...(failed ? {} : changes), status: finalStatus, activeOperation: null, processingAction: null,
                    processedCount: cursor, updatedAt: timestamp, ...(job.action === 'CREATE' ? { totalCents: failed ? 0 : totalCents, totalAmount: failed ? 0 : totalCents / 100 } : {}),
                    ...(job.action === 'APPROVE' ? { approvedAt: timestamp } : {}), ...(job.action === 'VERIFY' ? { verifiedAt: timestamp } : {}),
                    ...(job.action === 'REJECT' ? { rejectedAt: timestamp } : {}), ...(job.error ? { processingError: job.error } : {}) });
                tx.create(ref(`payoutRequests/${job.requestId}/events/${jobId}-end`), finished);
                if (job.action === 'PAY' && !failed) tx.create(ref(`analystPayments/${job.requestId}`), { ...changes.payment, requestId: job.requestId, requestNumber: req.requestNumber || `LEG-${job.requestId}`, orderNumber: req.orderNumber || null, analystUid: req.analystUid, caseCount: req.invoiceIds.length });
                tx.update(jobRef, { phase: failed ? 'FAILED' : 'DONE', completedAt: timestamp });
            });
        } catch (error) {
            if (!(error instanceof DomainError)) throw error; // Infrastructure failure: trigger retries.
            await db.runTransaction(async tx => {
                const snap = await tx.get(jobRef);
                const job = snap.data();
                if (!job || ['DONE', 'FAILED', 'BLOCKED', 'ROLLBACK'].includes(job.phase)) return;
                const reqRef = ref(`payoutRequests/${job.requestId}`);
                const request = (await tx.get(reqRef)).data();
                if (request?.activeOperation !== jobId) return;
                const canCancel = job.phase === 'VALIDATE';
                tx.update(jobRef, { phase: job.action === 'CREATE' ? 'ROLLBACK' : canCancel ? 'FAILED' : 'BLOCKED', cursor: job.action === 'CREATE' ? 0 : job.cursor, error: error.message });
                tx.update(reqRef, { processingError: error.message, ...(canCancel ? { activeOperation: null, processingAction: null } : {}) });
                if (canCancel && job.changes.payment?.key) tx.delete(ref(`payoutPaymentReferences/${job.changes.payment.key}`));
                tx.set(ref(`payoutRequests/${job.requestId}/events/${jobId}-error`), event(job.actorUid, job.actorRole, 'ERROR', now(), { note: error.message }));
            });
        }
    }
    return { command, advance };
}
