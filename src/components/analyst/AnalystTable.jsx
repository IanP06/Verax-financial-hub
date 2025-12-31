import React, { useState, useMemo, useEffect } from 'react';
import { normalizeInvoiceForAnalyst } from '../../utils/invoiceNormalizer';
import { ChevronUp, ChevronDown, Filter, CheckSquare, Square, ArrowUpDown } from 'lucide-react';

const AnalystTable = ({ invoices, onSelectionChange }) => {
    const [filter, setFilter] = useState('');
    const [companyFilter, setCompanyFilter] = useState('ALL');
    const [sortConfig, setSortConfig] = useState({ key: 'fechaEmision', direction: 'desc' });
    const [selectedIds, setSelectedIds] = useState([]);

    // 1. Normalize Data
    const normalizedInvoices = useMemo(() => {
        return (invoices || []).map(inv => normalizeInvoiceForAnalyst(inv));
    }, [invoices]);

    // 2. Unique Companies for Filter
    const uniqueCompanies = useMemo(() => {
        const companies = new Set(normalizedInvoices.map(i => i.compania).filter(Boolean));
        return Array.from(companies).sort();
    }, [normalizedInvoices]);

    // 3. Helpers
    const isEligibleForCashout = (inv) => {
        // Exclude if PAGO, PENDIENTE, EN_SOLICITUD, PENDIENTE_PAGO
        const status = inv.estadoPago || 'IMPAGO';
        if (status !== 'IMPAGO') return false;
        // Strict IMPAGO check handles PENDIENTE/PAGO exclusion
        return (inv.diasDesdeEmision || 0) >= 40 && !inv.linkedPayoutRequestId;
    };

    const parseDate = (dateStr) => {
        if (!dateStr) return 0;
        const [d, m, y] = dateStr.split('/').map(Number);
        return new Date(y, m - 1, d).getTime();
    };

    // 4. Filter & Sort
    const filteredAndSortedInvoices = useMemo(() => {
        let result = normalizedInvoices;

        // Search Filter
        if (filter) {
            const lower = filter.toLowerCase();
            result = result.filter(inv =>
                inv.factura?.toLowerCase().includes(lower) ||
                inv.siniestro?.toLowerCase().includes(lower) ||
                inv.compania?.toLowerCase().includes(lower)
            );
        }

        // Company Filter
        if (companyFilter !== 'ALL') {
            result = result.filter(inv => inv.compania === companyFilter);
        }

        // Sort
        if (sortConfig.key) {
            result = [...result].sort((a, b) => {
                let valA = a[sortConfig.key];
                let valB = b[sortConfig.key];

                if (sortConfig.key === 'fechaEmision') {
                    valA = parseDate(a.fechaEmision);
                    valB = parseDate(b.fechaEmision);
                } else if (sortConfig.key === 'aLiquidar' || sortConfig.key === 'diasDesdeEmision') {
                    valA = Number(valA) || 0;
                    valB = Number(valB) || 0;
                } else {
                    valA = (valA || '').toString().toLowerCase();
                    valB = (valB || '').toString().toLowerCase();
                }

                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [normalizedInvoices, filter, companyFilter, sortConfig]);

    // 5. Derived Selectable Invoices (Visible & Eligible)
    const visibleEligibleInvoices = useMemo(() => {
        return filteredAndSortedInvoices.filter(inv => isEligibleForCashout(inv));
    }, [filteredAndSortedInvoices]);

    const isAllVisibleSelected = visibleEligibleInvoices.length > 0 &&
        visibleEligibleInvoices.every(inv => selectedIds.includes(inv.id));

    // 6. Handlers
    const handleSort = (key) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleCheckbox = (id) => {
        setSelectedIds(prev => {
            const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
            onSelectionChange && onSelectionChange(next);
            return next;
        });
    };

    const handleSelectAll = () => {
        if (visibleEligibleInvoices.length === 0) {
            // Optional: Toast "No hay facturas elegibles"
            return;
        }

        if (isAllVisibleSelected) {
            // Deselect All Visible Eligible
            const idsToRemove = visibleEligibleInvoices.map(i => i.id);
            const next = selectedIds.filter(id => !idsToRemove.includes(id));
            setSelectedIds(next);
            onSelectionChange && onSelectionChange(next);
        } else {
            // Select All Visible Eligible
            // Merge existing selection with visible eligible
            const newIds = visibleEligibleInvoices.map(i => i.id);
            const next = [...new Set([...selectedIds, ...newIds])]; // Dedupe
            setSelectedIds(next);
            onSelectionChange && onSelectionChange(next);
        }
    };

    // 7. Auto-Cleanup Effect (Real-time Safety)
    useEffect(() => {
        // If an invoice in selectedIds becomes ineligible (e.g. state change), remove it.
        // We check against `normalizedInvoices` (full dataset) to be thorough.
        const validSelections = selectedIds.filter(id => {
            const inv = normalizedInvoices.find(i => i.id === id);
            return inv && isEligibleForCashout(inv);
        });

        if (validSelections.length !== selectedIds.length) {
            // console.log("Removed ineligible invoices from selection");
            setSelectedIds(validSelections);
            onSelectionChange && onSelectionChange(validSelections);
        }
    }, [normalizedInvoices, selectedIds]); // Check on every data update

    // Status Badge Render
    const getStatusBadge = (status) => {
        if (status === 'PAGO' || status === 'PAGADO' || status === 'COBRADO') {
            return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">{status}</span>;
        }
        if (['PENDIENTE_APROBACION', 'PENDIENTE', 'EN_SOLICITUD'].includes(status)) {
            return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">PENDIENTE</span>;
        }
        if (['PENDIENTE_FACTURA', 'NEEDS_INVOICE'].includes(status)) {
            return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">FACTURA</span>;
        }
        if (['PENDIENTE_PAGO', 'READY_TO_PAY'].includes(status)) {
            return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">A PAGAR</span>;
        }
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">{status || 'IMPAGO'}</span>;
    };

    // Sort Icon Helper
    const SortIcon = ({ column }) => {
        if (sortConfig.key !== column) return <ArrowUpDown className="ml-1 h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-50" />;
        return sortConfig.direction === 'asc'
            ? <ChevronUp className="ml-1 h-3 w-3 text-blue-600" />
            : <ChevronDown className="ml-1 h-3 w-3 text-blue-600" />;
    };

    const ThSortable = ({ label, column, align = 'left' }) => (
        <th
            className={`px-6 py-3 text-${align} text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer group hover:bg-gray-100 dark:hover:bg-slate-700 select-none`}
            onClick={() => handleSort(column)}
        >
            <div className={`flex items-center ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
                {label}
                <SortIcon column={column} />
            </div>
        </th>
    );

    return (
        <div className="bg-white dark:bg-slate-800 shadow rounded-lg overflow-hidden flex flex-col">
            {/* Toolbar */}
            <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50 dark:bg-slate-800/50">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                        onClick={handleSelectAll}
                        disabled={visibleEligibleInvoices.length === 0}
                        className={`inline-flex items-center px-3 py-2 border text-sm font-medium rounded-md shadow-sm transition-colors
                            ${isAllVisibleSelected
                                ? 'border-red-300 text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800'
                                : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50 dark:bg-slate-700 dark:text-gray-200 dark:border-slate-600'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        {isAllVisibleSelected ? <Square className="mr-2 h-4 w-4" /> : <CheckSquare className="mr-2 h-4 w-4" />}
                        {isAllVisibleSelected ? 'Deseleccionar Todo' : 'Seleccionar Todo'}
                    </button>

                    {/* Select Counter Badge */}
                    {selectedIds.length > 0 && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            {selectedIds.length}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                    {/* Company Filter */}
                    <div className="relative">
                        <select
                            value={companyFilter}
                            onChange={(e) => setCompanyFilter(e.target.value)}
                            className="appearance-none block w-full pl-3 pr-8 py-2 border border-gray-300 rounded-md leading-5 bg-white dark:bg-slate-700 dark:text-white dark:border-slate-600 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="ALL">Todas las Compañías</option>
                            {uniqueCompanies.map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                            <Filter className="h-4 w-4" />
                        </div>
                    </div>

                    {/* Search */}
                    <input
                        type="text"
                        placeholder="Buscar..."
                        className="block w-full sm:w-64 pl-3 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white dark:bg-slate-700 dark:text-white dark:border-slate-600 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                    />
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                    <thead className="bg-gray-50 dark:bg-slate-900">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                                {/* Header Checkbox could go here but button handles bulk */}
                            </th>
                            <ThSortable label="Factura / Orden" column="factura" />
                            <ThSortable label="Siniestro" column="siniestro" />
                            <ThSortable label="Compañía" column="compania" />
                            <ThSortable label="Fecha Emisión" column="fechaEmision" />
                            <ThSortable label="Días" column="diasDesdeEmision" />
                            <ThSortable label="A Liquidar" column="aLiquidar" align="right" />
                            <ThSortable label="Estado" column="estadoPago" align="center" />
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                        {filteredAndSortedInvoices.map((inv) => {
                            const eligible = isEligibleForCashout(inv);
                            const isSelectable = inv.estadoPago === 'IMPAGO' && !inv.linkedPayoutRequestId;

                            return (
                                <tr key={inv.id} className={eligible ? "bg-green-50 dark:bg-green-900/10" : "hover:bg-gray-50 dark:hover:bg-slate-700/50"}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <input
                                            type="checkbox"
                                            disabled={!isSelectable}
                                            checked={selectedIds.includes(inv.id)}
                                            onChange={() => isSelectable && handleCheckbox(inv.id)}
                                            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                        />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                        {inv.factura || '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {inv.siniestro || '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {inv.compania || '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {inv.fechaEmision || '-'}
                                    </td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold ${eligible ? 'text-red-500' : 'text-gray-500'}`}>
                                        {inv.diasDesdeEmision !== null ? inv.diasDesdeEmision : '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white font-mono">
                                        ${inv.aLiquidar.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        {getStatusBadge(inv.estadoPago)}
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredAndSortedInvoices.length === 0 && (
                            <tr>
                                <td colSpan="8" className="px-6 py-8 text-center text-sm text-gray-500">
                                    No se encontraron facturas con los filtros actuales.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AnalystTable;
