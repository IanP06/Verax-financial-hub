import React from 'react';
import StagingTable from './StagingTable';

const StagingView = () => {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-primary">Staging Area</h2>
                    <p className="text-gray-500">Revisa y completa los datos antes de confirmar.</p>
                </div>
                {/* Future: Bulk actions */}
            </div>

            <StagingTable />
        </div>
    );
};

export default StagingView;
