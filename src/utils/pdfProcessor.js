import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
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

// --- OCR HELPERS ---

export const extractInvoiceNumber = (fileName, text) => {
    let nroFactura = "S/N";
    
    // 1. Trying to extract from filename (legacy behavior + AFIP format fix)
    try {
        if (fileName) {
            const nameParts = fileName.split('_');
            const lastPart = nameParts[nameParts.length - 1]; // e.g. 00000916.pdf or 00003-00001167.pdf
            const cleanNumStr = lastPart.toLowerCase().replace('.pdf', '');
            
            // Handle AFIP format: 00003-00001167 -> 1167
            if (cleanNumStr.includes('-')) {
                const parts = cleanNumStr.split('-');
                nroFactura = String(parseInt(parts[1], 10));
            } else {
                nroFactura = String(parseInt(cleanNumStr, 10));
            }
            
            if (!isNaN(nroFactura) && nroFactura !== "NaN") {
                return nroFactura;
            } else {
                nroFactura = "S/N";
            }
        }
    } catch (e) {
        console.warn("No se pudo extraer factura del nombre del archivo", e);
    }
    
    // 2. Fallback to extracting from text could go here if needed in the future
    return nroFactura;
};

export const extractNetAmount = (cleanText) => {
    let monto = "0.00";
    let amountSource = "None";

    // Helper to clean and parse generic Argentine amount formats (e.g. 40000,00 -> 40000)
    const parseAmountRegex = (regex) => {
        const matches = cleanText.match(regex);
        if (matches) {
            // Find the last valid amount that is not 0.00 or 0,00
            for (let i = matches.length - 1; i >= 0; i--) {
                const val = matches[i].replace(/[A-Za-z:\s]/g, '').trim();
                const num = parseFloat(val.replace(/\./g, '').replace(',', '.'));
                if (!isNaN(num) && num > 0) {
                    return val;
                }
            }
        }
        return null;
    };

    // 1. Target "Importe Neto Gravado" directly
    const netoGravadoMatch = parseAmountRegex(/Importe\s+Neto\s+Gravado.*?(\d+(?:[.,]\d{3})*[.,]\d{2})/ig);
    if (netoGravadoMatch) {
       monto = netoGravadoMatch;
       amountSource = "Neto Gravado";
    } else {
        // 2. Target "Subtotal" directly
        const subtotalMatch = parseAmountRegex(/Subtotal.*?(\d+(?:[.,]\d{3})*[.,]\d{2})/ig);
        if (subtotalMatch) {
            monto = subtotalMatch;
            amountSource = "Subtotal";
        } else {
            // 3. Target "Importe Total" directly
            const totalMatch = parseAmountRegex(/Importe\s+Total.*?(\d+(?:[.,]\d{3})*[.,]\d{2})/ig);
            if (totalMatch) {
                monto = totalMatch;
                amountSource = "Importe Total";
            } else {
                 // 4. Ultimate fallback: just pick the last non-zero money amount in the document
                 const genericMatches = cleanText.match(/(\d+(?:[.,]\d{3})*[.,]\d{2})/g);
                 if (genericMatches) {
                     for (let i = genericMatches.length - 1; i >= 0; i--) {
                         const num = parseFloat(genericMatches[i].replace(/\./g, '').replace(',', '.'));
                         if (!isNaN(num) && num > 0) {
                             monto = genericMatches[i];
                             amountSource = "Generic Match";
                             break;
                         }
                     }
                 }
            }
        }
    }

    return { monto, amountSource };
};

