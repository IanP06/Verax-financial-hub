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

// --- DETERMINISTIC OCR HELPERS ---

export const extractInvoiceNumberFromHeader = (text) => {
    let nroFactura = "S/N";
    
    // Look for exact AFIP header: "Comp. Nro: 00001177" or "Comp. Nro:00001177"
    const match = text.match(/Comp\.\s*Nro:?\s*(\d+)/i);
    if (match && match[1]) {
        // Apply existing significant figures logic
        nroFactura = String(parseInt(match[1], 10));
    }
    
    return nroFactura;
};

export const extractReceiverCompany = (text, companiesSeeds = []) => {
    const normalizedText = normalizeToken(text);
    
    // Exact seed matching for Receptor Razon Social
    if (companiesSeeds && companiesSeeds.length > 0) {
        for (const cia of companiesSeeds) {
            if (cia.cuit) {
                // If it's in the text and specifically the CUIT matches, we can be very sure
                const normCuit = normalizeToken(cia.cuit);
                if (normalizedText.includes(normCuit)) {
                    return cia.nombre;
                }
            }
        }
    }

    // Direct String matches based on common receptor names in text
    // E.g. "ATM COMPAÑIA DE SEGUROS S.A."
    if (text.match(/ATM\s+COMPAÑIA\s+DE\s+SEGUROS/i)) return "ATM";
    if (text.match(/PROVINCIA\s+SEGUROS/i)) return "PROVINCIA";
    if (text.match(/SANCOR\s+COOPERATIVA/i)) return "SANCOR";
    if (text.match(/ASOCIACION\s+MUTUAL\s+CONDUCTORES\s+DE\s+AUTOMOTORES/i)) return "AMCA"; // Example Expansion
    
    // Fallback CUIT matching
    const cuitMatches = text.replace(/-/g, '').match(/(30|33)\d{9}/g);
    if (cuitMatches) {
        for (const cuitClean of cuitMatches) {
            if (FALLBACK_CUITS[cuitClean]) {
                return FALLBACK_CUITS[cuitClean];
            }
        }
    }
    
    return "OTRA";
};

export const extractIssuerIdentity = (text, emittersSeeds = []) => {
    const normalizedText = normalizeToken(text);
    
    if (emittersSeeds && emittersSeeds.length > 0) {
        for (const emp of emittersSeeds) {
            if (emp.alias && Array.isArray(emp.alias)) {
                for (const alias of emp.alias) {
                    const normAlias = normalizeToken(alias);
                    if (normalizedText.includes(normAlias)) {
                        return emp.nombre;
                    }
                }
            }
        }
    }
    
    for (const [key, value] of Object.entries(EMISOR_MAP)) {
        const normKey = normalizeToken(key);
        // Look for exact names or CUITs if they become available
        if (normalizedText.includes(normKey)) {
            return value;
        }
    }
    
    return "DESCONOCIDO";
};

export const extractLineItems = (text) => {
    // Attempt to isolate the "Código Producto / Servicio" detail table body
    // Often starts around "Detalle" or "Producto" and ends before "Subtotal" or "Importe"
    // To be robust across Factura A and C, we will collect lines that look like concepts
    
    const items = [];
    
    // Extract any line containing STRO patterns as they represent items in Verax context
    // This is safer than splitting by newline because PDF text streams are messy strings.
    const itemRegex = /(?:GESTION\s*STRO|PLUS\s+POR\s+AHORRO\s+STRO).*?(?:\d+(?:[.,]\d{3})*[.,]\d{2})/ig;
    let match;
    while ((match = itemRegex.exec(text)) !== null) {
        items.push(match[0]);
    }
    
    // If no explicit amount ended the line, just grab the descriptions
    if (items.length === 0) {
        const descRegex = /(?:GESTION\s*STRO\s*\d+\s*-\s*\d+|PLUS\s+POR\s+AHORRO\s+STRO\s*\d+\s*-\s*\d+)/ig;
        let match2;
        while ((match2 = descRegex.exec(text)) !== null) {
            items.push(match2[0]);
        }
    }
    
    return items;
};

export const extractBusinessConceptFromLineItems = (items) => {
    let conceptStr = "PENDIENTE";
    const foundSiniestros = new Set();
    
    for (const item of items) {
        // Check Ahorro
        const ahorroMatch = item.match(/PLUS\s+POR\s+AHORRO.*?STRO\s*(\d+)\s*-\s*(\d+)/i);
        if (ahorroMatch) {
            foundSiniestros.add(`AHORRO ${ahorroMatch[1]}-${ahorroMatch[2]}`);
            continue;
        }
        
        // Check Gestion
        const gestionMatch = item.match(/GESTION\s*STRO.*?(\d+)\s*-\s*(\d+)/i);
        if (gestionMatch) {
            foundSiniestros.add(`${gestionMatch[1]}-${gestionMatch[2]}`);
            continue;
        }
    }
    
    const arrSiniestros = Array.from(foundSiniestros);
    
    if (arrSiniestros.length === 1) {
        conceptStr = arrSiniestros[0];
    } else if (arrSiniestros.length > 1) {
        conceptStr = arrSiniestros.join(' / '); // Multiple items warning
    }
    
    return conceptStr;
};

