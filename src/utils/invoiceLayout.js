import { toNumberAR } from './money.js';

const plain = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const money = text => /^\s*\$?\s*-?\d[\d.,]*\s*$/.test(text) ? toNumberAR(text) : null;
const sum = values => values.reduce((total, value) => total + Math.round(value * 100), 0) / 100;

// PDF content order is not reading order. Keep columns and decimal fragments together.
export function layoutLines(items) {
    const lines = [];
    for (const item of items.filter(i => i.str?.trim()).sort((a, b) => b.transform[5] - a.transform[5])) {
        const y = item.transform[5];
        let line = lines.find(l => Math.abs(l.y - y) < 2.5);
        if (!line) lines.push(line = { y, items: [] });
        line.items.push({ text: item.str, x: item.transform[4], width: item.width || 0 });
    }
    return lines.map(line => {
        line.items.sort((a, b) => a.x - b.x);
        return { ...line, text: line.items.map(i => i.text).join(' ') };
    });
}

function cellText(items) {
    return items.map((item, index) => {
        const previous = items[index - 1];
        return (previous && item.x - previous.x - previous.width > 2 ? ' ' : '') + item.text;
    }).join('').trim();
}

export function extractInvoiceLayout(pages) {
    // ARCA PDFs contain ORIGINAL, DUPLICADO and TRIPLICADO: never sum the copies.
    const originals = pages.filter(items => !items.some(i => /^(DUPLICADO|TRIPLICADO)$/i.test(i.str?.trim())));
    const selectedPages = originals.length ? originals : [pages[0] || []];
    const allLines = selectedPages.map(layoutLines);
    const warnings = [];
    const items = [];
    const netAmounts = [];
    const totalAmounts = [];
    for (const lines of allLines) {
        const labelledAmount = (line, label) => {
            const match = plain(line.text).match(label);
            return match ? money(line.text.slice(match.index + match[0].length).replace(/\s/g, '')) : null;
        };
        for (const line of lines) {
            const net = labelledAmount(line, /IMPORTE\s+NETO\s+GRAVADO\s*:?\s*\$?/);
            if (net !== null) netAmounts.push(net);
            const total = labelledAmount(line, /IMPORTE\s+TOTAL\s*:?\s*\$?/);
            if (total !== null) totalAmounts.push(total);
        }
        const headerIndex = lines.findIndex(l => /PRODUCTO\s*\/\s*SERVICIO/i.test(l.text) && /CANTIDAD/i.test(l.text));
        if (headerIndex < 0) continue;
        const header = lines[headerIndex];
        const subtotal = header.items.find(i => /^Subtotal$/i.test(i.text.trim()));
        const quantity = header.items.find(i => /^Cantidad$/i.test(i.text.trim()));
        if (!subtotal || !quantity) continue;
        const center = item => item.x + item.width / 2;
        const index = header.items.indexOf(subtotal);
        const left = (center(header.items[index - 1]) + center(subtotal)) / 2;
        // IVA's heading can be split over two baselines; find its column across nearby lines.
        const next = lines.filter(l => Math.abs(l.y - header.y) < 10).flatMap(l => l.items)
            .filter(i => i.x > subtotal.x + subtotal.width).sort((a, b) => a.x - b.x)[0];
        const right = next ? (center(subtotal) + center(next)) / 2 : Infinity;
        let pending = '';
        let previous = null;
        for (const line of lines.slice(headerIndex + 1)) {
            // Factura C closes the item table with a document-level Subtotal.
            // Its amount shares the last item column but is not another item.
            if (/^SUBTOTAL\s*(?::|\$)/.test(plain(line.text).trim())) break;
            if (/IMPORTE|CAE|COMPROBANTE AUTORIZADO|ESTUDIO VERAX|PAG\./.test(plain(line.text))) break;
            const description = line.items.filter(i => i.x >= header.items.find(i => /Producto/i.test(i.text)).x - 3 && i.x < quantity.x - 5).map(i => i.text).join(' ');
            const cell = line.items.filter(i => center(i) >= left && center(i) < right);
            const subtotalValue = money(cellText(cell));
            if (subtotalValue !== null) {
                previous = { description: [pending, description].filter(Boolean).join(' '), subtotal: subtotalValue };
                items.push(previous);
                pending = '';
            } else if (description) {
                if (pending || /^(GESTION|PLUS|AHORRO|VIATIC)/.test(plain(description)) || !previous) pending += ' ' + description;
                else previous.description += ' ' + description;
            }
        }
    }
    const savings = items.filter(i => /\b(?:PLUS\s+POR\s+)?AHORRO\b/.test(plain(i.description)));
    const descriptionText = items.map(i => i.description).join('\n');
    const claims = [...new Set([...descriptionText.matchAll(/\b(\d{3,6})\s*[-–—]\s*(\d{4,12})\b/g)].map(m => `${m[1]}-${m[2]}`))];
    if (claims.length !== 1) warnings.push(claims.length ? 'Hay varios siniestros: revisar la asignación.' : 'No se pudo identificar el siniestro.');
    let net = netAmounts.at(-1);
    if (net === undefined && items.length) net = sum(items.map(i => i.subtotal));
    // Non-itemized invoices without VAT (e.g. Factura C).
    if (net === undefined && !allLines.flat().some(l => /^IVA\s*\d/i.test(l.text))) net = totalAmounts.at(-1);
    if (net === undefined) warnings.push('No se pudo identificar el importe neto. Revisar el PDF.');
    if (net !== undefined && items.length && Math.abs(net - sum(items.map(i => i.subtotal))) > 0.01) warnings.push('Los subtotales no coinciden con el neto: revisar los ítems.');
    const text = allLines.flat().map(l => l.text).join('\n');
    if (/PLUS\s+POR\s+AHORRO/i.test(text) && !savings.length) warnings.push('No se pudo identificar el subtotal del ahorro.');
    return { monto: net === undefined ? '' : net.toFixed(2).replace('.', ','), ahorroTotal: sum(savings.map(i => i.subtotal)), siniestro: claims.length === 1 ? claims[0] : 'PENDIENTE', invoiceItems: items, extractionWarnings: warnings };
}
