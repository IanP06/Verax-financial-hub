import React from 'react';
import AnalystPayoutHistory from './AnalystPayoutHistory'; // Reuse existing component

const AnalystPayoutRequests = () => {
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Mis Solicitudes de Pago</h2>
            <div className="bg-white dark:bg-slate-800 shadow rounded-lg p-6">
                <AnalystPayoutHistory />
            </div>
        </div>
    );
};

export default AnalystPayoutRequests;
