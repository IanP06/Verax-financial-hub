import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { extractInvoiceLayout } from './invoiceLayout.js';
GlobalWorkerOptions.workerSrc = pdfWorker;

// HARDCODED FALLBACKS (Just in case)
const FALLBACK_CUITS = {
    "30500049460": "SANCOR",
    "30527508165": "PROVINCIA",
    "30699408154": "ATM",
    "30500056661": "AMCA",
    "30500050310": "RIVADAVIA",
    "30605659981": "AMCA"
};

const EMISOR_MAP = {
    "PERICH IAN FRANCISCO": "IAN",
    "PERICH CESAR HORACIO": "CESAR",
    "DELGADO ADELAIDA GILBERIA": "ADE",
    "PERICH ARIEL DAVID": "ARIEL",
    "MARTINS DO VALE TOMAS": "TOMAS"
};

const normalizeToken = (str) => {
    if (!str) return '';
    return str.replace(/[^A-Z0-9]/gi, '').toUpperCase();
};

export const parseInvoicePDF = async (file, { companiesSeeds = [], emittersSeeds = [] } = {}) => {
    // 1. ESTRATEGIA NOMBRE DE ARCHIVO
    let nroFactura = "S/N";
    try {
        const nameParts = file.name.split('_');
        const lastPart = nameParts[nameParts.length - 1]; // 00000916.pdf
        const cleanNum = lastPart.toLowerCase().replace('.pdf', '');
        if (/^\d+$/.test(cleanNum)) nroFactura = String(parseInt(cleanNum, 10));
    } catch (e) {
        console.warn("No se pudo extraer factura del nombre del archivo", e);
    }

    // 2. LECTURA DEL PDF
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocument(arrayBuffer).promise;
    let fullText = '';
    const pages = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        pages.push(textContent.items);
        fullText += textContent.items.map(item => item.str).join('§') + '§';
    }

    const cleanText = fullText.replace(/§/g, ' ').replace(/\s+/g, ' ');
    const normalizedText = normalizeToken(cleanText);

    // 3. Siniestro (Limpieza agresiva)
    const extracted = extractInvoiceLayout(pages);

    // 4. Aseguradora (Dynamic Seeds w/ Normalization)
    let aseguradora = "OTRA";

    // Check Dynamic Seeds first
    if (companiesSeeds && companiesSeeds.length > 0) {
        for (const cia of companiesSeeds) {
            if (cia.cuit) {
                const normCuit = normalizeToken(cia.cuit);
                if (normalizedText.includes(normCuit)) {
                    aseguradora = cia.nombre;
                    break;
                }
            }
        }
    }

    // Fallback if not found and still OTRA
    if (aseguradora === "OTRA") {
        const cuitMatches = cleanText.replace(/-/g, '').match(/(30|33)\d{9}/g);
        if (cuitMatches) {
            for (const cuitClean of cuitMatches) {
                if (FALLBACK_CUITS[cuitClean]) {
                    aseguradora = FALLBACK_CUITS[cuitClean];
                    break;
                }
            }
        }
    }

    // 5. Emisor (Dynamic Seeds w/ Normalization)
    let emisor = "DESCONOCIDO";

    // Dynamic matching by Alias
    if (emittersSeeds && emittersSeeds.length > 0) {
        for (const emp of emittersSeeds) {
            if (emp.alias && Array.isArray(emp.alias)) {
                for (const alias of emp.alias) {
                    const normAlias = normalizeToken(alias);
                    if (normalizedText.includes(normAlias)) {
                        emisor = emp.nombre;
                        break;
                    }
                }
            }
            if (emisor !== "DESCONOCIDO") break;
        }
    }

    // Fallback Emisor
    if (emisor === "DESCONOCIDO") {
        for (const [key, value] of Object.entries(EMISOR_MAP)) {
            const normKey = normalizeToken(key);
            if (normalizedText.includes(normKey)) {
                emisor = value;
                break;
            }
        }
    }

    // 6. Monto

    // 7. Fecha
    const fechaMatch = cleanText.match(/(\d{2}\/\d{2}\/\d{4})/);
    const fecha = fechaMatch ? fechaMatch[1] : new Date().toLocaleDateString();

    // 8. PLUS POR AHORRO
    // The savings amount is a base, never the analyst's percentage.
    await pdf.destroy();
    return { nroFactura, aseguradora, emisor, fecha, plusPorAhorro: 0, ...extracted };
};
