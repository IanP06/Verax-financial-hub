import admin from 'firebase-admin';
import { readFile } from 'fs/promises';

// CONFIGURATION
const SERVICE_ACCOUNT_PATH = './serviceAccountKey.json';

const parseMoney = (v) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === "number") return v;
    const s = String(v)
        .replace(/\$/g, "")
        .replace(/\s/g, "")
        .replace(/\./g, "")
        .replace(/,/g, ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
};

// Función para generar tokens de búsqueda (Opción B)
const generateSearchTokens = (invoice) => {
    const textToSearch = [
        invoice.emisor || '',
        invoice.nroFactura || '',
        invoice.siniestro || '',
        invoice.aseguradora || '',
        invoice.analista || ''
    ].join(' ').toLowerCase();

    // Split por espacios y remover vacíos/cortos si se desea (acá guardamos todos los trozos útiles)
    const tokens = textToSearch.split(/\s+/).filter(t => t.length > 1);

    // Agregar también el string completo de algunos campos para búsqueda exacta más fácil
    if (invoice.nroFactura) tokens.push(invoice.nroFactura.toLowerCase());
    if (invoice.siniestro) tokens.push(invoice.siniestro.toLowerCase());

    return [...new Set(tokens)]; // unique tokens
};

async function main() {
    console.log("🚀 Starting Invoice Data Migration...");

    try {
        const serviceAccount = JSON.parse(await readFile(new URL(SERVICE_ACCOUNT_PATH, import.meta.url)));
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log(`✅ Firebase Admin Initialized (Project: ${serviceAccount.project_id})`);
    } catch (e) {
        console.error("❌ Error initializing Firebase Admin.", e.message);
        process.exit(1);
    }

    const db = admin.firestore();
    const invoicesRef = db.collection('invoices');
    const snapshot = await invoicesRef.get();

    console.log(`Found ${snapshot.size} invoices to migrate.`);

    let batch = db.batch();
    let batchCount = 0;
    let totalMigrated = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        let needsUpdate = false;
        let updates = {};

        // 1. Campo montoNumber para poder hacer sum() si lo necesitamos (A futuro para KPIs sum aggregation)
        // Y asegurarnos que totalAPagarAnalista sea número.
        const numericMonto = parseMoney(data.monto);
        if (data.montoNumber !== numericMonto) {
            updates.montoNumber = numericMonto;
            needsUpdate = true;
        }

        const numericTotalAPagar = parseMoney(data.totalAPagarAnalista);
        if (data.totalAPagarAnalistaNumber !== numericTotalAPagar) {
            updates.totalAPagarAnalistaNumber = numericTotalAPagar;
            needsUpdate = true;
        }

        // 2. Tokens de búsqueda
        const searchTokens = generateSearchTokens(data);
        updates.searchTokens = searchTokens;
        needsUpdate = true; // Siempre reescribir tokens para asegurar que estén al día

        if (needsUpdate) {
            batch.update(doc.ref, updates);
            batchCount++;
            totalMigrated++;

            if (batchCount === 400) {
                await batch.commit();
                console.log(`Committed batch of 400 updates. Total so far: ${totalMigrated}`);
                batch = db.batch();
                batchCount = 0;
            }
        }
    }

    if (batchCount > 0) {
        await batch.commit();
        console.log(`Committed final batch of ${batchCount} updates.`);
    }

    console.log(`\n✅ Migration Complete. Total migrated: ${totalMigrated}`);
}

main().catch(console.error);
