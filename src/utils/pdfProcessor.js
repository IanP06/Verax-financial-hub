import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc = pdfWorker;

const CUIT_MAP = {
    "30500049460": "SANCOR",
    "30527508165": "PROVINCIA",
    "30699408154": "ATM",
    "30500056661": "AMCA"
};

const EMISOR_MAP = {
    "PERICH IAN FRANCISCO": "IAN",
    "PERICH CESAR HORACIO": "CESAR",
    "DELGADO ADELAIDA GILBERIA": "ADE",
    "PERICH ARIEL DAVID": "ARIEL",
    "MARTINS DO VALE TOMAS": "TOMAS"
};

export const parseInvoicePDF = async (file) => {
    // 1. ESTRATEGIA NOMBRE DE ARCHIVO (Prioridad Alta para Nro Factura)
    // Formato esperado: CUIT_TIPO_PTO_NUMERO.pdf (ej: ..._00000916.pdf)
    let nroFactura = "S/N";
    try {
        const nameParts = file.name.split('_');
        const lastPart = nameParts[nameParts.length - 1]; // 00000916.pdf
        const cleanNum = lastPart.toLowerCase().replace('.pdf', '');
        // Quitar ceros a la izquierda
        nroFactura = String(parseInt(cleanNum, 10));
    } catch (e) {
        console.warn("No se pudo extraer factura del nombre del archivo", e);
    }

    // 2. LECTURA DEL PDF
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocument(arrayBuffer).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map(item => item.str).join('§') + '§';
    }

    const cleanText = fullText.replace(/§/g, ' ').replace(/\s+/g, ' ');

    // 3. Siniestro (Limpieza agresiva)
    const siniestroMatch = cleanText.match(/GESTION\s*STRO.*?(\d{4}\s*-\s*\d+)/i);
    let siniestro = siniestroMatch ? siniestroMatch[1].replace(/\s/g, '') : "PENDIENTE";
    if (siniestro.endsWith("1") && siniestro.length > 9) siniestro = siniestro.slice(0, -1);

    // 4. Aseguradora por CUIT
    let aseguradora = "OTRA";
    const cuitMatches = cleanText.replace(/-/g, '').match(/(30|33)\d{9}/g);
    if (cuitMatches) {
        for (const cuitClean of cuitMatches) {
            if (CUIT_MAP[cuitClean]) {
                aseguradora = CUIT_MAP[cuitClean];
                break;
            }
        }
    }

    // 5. Emisor
    let emisor = "DESCONOCIDO";
    for (const [key, value] of Object.entries(EMISOR_MAP)) {
        if (cleanText.includes(key) || cleanText.includes(key.replace(/ /g, ''))) {
            emisor = value;
            break;
        }
    }

    // 6. Monto
    const montoMatches = cleanText.match(/(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/g);
    let monto = "0.00";
    if (montoMatches) monto = montoMatches[montoMatches.length - 1];

    // 7. Fecha
    const fechaMatch = cleanText.match(/(\d{2}\/\d{2}\/\d{4})/);
    const fecha = fechaMatch ? fechaMatch[1] : new Date().toLocaleDateString();

    return { nroFactura, siniestro, aseguradora, emisor, monto, fecha };
};
