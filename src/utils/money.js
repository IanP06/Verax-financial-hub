/**
 * Parses any currency string or number into a valid JS number.
 * Handles Argentine format (1.000,00) and US format (1,000.00).
 * Returns 0 if invalid or null/undefined.
 * @param {string|number|null} value 
 * @returns {number}
 */
export const toNumberAR = (value) => {
    if (value === undefined || value === null || value === '') return 0;
    if (typeof value === 'number') return isNaN(value) ? 0 : value;

    // Convert to string and clean
    let clean = value.toString().replace(/[$\s]/g, '').trim();

    // Heuristics for dot/comma usage
    const lastComma = clean.lastIndexOf(',');
    const lastDot = clean.lastIndexOf('.');

    // Case 1: "1.234,56" (Arg/EU Standard) -> Comma is decimal separator
    if (lastComma > lastDot) {
        // Remove dots (thousands), replace comma with dot
        clean = clean.replace(/\./g, '').replace(',', '.');
    }
    // Case 2: "1,234.56" (US Standard) -> Dot is decimal separator
    else if (lastDot > lastComma && lastComma !== -1) {
        // Remove commas (thousands)
        clean = clean.replace(/,/g, '');
    }
    // Case 3: "1234,56" (Simple Decimal Comma)
    else if (lastComma !== -1 && lastDot === -1) {
        clean = clean.replace(',', '.');
    }
    // Case 4: "1.234" (Could be 1234 or 1.234) -> Ambiguous without context.
    // In this domain (money), "1.234" usually means 1234 if no other decimal indicator.
    // However, JS parseFloat treats "1.234" as 1.234. 
    // Given the "AR" context, we assume dots are thousands separators if there are no commas?
    // Let's stick to safe parsing: if strict AR format is expected, removing dots is safer for integers.
    // logic: "20.000" -> 20000.
    else if (lastDot !== -1 && lastComma === -1) {
        // Check if it looks like thousands grouping (e.g. 3 digits after dot)
        const parts = clean.split('.');
        // If "20.000", parts=["20", "000"].
        if (parts.length > 1 && parts[parts.length - 1].length === 3) {
            clean = clean.replace(/\./g, '');
        }
    }

    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
};

/**
 * Calculates the total amount payable to the analyst for a given invoice.
 * Priority: totalAPagarAnalista -> Sum of Components -> 0.
 * @param {object} invoice 
 * @returns {number}
 */
export const getAnalystTotal = (invoice) => {
    if (!invoice) return 0;

    // 1. Try explicit total field
    if (invoice.totalAPagarAnalista !== undefined && invoice.totalAPagarAnalista !== null && invoice.totalAPagarAnalista !== '') {
        return toNumberAR(invoice.totalAPagarAnalista);
    }

    // 2. Try totalALiquidar fallback
    if (invoice.totalALiquidar !== undefined && invoice.totalALiquidar !== null && invoice.totalALiquidar !== '') {
        return toNumberAR(invoice.totalALiquidar);
    }

    // 3. Try Sum of Components (Monto Gestion + Plus Ahorro + Viaticos)
    const mGestion = toNumberAR(invoice.montoGestion);
    const pAhorro = toNumberAR(invoice.plusPorAhorro); // Note: sometimes called plusAhorro or plusPorAhorro
    const viaticos = toNumberAR(invoice.viaticosAPagar); // or viaticos
    const ahorroAPagar = toNumberAR(invoice.ahorroAPagar);

    const sum = mGestion + pAhorro + viaticos + ahorroAPagar;

    return sum > 0 ? sum : 0;
};
