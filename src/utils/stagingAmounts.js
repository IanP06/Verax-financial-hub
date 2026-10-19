import { toNumberAR } from './money.js';

export const formatStagingMoney = value => value === '' || value == null ? '' : toNumberAR(value).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const stagingMoneyWidth = value => `${Math.max(14, String(value).length + 3)}ch`;
export function calculateStagingAmounts(invoice) {
    const ahorroAPagar = Math.round(toNumberAR(invoice.ahorroTotal) * toNumberAR(invoice.plusPorAhorro)) / 100;
    const totalAPagarAnalista = Math.round((toNumberAR(invoice.montoGestion) + ahorroAPagar + toNumberAR(invoice.viaticosAPagar)) * 100) / 100;
    return { ahorroAPagar, totalAPagarAnalista };
}
