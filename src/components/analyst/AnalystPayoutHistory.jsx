import React from 'react';
import useAnalystStore from '../../store/useAnalystStore';
import PayoutList from './PayoutList';
export default function AnalystPayoutHistory() {
    const { payoutRequests, requestsError } = useAnalystStore();
    return requestsError ? <p role="alert">No se pudo cargar el historial.</p> : <PayoutList requests={payoutRequests || []} />;
}
