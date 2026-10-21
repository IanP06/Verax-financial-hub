import test from 'node:test';
import assert from 'node:assert/strict';
import { extractInvoiceLayout } from '../src/utils/invoiceLayout.js';
import { calculateStagingAmounts, formatStagingMoney, stagingMoneyWidth } from '../src/utils/stagingAmounts.js';

const token = (str, x, y, width = 30) => ({ str, transform: [1, 0, 0, 1, x, y], width });
function facturaC(rows, copy = 'ORIGINAL') {
    const total = rows.reduce((sum, [, amount]) => sum + amount, 0).toFixed(2).replace('.', ',');
    return [token(copy, 250, 800), token('Producto / Servicio', 59, 553, 80),
        token('Cantidad', 239, 553), token('Precio Unit.', 335, 553),
        token('Imp. Bonif.', 440, 553), token('Subtotal', 530, 553),
        ...rows.flatMap(([description, amount], i) => [token(description, 59, 530 - i * 20, 150),
            token(amount.toFixed(2).replace('.', ','), 535, 530 - i * 20, 40)]),
        token('Subtotal: $', 440, 280), token(total, 535, 280, 40),
        token('Importe Otros Tributos: $', 390, 260), token('0,00', 535, 260, 40),
        token('Importe Total: $', 440, 240), token(total, 535, 240, 40)];
}

test('ATM Factura C: summary subtotal is not a second item, including ARCA copies', () => {
    const result = extractInvoiceLayout(['ORIGINAL', 'DUPLICADO', 'TRIPLICADO'].map(copy =>
        facturaC([['GESTION STRO 5353 - 151387', 55000]], copy)));
    assert.equal(result.monto, '55000,00');
    assert.equal(result.siniestro, '5353-151387');
    assert.equal(result.invoiceItems.length, 1);
    assert.equal(result.ahorroTotal, 0);
    assert.deepEqual(result.extractionWarnings, []);
    assert.equal(formatStagingMoney(result.monto), '55.000,00');
});

test('Factura C keeps multiple equal-valued items and savings, excluding only the summary', () => {
    const result = extractInvoiceLayout([facturaC([
        ['GESTION STRO 5353-151387', 55000.25], ['PLUS POR AHORRO', 55000.25]
    ])]);
    assert.equal(result.monto, '110000,50');
    assert.equal(result.invoiceItems.length, 2);
    assert.equal(result.ahorroTotal, 55000.25);
    assert.deepEqual(result.extractionWarnings, []);
});
function page(rows, net, copy = 'ORIGINAL') {
    return [token(copy, 250, 800), token('Producto / Servicio', 59, 553, 80), token('Cantidad', 239, 553), token('Precio Unit.', 335, 553), token('% Bonif', 388, 553, 27), token('Subtotal', 434, 553, 28), token('Alicuota', 484, 557, 27), token('Subtotal c/IVA', 524, 553, 50),
        ...rows.flatMap(([description, amount], i) => [token(description, 57, 530 - i * 20, 150), token('2,00', 265, 530 - i * 20, 16), token('999,00', 350, 530 - i * 20), token('10,00', 398, 530 - i * 20, 16), token(amount, 441, 530 - i * 20, 38), token('21%', 490, 530 - i * 20, 16), token('9999999,99', 536, 530 - i * 20, 40)]),
        token('Importe Neto Gravado: $', 398, 280, 105), token(net, 532, 280, 40), token('IVA 0%: $', 462, 200), token('0,00', 557, 200, 16)];
}

