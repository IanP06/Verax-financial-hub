/**
 * Formats a money value safely.
 * Handles strings with commas/dots and prevents NaN.
 * @param {string|number} value 
 * @returns {number} valid number
 */
export const formatMoney = (value) => {
    if (value === undefined || value === null || value === '') return 0;
    if (typeof value === 'number') return value;

    // Remove $ and spaces
    let clean = value.toString().replace(/[$\s]/g, '');

    // Determine punctuation (1.000,00 vs 1,000.00)
    // Heuristic: If comma is after dot, or comma is last separator.
    // Standard Argentine format: 1.000,00
    // Standard US/Code format: 1,000.00 or 1000.00

    // Replace dots with nothing (thousands) and commas with dots (decimal) 
    // IF it looks like AE/EU format (1.234,56)
    if (clean.includes(',') && clean.includes('.')) {
        if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
            // 1.000,00 -> 1000.00
            clean = clean.replace(/\./g, '').replace(',', '.');
        } else {
            // 1,000.00 -> 1000.00
            clean = clean.replace(/,/g, '');
        }
    } else if (clean.includes(',')) {
        // 1000,00 -> 1000.00
        clean = clean.replace(',', '.');
    }

    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
};

/**
 * Calculates days since a given date string (dd/mm/yyyy).
 * @param {string} dateStr 
 * @returns {number|null} days or null if invalid
 */
const calculateDaysSince = (dateStr) => {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;

    const [d, m, y] = parts;
    const issueDate = new Date(y, m - 1, d);
    const today = new Date();
    // Reset time for fair day comparison
    today.setHours(0, 0, 0, 0);
    issueDate.setHours(0, 0, 0, 0);

    const diffTime = today - issueDate; // Can be negative if future
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
};

/**
 * Normalizes an invoice object for the Analyst Portal.
 * Maps legacy fields to a strict schema.
 * @param {object} inv raw invoice document
 * @returns {object} normalized invoice
 */
export const normalizeInvoiceForAnalyst = (inv) => {
    if (!inv) return {};

    // Resolve Fields
    const factura = inv.nroFactura || inv.factura || inv.numeroFactura || inv.nro || '';
    const siniestro = inv.siniestro || '';
    const compania = inv.aseguradora || inv.compania || '';
    const fechaEmision = inv.fecha || inv.fechaEmision || inv.emision || '';
    const fechaInforme = inv.fechaInforme || '';

    // Regla 40 días: Usar fechaInforme si existe, sino fechaEmision
    const dateForCalc = fechaInforme || fechaEmision;
    const diasDesdeEmision = calculateDaysSince(dateForCalc);

    // Resolve Money: totalAPagarAnalista (preferred) -> totalALiquidar -> totalAnalista -> 0
    let rawAmount = inv.totalAPagarAnalista;
    if (rawAmount === undefined || rawAmount === null) rawAmount = inv.totalALiquidar;
    if (rawAmount === undefined || rawAmount === null) rawAmount = inv.totalAnalista;

    const aLiquidar = formatMoney(rawAmount);

    const estadoPago = inv.estadoPago || 'IMPAGO';

    return {
        id: inv.id, // Keep original ID
        factura,
        siniestro,
        compania,
        fechaEmision,
        diasDesdeEmision,
        aLiquidar,
        estadoPago,
        linkedPayoutRequestId: inv.linkedPayoutRequestId // Critical for logic
    };
};
