import React, { useEffect, useState } from 'react';
import useAnalystStore from '../../store/useAnalystStore';
import { useAuth } from '../../context/AuthContext';
import AnalystTable from './AnalystTable';
import { BarChart, Wallet, FileText, CheckCircle } from 'lucide-react';
import CashoutModal from './CashoutModal'; // Will create next

const StatCard = ({ title, value, subtext, icon: Icon, color }) => (
    <div className="bg-white dark:bg-slate-800 overflow-hidden rounded-lg shadow">
        <div className="p-5">
            <div className="flex items-center">
                <div className="flex-shrink-0">
                    <Icon className={`h-6 w-6 text-${color}-600`} aria-hidden="true" />
                </div>
                <div className="ml-5 w-0 flex-1">
                    <dl>
                        <dt className="truncate text-sm font-medium text-gray-500 dark:text-gray-400">{title}</dt>
                        <dd>
                            <div className="text-lg font-medium text-gray-900 dark:text-white">{value}</div>
                        </dd>
                    </dl>
                </div>
            </div>
        </div>
        {subtext && (
            <div className="bg-gray-50 dark:bg-slate-900 px-5 py-3">
                <div className="text-sm">
                    <span className="text-gray-500 dark:text-gray-400">{subtext}</span>
                </div>
            </div>
        )}
    </div>
);

const AnalystDashboard = () => {
    const { user, userProfile } = useAuth();
    const { fetchAnalystData, analystInvoices, getStats } = useAnalystStore();
    const [selectedIds, setSelectedIds] = useState([]);
    const [isCashoutModalOpen, setCashoutModalOpen] = useState(false);

    useEffect(() => {
        let unsubscribe = () => { };

        if (user?.uid && (userProfile?.analystKey || userProfile?.displayName)) {
            const key = userProfile.analystKey || userProfile.displayName;
            // Use Subscribe instead of Fetch
            unsubscribe = useAnalystStore.getState().subscribeToAnalystData(user.uid, key);
        }

        return () => {
            unsubscribe && unsubscribe();
        };
    }, [user, userProfile]);

    const stats = getStats();

    const handleOpenCashout = () => {
        if (selectedIds.length > 0) {
            setCashoutModalOpen(true);
        } else {
            alert("Seleccione al menos una factura para solicitar pago.");
        }
    };

    return (
        <div className="space-y-6">

            {/* Header / Title */}
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Panel de Control</h2>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Total Casos"
                    value={stats.totalCases}
                    icon={FileText}
                    color="blue"
                />
                <StatCard
                    title="Monto Histórico"
                    value={`$${stats.totalAmount.toLocaleString('es-AR')}`}
                    icon={BarChart}
                    color="green"
                />
                <StatCard
                    title="Disponible Pago"
                    value={stats.readyCount}
                    subtext="Casos > 40 días e Impagos"
                    icon={CheckCircle}
                    color="yellow"
                />
                <StatCard
                    title="Monto Disponible"
                    value={`$${stats.readyAmount.toLocaleString('es-AR')}`}
                    icon={Wallet}
                    color="green"
                />
            </div>

            {/* Actions Bar */}
            <div className="flex justify-end items-center gap-4">
                {stats.readyCount > 0 && (
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                        {selectedIds.length} facturas seleccionadas
                    </div>
                )}
                <button
                    onClick={handleOpenCashout}
                    disabled={selectedIds.length === 0}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Wallet className="mr-2 h-4 w-4" />
                    Solicitar Orden de Pago
                </button>
            </div>

            {/* Main Table */}
            <AnalystTable
                invoices={analystInvoices}
                onSelectionChange={setSelectedIds}
            />

            {/* Modal */}
            {isCashoutModalOpen && (
                <CashoutModal
                    isOpen={isCashoutModalOpen}
                    onClose={() => setCashoutModalOpen(false)}
                    selectedIds={selectedIds}
                    invoices={analystInvoices}
                    user={user}
                    userProfile={userProfile}
                />
            )}
        </div>
    );
};

export default AnalystDashboard;
