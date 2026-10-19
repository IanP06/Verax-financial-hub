// Read-only local integration check. Pass PDF paths; never contacts Firebase.
import { readFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractInvoiceLayout } from '../src/utils/invoiceLayout.js';
for (const path of process.argv.slice(2)) {
    const pdf = await getDocument({ data: new Uint8Array(await readFile(path)), useSystemFonts: true }).promise;
    try {
        const pages = [];
        for (let i = 1; i <= pdf.numPages; i++) pages.push((await (await pdf.getPage(i)).getTextContent()).items);
        console.log(JSON.stringify({ path, ...extractInvoiceLayout(pages) }, null, 2));
    } finally { await pdf.destroy(); }
}
