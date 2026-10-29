import { requireValue } from './domain.js';

// Reserve the global code atomically with the request. Historical counters stay intact.
export async function reservePayoutNumber(db, tx, uid, requestId, now) {
    const counterRef = db.doc('payoutCounters/sol');
    const counter = (await tx.get(counterRef)).data();
    const sequence = (counter?.value || 0) + 1;
    requireValue(Number.isSafeInteger(sequence) && sequence > 0, 'El correlativo no es válido.');
    const number = `SOL${String(sequence).padStart(5, '0')}`;
    const numberRef = db.doc(`payoutNumbers/${number}`);
    requireValue(!(await tx.get(numberRef)).exists, 'El número ya está reservado. Revisá el contador antes de continuar.');
    tx.set(counterRef, { value: sequence });
    tx.create(numberRef, { requestId, analystUid: uid, sequence, reservedAt: now });
    return { number, analystId: null, sequence };
}