test('5521: net and savings subtotal, ignoring quantity, price and VAT', () => {
    const result = extractInvoiceLayout([page([['GESTION STRO 5521 - 2443178', '60358,00'], ['PLUS POR AHORRO', '833175,00']], '893533,00')]);
    assert.equal(result.monto, '893533,00');
    assert.equal(result.ahorroTotal, 833175);
    assert.equal(result.siniestro, '5521-2443178');
    assert.deepEqual(result.extractionWarnings, []);
});
test('5431: savings-only claim is identified', () => {
    const result = extractInvoiceLayout([page([['PLUS POR AHORRO 5431 - 2410876', '572000,00']], '572000,00')]);
    assert.equal(result.siniestro, '5431-2410876');
    assert.equal(result.ahorroTotal, 572000);
    assert.equal(result.monto, '572000,00');
});
test('multiple savings items sum once across ARCA copies', () => {
    const rows = [['GESTION STRO 1234-9876541', '10,00'], ['PLUS POR AHORRO', '1234567,89'], ['PLUS POR AHORRO', '25,55']];
    const result = extractInvoiceLayout(['ORIGINAL', 'DUPLICADO', 'TRIPLICADO'].map(copy => page(rows, '1234603,44', copy)));
    assert.equal(result.ahorroTotal, 1234593.44);
    assert.equal(result.siniestro, '1234-9876541'); // trailing 1 is real, not quantity
    assert.equal(result.invoiceItems.length, 3);
});
test('geometry restores shuffled extraction order', () => {
    const result = extractInvoiceLayout([page([['PLUS POR AHORRO 5431-2410876', '572000,00']], '572000,00').reverse()]);
    assert.equal(result.ahorroTotal, 572000);
    assert.equal(result.monto, '572000,00');
});
test('wrapped savings description before its numeric row', () => {
    const items = page([['GESTION STRO 5521-2443178', '10,00'], ['', '20,00']], '30,00');
    items.push(token('PLUS POR AHORRO', 57, 518, 100));
    assert.equal(extractInvoiceLayout([items]).ahorroTotal, 20);
});
test('split amount tokens retain every digit and cents', () => {
    const items = page([['PLUS POR AHORRO 5431-2410876', '1234567,89']], '1234567,89');
    const index = items.findIndex(i => i.str === '1234567,89' && i.transform[4] === 441);
    items.splice(index, 1, token('1234', 430, 530, 16), token('567', 446, 530, 12), token(',89', 458, 530, 12));
    assert.equal(extractInvoiceLayout([items]).ahorroTotal, 1234567.89);
});
test('no savings item means zero base, not the invoice amount', () => {
    assert.equal(extractInvoiceLayout([page([['GESTION STRO 5521-2443178', '60358,00']], '60358,00')]).ahorroTotal, 0);
});
test('ambiguous claims and missing amounts require review', () => {
    const result = extractInvoiceLayout([page([['GESTION STRO 5521-2443178', '10,00'], ['PLUS POR AHORRO 5431-2410876', '20,00']], '30,00')]);
    assert.equal(result.siniestro, 'PENDIENTE');
    assert.match(result.extractionWarnings.join(), /varios siniestros/);
    assert.equal(extractInvoiceLayout([[]]).monto, '');
});
test('mismatch is surfaced instead of silently accepting incomplete items', () => {
    assert.match(extractInvoiceLayout([page([['PLUS POR AHORRO 5431-2410876', '10,00']], '20,00')]).extractionWarnings.join(), /no coinciden/);
});
test('net fallback sums pre-VAT subtotals', () => {
    const items = page([['GESTION STRO 5521-2443178', '10,00'], ['PLUS POR AHORRO', '20,25']], '30,25').filter(i => i.transform[5] !== 280);
    assert.equal(extractInvoiceLayout([items]).monto, '30,25');
});
test('staging calculations preserve cents and never treat base as percent', () => {
    assert.deepEqual(calculateStagingAmounts({ montoGestion: 25000, ahorroTotal: 833175, plusPorAhorro: 1, viaticosAPagar: 0 }), { ahorroAPagar: 8331.75, totalAPagarAnalista: 33331.75 });
    assert.equal(calculateStagingAmounts({ ahorroTotal: 833175, plusPorAhorro: 0 }).ahorroAPagar, 0);
});
test('AR/US amounts render all digits and two decimals with expanding width', () => {
    for (const input of ['1234567890,12', '1.234.567.890,12', '1,234,567,890.12', 1234567890.12]) {
        assert.equal(formatStagingMoney(input), '1.234.567.890,12');
    }
    assert.equal(formatStagingMoney('893533,00'), '893.533,00');
    assert.equal(formatStagingMoney(0), '0,00');
    assert.equal(formatStagingMoney(''), '');
    assert.equal(stagingMoneyWidth('1.234.567.890,12'), '19ch');
});