export const extractStructuredAmount = (text, items, isFacturaC) => {
    let monto = "0.00";
    let amountSource = "None";
    
    const parseSingleAmount = (valStr) => {
        if (!valStr) return null;
        const valClean = valStr.replace(/[A-Za-z:\s]/g, '').trim();
        const num = parseFloat(valClean.replace(/\./g, '').replace(',', '.'));
        // Validations: must be > 0, standard amount 
        // Rough sanity check against CUIT scale or Siniestro IDs
        if (!isNaN(num) && num > 0 && num < 1000000000) {
            return valClean;
        }
        return null;
    };

    // Helper: Find all amounts associated with a keyword
    const findAmountsForLabel = (regexStr) => {
        const regex = new RegExp(regexStr, 'ig');
        let match;
        const results = [];
        while ((match = regex.exec(text)) !== null) {
            if (match[1]) results.push(match[1]);
        }
        // Return the last one found (usually the final total table is at the bottom)
        return results.length > 0 ? parseSingleAmount(results[results.length - 1]) : null;
    };

    // PRIORIDAD A: Importe Neto Gravado (Usually Factura A)
    const netoGravado = findAmountsForLabel(`Importe\\s+Neto\\s+Gravado\\s*(?::|\\$)?\\s*(\\d+(?:[.,]\\d{3})*[.,]\\d{2})`);
    
    // Subtotal Comprobante
    let subtotal = findAmountsForLabel(`Subtotal\\s*(?::|\\$)?\\s*(\\d+(?:[.,]\\d{3})*[.,]\\d{2})`);
    
    // Importe Total Comprobante
    const importeTotal = findAmountsForLabel(`Importe\\s+Total\\s*(?::|\\$)?\\s*(\\d+(?:[.,]\\d{3})*[.,]\\d{2})`);
    
    // Item Subtotal (if Factura C has exactly 1 item)
    let itemSubtotal = null;
    if (items && items.length === 1) {
        const itemAmountMatch = items[0].match(/(\d+(?:[.,]\d{3})*[.,]\d{2})/);
        if (itemAmountMatch) itemSubtotal = parseSingleAmount(itemAmountMatch[1]);
    }
    
    // Execute Priority Logic
    if (netoGravado) {
        monto = netoGravado;
        amountSource = "NETO_GRAVADO";
    } else if (isFacturaC && items.length === 1 && (itemSubtotal || subtotal)) {
        monto = itemSubtotal || subtotal;
        amountSource = itemSubtotal ? "LINE_SUBTOTAL" : "SUBTOTAL";
    } else if (subtotal && importeTotal && subtotal === importeTotal) {
        monto = subtotal;
        amountSource = "SUBTOTAL_EQUALS_TOTAL";
    } else if (subtotal) {
        // Fallback to subtotal if nothing else matches cleanly
        monto = subtotal;
        amountSource = "SUBTOTAL";
    }

    return { monto, amountSource };
};

// -------------------

export const parseInvoicePDF = async (file, { companiesSeeds = [], emittersSeeds = [] } = {}) => {
    // 1. LECTURA DEL PDF
    let arrayBuffer;
    let fullText = '';
    
    // For test environments, file might be a mock object without arrayBuffer
    if (file && typeof file.arrayBuffer === 'function') {
        arrayBuffer = await file.arrayBuffer();
        const pdf = await getDocument(arrayBuffer).promise;
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            // Retain some newline separation for structural parsing instead of pure flat strings
            fullText += textContent.items.map(item => item.str).join(' ') + '\n';
        }
    } else if (file && file.mockText) {
        fullText = file.mockText;
    }

    // Compress multiple spaces but keep some structure
    const cleanText = fullText.replace(/\s{2,}/g, ' ');

    // 0. Detect Invoice Type (A or C)
    const isFacturaC = cleanText.match(/FACTURA\s+C/i) !== null || cleanText.match(/COD\.\s*011/i) !== null;

    // 1. HEADER (Invoice Number)
    let nroFactura = extractInvoiceNumberFromHeader(cleanText);
    
    // Fallback exactly to filename strategy only if header fails
    if (nroFactura === "S/N" || isNaN(parseInt(nroFactura))) {
        try {
            if (file?.name) {
                const nameParts = file.name.split('_');
                const cleanNumStr = nameParts[nameParts.length - 1].toLowerCase().replace('.pdf', '');
                if (cleanNumStr.includes('-')) {
                    nroFactura = String(parseInt(cleanNumStr.split('-')[1], 10));
                } else {
                    nroFactura = String(parseInt(cleanNumStr, 10));
                }
            }
        } catch (e) {
             console.warn("Fallback filename parse failed", e);
        }
    }

    // 2. IDENTITIES (Aseguradora & Emisor)
    const aseguradora = extractReceiverCompany(cleanText, companiesSeeds);
    const emisor = extractIssuerIdentity(cleanText, emittersSeeds);

    // 3. TABLE BODY (Line Items)
    const lineItems = extractLineItems(cleanText);
    const siniestro = extractBusinessConceptFromLineItems(lineItems);
    
    // 4. AMOUNTS (Structured based on items and type)
    const { monto, amountSource } = extractStructuredAmount(cleanText, lineItems, isFacturaC);

    // Temp Dev Logs
    if (import.meta.env?.DEV || process.env.NODE_ENV !== 'production') {
        console.log("[OCR] invoiceNumber:", nroFactura);
        console.log("[OCR] issuer:", emisor);
        console.log("[OCR] receiverCompany:", aseguradora);
        console.log("[OCR] raw lineItems:", lineItems);
        console.log("[OCR] businessConcept:", siniestro);
        console.log(`[OCR] amount source: ${amountSource} -> ${monto}`);
        console.log("[OCR] final parsed payload:", { nroFactura, aseguradora, emisor, siniestro, monto });
    }

    // 5. OTHER FIELDS (Dates/Tokens)
    const fechaMatch = cleanText.match(/(\d{2}\/\d{2}\/\d{4})/);
    const fecha = fechaMatch ? fechaMatch[1] : new Date().toLocaleDateString();

    // 6. PLUS POR AHORRO specifically for backwards compatibility mapping
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
