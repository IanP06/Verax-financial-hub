import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import PayoutList from '../analyst/PayoutList';
export default function PayoutRequests() {
    const [requests, setRequests] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
    useEffect(() => onSnapshot(query(collection(db, 'payoutRequests'), orderBy('createdAt', 'desc')), snapshot => {
        setRequests(snapshot.docs.map(d => ({ ...d.data(), id: d.id }))); setLoading(false);
    }, () => { setError('No se pudieron cargar las solicitudes.'); setLoading(false); }), []);
    return <div className="space-y-6"><h2 className="text-2xl font-bold text-gray-900 dark:text-white">Solicitudes de Pago</h2>{error && <p role="alert">{error}</p>}{loading ? <p>Cargando…</p> : <PayoutList requests={requests} admin />}</div>;
}
