import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { pathToFileURL } from 'node:url';

export async function seedLocalLab() {
    for (const [key, value] of Object.entries({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8085', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' })) {
        if (process.env[key] && process.env[key] !== value) throw new Error('Solo se admite el emulador local.');
        process.env[key] = value;
    }
    const app = initializeApp({ projectId: 'demo-verax-lab' }, `seed-${Date.now()}`);
    const auth = getAuth(app), db = getFirestore(app);
    const password = 'Verax-Lab-2026!'; // Fictional accounts, accepted only by the local Auth emulator.
    try {
        for (const [uid, role, name] of [['lab-admin','admin','Admin de laboratorio'],['lab-analyst','analyst','ANALISTA LAB'],['lab-other','analyst','OTRO LAB']]) {
            try { await auth.getUser(uid); }
            catch (error) { if (error.code !== 'auth/user-not-found') throw error; await auth.createUser({ uid, email: `${uid}@verax.test`, password }); }
            await db.doc(`userProfiles/${uid}`).set({ role, displayName: name, analystKey: name, isActive: true });
        }
        const batch = db.batch();
        for (let i = 1; i <= 20; i++) {
            const id = `lab-case-${String(i).padStart(3, '0')}`;
            if ((await db.doc(`invoices/${id}`).get()).exists) continue;
            const invoice = { analista: 'ANALISTA LAB', fechaEmision: '01/01/2025', nroFactura: `LAB-${i}`, siniestro: `LAB-2025-${i}`, aseguradora: 'ASEGURADORA FICTICIA', totalAPagarAnalista: 25000.25, montoGestion: 25000.25, estadoPago: 'IMPAGO', paymentStatus: 'IMPAGO', estadoDeCobro: 'COBRADO' };
            batch.set(db.doc(`invoices/${id}`), invoice);
            batch.set(db.doc(`analyst_invoices/lab-analyst/items/${id}`), invoice);
        }
        await batch.commit();
        console.log('Laboratorio: 20 casos ficticios. Admin: lab-admin@verax.test · Analista: lab-analyst@verax.test · Clave local: Verax-Lab-2026!');
    } finally { await db.terminate(); await deleteApp(app); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await seedLocalLab();
