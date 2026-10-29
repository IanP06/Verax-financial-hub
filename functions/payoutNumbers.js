import { localDate, requireValue } from './domain.js';

// All reads precede writes. Called only inside the command's Firestore transaction.
export async function reservePayoutNumber(db, tx, uid, requestId, now) {
    const registryRef = db.doc('payoutCounters/analystRegistry');
    const registry = (await tx.get(registryRef)).data() || { value: 0, analysts: {} };
    const analysts = registry.analysts || {};
    const existing = analysts[uid];
    const id = existing ?? registry.value + 1;
    requireValue(Number.isInteger(id) && id >= 1 && id <= 99, 'No quedan IDs de analista de dos dígitos. Contactá a administración.');
    requireValue(!Object.entries(analysts).some(([owner, value]) => owner !== uid && value === id), 'El registro de IDs de analistas es inconsistente.');
    const analystId = String(id).padStart(2, '0');
    const counterRef = db.doc(`payoutCounters/analyst-${analystId}`);
    const counter = (await tx.get(counterRef)).data();
    const sequence = (counter?.value || 0) + 1;
    requireValue(Number.isSafeInteger(sequence) && sequence > 0, 'El correlativo no es válido.');
    const date = localDate(now).split('-').reverse().join('');
    const number = `${date}_${analystId}_${String(sequence).padStart(4, '0')}`;
    const numberRef = db.doc(`payoutNumbers/${number}`);
    requireValue(!(await tx.get(numberRef)).exists, 'El número ya está reservado. Revisá el contador antes de continuar.');
    if (existing == null) tx.set(registryRef, { value: id, analysts: { ...analysts, [uid]: id } });
    tx.set(counterRef, { value: sequence, analystUid: uid });
    tx.create(numberRef, { requestId, analystUid: uid, analystId, sequence, date, reservedAt: now });
    return { number, analystId, sequence };
}