export const extractPrimaryConcept = (cleanText) => {
    let rawConcept = "PENDIENTE";
    let isGestionStro = false;
    let isAhorroStro = false;

    // 1. Look for PLUS POR AHORRO STRO
    const ahorroMatch = cleanText.match(/PLUS\s+POR\s+AHORRO.*?STRO\s*(\d+)\s*-\s*(\d+)/i);
    if (ahorroMatch) {
        rawConcept = ahorroMatch[0].trim();
        isAhorroStro = true;
        return { rawConcept, isGestionStro, isAhorroStro, siniestroParts: [ahorroMatch[1], ahorroMatch[2]] };
    }

    // 2. Look for GESTION STRO
    const gestionMatch = cleanText.match(/GESTION\s*STRO.*?(\d+)\s*-\s*(\d+)/i);
    // Be careful not to match dates accidentally. The \d+ - \d+ makes it safe enough.
    if (gestionMatch) {
        rawConcept = gestionMatch[0].trim();
        isGestionStro = true;
        return { rawConcept, isGestionStro, isAhorroStro, siniestroParts: [gestionMatch[1], gestionMatch[2]] };
    }
    
    // Fallback logic for siniestro
    const legacySiniestroMatch = cleanText.match(/GESTION\s*STRO.*?(\d{4}\s*-\s*\d+)/i);
    if (legacySiniestroMatch) {
        rawConcept = legacySiniestroMatch[0].trim();
        isGestionStro = true;
        // Parse parts manually
        const parts = legacySiniestroMatch[1].split('-');
        if(parts.length >= 2) {
             return { rawConcept, isGestionStro, isAhorroStro, siniestroParts: [parts[0].trim(), parts[1].trim()] };
        }
    }

    return { rawConcept, isGestionStro, isAhorroStro, siniestroParts: null };
};

export const normalizeBusinessConcept = (primaryConceptData) => {
    const { rawConcept, isGestionStro, isAhorroStro, siniestroParts } = primaryConceptData;

    if (rawConcept === "PENDIENTE") {
        return rawConcept;
    }

    if (isAhorroStro && siniestroParts) {
         // "PLUS POR AHORRO STRO 3819 - 2432831" -> "AHORRO 3819-2432831"
        return `AHORRO ${siniestroParts[0]}-${siniestroParts[1]}`;
    }

    if (isGestionStro && siniestroParts) {
        // "GESTION STRO 3876 - 130021" -> "3876-130021"
         return `${siniestroParts[0]}-${siniestroParts[1]}`;
    }

    return rawConcept || "PENDIENTE";
};

// -------------------

export const parseInvoicePDF = async (file, { companiesSeeds = [], emittersSeeds = [] } = {}) => {
    // 1. ESTRATEGIA NOMBRE DE ARCHIVO
    let nroFactura = extractInvoiceNumber(file?.name || "", "");

    // 2. LECTURA DEL PDF
    let arrayBuffer;
    let fullText = '';
    
    // For test environments, file might be a mock object without arrayBuffer
    if (file && typeof file.arrayBuffer === 'function') {
        arrayBuffer = await file.arrayBuffer();
        const pdf = await getDocument(arrayBuffer).promise;
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map(item => item.str).join('§') + '§';
        }
    } else if (file && file.mockText) {
        fullText = file.mockText;
    }

    const cleanText = fullText.replace(/§/g, ' ').replace(/\s+/g, ' ');
    const normalizedText = normalizeToken(cleanText);

    // 3. Siniestro / Concepto (Logic replaced by helpers)
    const primaryConceptData = extractPrimaryConcept(cleanText);
    const siniestro = normalizeBusinessConcept(primaryConceptData);

    // Temp Dev Logs
    if (import.meta.env?.DEV || process.env.NODE_ENV !== 'production') {
        console.log("[OCR] extracted invoice number:", nroFactura);
        console.log("[OCR] extracted raw concept:", primaryConceptData.rawConcept);
        console.log("[OCR] normalized concept:", siniestro);
    }

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
    const { monto, amountSource } = extractNetAmount(cleanText);
    
    if (import.meta.env?.DEV || process.env.NODE_ENV !== 'production') {
        console.log("[OCR] extracted net amount:", monto);
        console.log("[OCR] amount source used:", amountSource);
    }

    // 7. Fecha
    const fechaMatch = cleanText.match(/(\d{2}\/\d{2}\/\d{4})/);
    const fecha = fechaMatch ? fechaMatch[1] : new Date().toLocaleDateString();

    // 8. PLUS POR AHORRO
    let plusPorAhorro = 0;
    const plusMatch = cleanText.match(/PLUS POR AHORRO.*?(\d+(?:[.,]\d{3})*[.,]\d{2})/i);
    // Legacy mapping variable for plusPorAhorro, could be extracted but keeping exact logic
    if (plusMatch) {
         let rawPlus = plusMatch[1];
        let normalized = rawPlus.replace(/\./g, '').replace(',', '.');
        plusPorAhorro = parseFloat(normalized) || 0;
    }

    return { nroFactura, siniestro, aseguradora, emisor, monto, fecha, plusPorAhorro };
};
