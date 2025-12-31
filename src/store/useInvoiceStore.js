import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc, writeBatch, getDoc, query, where } from 'firebase/firestore';

// Helper para parsear fechas DD/MM/AAAA a objeto Date JS
const parseDate = (dateStr) => {
    if (!dateStr) return new Date();
    const [day, month, year] = dateStr.split('/');
    return new Date(year, month - 1, day);
};

// === MIRROR HELPERS ===
// Función para sanear datos y sincronizar con la colección espejo del analista
const syncInvoiceToAnalystMirror = async (invoiceData, invoiceId, analystProfiles) => {
    if (!invoiceData.analyst || !analystProfiles) return;

    // Buscar UID del analista basado en el nombre (analystKey debe coincidir con el nombre guardado en invoice.analyst)
    // invoice.analyst ejemplo: "Ariel"
    // analystProfiles ejemplo: [{ uid: "...", analystKey: "Ariel" }, ...]
    // Normalizamos a mayúsculas para buscar
    const targetAnalyst = analystProfiles.find(p => p.analystKey?.toUpperCase() === invoiceData.analyst.toUpperCase());

    if (!targetAnalyst || !targetAnalyst.uid) {
        console.warn(`[Mirror] No se encontró UID para analista: ${invoiceData.analyst}`);
        return;
    }

    try {
        const mirrorRef = doc(db, `analyst_invoices/${targetAnalyst.uid}/items`, invoiceId);

        // Campos permitidos SOLO para el analista (Sanitized)
        const safeData = {
            invoiceNumber: invoiceData.nroFactura || "S/N",
            claimNumber: invoiceData.nroSiniestro || "S/N",
            insurer: invoiceData.aseguradora || "Desconocida",
            issueDate: invoiceData.fecha || "", // String DD/MM/YYYY
            // totalToLiquidate = gestion + ahorroAPagar + viaticos
            totalToLiquidate: Number(invoiceData.totalAPagarAnalista || 0),
            paymentStatus: invoiceData.estadoPago || "IMPAGO",
            paymentDate: invoiceData.fechaPago || null, // Si ya se pagó
            linkedPayoutRequestId: invoiceData.linkedPayoutRequestId || null,
            updatedAt: new Date().toISOString()
        };

        // Usamos setDoc con merge: true para crear o actualizar
        await setDoc(mirrorRef, safeData, { merge: true });
        console.log(`[Mirror] Sincronizado OK para ${targetAnalyst.uid} (Factura ${invoiceId})`);
    } catch (error) {
        console.error(`[Mirror] Error sincronizando factura ${invoiceId}:`, error);
    }
};

const deleteInvoiceFromAnalystMirror = async (invoiceId, analystName, analystProfiles) => {
    if (!analystName || !analystProfiles) return;
    const targetAnalyst = analystProfiles.find(p => p.analystKey?.toUpperCase() === analystName.toUpperCase());

    if (targetAnalyst?.uid) {
        try {
            await deleteDoc(doc(db, `analyst_invoices/${targetAnalyst.uid}/items`, invoiceId));
            console.log(`[Mirror] Eliminado espejo para ${targetAnalyst.uid} (Factura ${invoiceId})`);
        } catch (error) {
            console.error(`[Mirror] Error eliminando espejo ${invoiceId}:`, error);
        }
    }
};
// ======================

const useInvoiceStore = create(
    persist(
        (set, get) => ({
            stagingInvoices: [],
            invoices: [],
            analysts: ['Ariel', 'Cesar', 'Daniel', 'Emiliano', 'Eugenia y Debora', 'Jazmin', 'Jeremias', 'Natalia', 'Pablo', 'Rodrigo', 'Sofia', 'Tomás'],
            analystProfiles: [], // { uid, analystKey, role... }
            isHydrated: false,
            config: {
                montoGestion: 20000,
                validAseguradoras: [
                    { cuit: '30500049460', nombre: 'SANCOR', dias: 15, tolerancia: 3 },
                    { cuit: '30527508165', nombre: 'PROVINCIA', dias: 7, tolerancia: 3 },
                    { cuit: '30699408154', nombre: 'ATM', dias: 30, tolerancia: 3 },
                    { cuit: '30500056661', nombre: 'AMCA', dias: 30, tolerancia: 3 },
                    { cuit: '30500050310', nombre: 'RIVADAVIA', dias: 30, tolerancia: 3 },
                    { cuit: '30605659981', nombre: 'AMCA', dias: 30, tolerancia: 3 },
                    { cuit: '', nombre: 'OTRA', dias: 30, tolerancia: 3 }
                ],
                validEmisores: [
                    { nombre: 'IAN', cuit: '', alias: ['PERICH IAN FRANCISCO'] },
                    { nombre: 'CESAR', cuit: '', alias: ['PERICH CESAR HORACIO'] },
                    { nombre: 'ADE', cuit: '', alias: ['DELGADO ADELAIDA GILBERIA'] },
                    { nombre: 'ARIEL', cuit: '', alias: ['PERICH ARIEL DAVID'] },
                    { nombre: 'TOMAS', cuit: '', alias: ['MARTINS DO VALE TOMAS'] }
                ]
            },

            // INIT ADMIN: Carga masiva (Solo para ADMIN)
            initAdminData: async () => {
                if (get().isHydrated) return; // Prevent double load
                console.log("[Store] Starting Admin Init...");

                try {
                    // 1. Configurar Settings
                    const settingsRef = doc(db, 'settings', 'global');
                    const rulesRef = collection(db, 'settings/analystRules/rules'); // Assuming structure based on user prompt context "settings/analystRules"
                    // Wait, user said "settings/analystRules (ya existe)". Usually this means a collection or a doc?
                    // "settings/analystRules (ya existe)" -> could be a doc with fields or collection.
                    // Let's assume it's a collection of rules where each doc is an analyst, OR a single doc with a list.
                    // Given the StagingTable code: "config?.analystRules?.find(r => r.name === newAnalyst)" implies an array.
                    // Let's safe fetch: try to get collection docs.
                    // Or maybe it is a doc 'settings/analystRules'?
                    // Let's assume collection 'analystRules' inside 'settings' is NOT standard firestore (collections in docs).
                    // Likely: collection('analystRules') or doc('settings', 'analystRules').
                    // Checking prompt: "Firestore: settings/analystRules (ya existe)".
                    // I will fetch collection('analystRules') if it exists at root, or subcollection?
                    // Let's try to fetch both or assume root collection 'analystRules' or specific doc.
                    // Usage in `StagingTable` implies it expects an array in `config.analystRules`.

                    try {
                        const settingsSnap = await getDoc(settingsRef);
                        const globalConfig = settingsSnap.exists() ? settingsSnap.data() : {};

                        // Fetch Analyst Rules
                        // Try root collection 'analystRules' first or subcollection 'settings/global/analystRules'?
                        // Most likely it is a separate collection 'analystRules' based on typical firebase patterns I've seen in this codebase,
                        // OR it's a field in 'settings/global'?
                        // Prompt says: "settings/analystRules". This usually means path "settings/analystRules".
                        // So text "settings/analystRules" is the Document Reference? Or Collection Reference?
                        // If it's a doc path, it's `doc(db, 'settings', 'analystRules')`.
                        // If it contains rules for many analysts, it might be a Map or Array inside that doc.

                        let rulesArray = [];
                        try {
                            const rulesSnap = await getDoc(doc(db, 'settings', 'analystRules'));
                            if (rulesSnap.exists()) {
                                // If it's a doc with keys as analyst names or a 'rules' field
                                const data = rulesSnap.data();
                                // Assume it might have a 'list' or keys are names.
                                // Let's try to parse: if data has 'rules' array, use it.
                                if (Array.isArray(data.rules)) {
                                    rulesArray = data.rules;
                                } else {
                                    // Map object to array
                                    rulesArray = Object.keys(data).map(key => ({ name: key, ...data[key] }));
                                }
                            }
                        } catch (e) { console.warn("Rules fetch error:", e); }

                        set({
                            config: {
                                ...get().config,
                                ...globalConfig,
                                analystRules: rulesArray
                            }
                        });
                    } catch (err) {
                        console.warn("[Store] Settings load failed:", err);
                    }

                    // 2. Cargar UserProfiles
                    try {
                        const profilesSnap = await getDocs(collection(db, 'userProfiles'));
                        const profiles = profilesSnap.docs.map(d => ({ uid: d.id, ...d.data() }));
                        set({ analystProfiles: profiles });
                    } catch (err) {
                        console.warn("[Store] Profiles load failed:", err);
                    }

                    // 3. Facturas (Main Collection)
                    // This will fail for Analysts if rules deny read
                    const invoicesSnap = await getDocs(collection(db, 'invoices'));
                    const invoicesData = invoicesSnap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                    set({ invoices: invoicesData, isHydrated: true });
                    console.log("[Store] Admin Init Complete.");

                } catch (error) {
                    console.error("[Store] Error inicializando Data Admin:", error);
                    // Don't alert() to avoid annoying users if it's just a permission issue handled by UI
                }
            },

            // INIT ANALYST: Carga específica (Solo lo necesario)
            initAnalystData: async (analystKey) => {
                // Analysts don't need the main large 'invoices' list in this store usually, 
                // as they usage useAnalystStore for their dashboard.
                // However, if some shared component needs it, we can fetch filtered (if allowed)
                // or just skip.
                console.log(`[Store] Init Analyst Data for ${analystKey}`);

                // Try to load minimal settings if possible
                try {
                    const settingsRef = doc(db, 'settings', 'global');
                    const settingsSnap = await getDoc(settingsRef);
                    if (settingsSnap.exists()) {
                        set({ config: { ...get().config, ...settingsSnap.data() } });
                    }
                } catch (e) { console.warn("Analyst cannot read global settings"); }

                set({ isHydrated: true });
            },

            updateConfig: async (newConfig) => {
                set({ config: newConfig });
                try {
                    await setDoc(doc(db, 'settings', 'global'), newConfig);
                } catch (e) {
                    console.error("Error guardando config:", e);
                }
            },

            // Acciones básicas de Staging (Local)
            addStagingInvoice: (inv) => set((state) => {
                const defaults = {
                    montoGestion: state.config.montoGestion || 20000,
                    plusPorAhorro: Number(inv.plusPorAhorro) || 0,
                    ahorroTotal: 0, // NEW field
                    ahorroAPagar: 0,
                    viaticosAPagar: 0,
                    estadoPago: 'IMPAGO',
                    fechaPagoAnalista: null,
                    estadoDeCobro: 'NO COBRADO',
                    analista: inv.analista || '',
                };
                const totalAPagarAnalista = Number(defaults.montoGestion) + Number(defaults.ahorroAPagar) + Number(defaults.viaticosAPagar);
                return {
                    stagingInvoices: [...state.stagingInvoices, { ...inv, ...defaults, totalAPagarAnalista, id: Date.now() }]
                };
            }),
            removeStagingInvoice: (id) => set((state) => ({ stagingInvoices: state.stagingInvoices.filter((i) => i.id !== id) })),
            updateStagingInvoice: (id, field, value) => set((state) => ({
                stagingInvoices: state.stagingInvoices.map((i) => {
                    if (i.id !== id) return i;
                    const updated = { ...i, [field]: value };

                    // Auto-calc Ahorro Amount if Savings Base or Percentage changes
                    if (['montoGestion', 'plusPorAhorro', 'ahorroTotal'].includes(field)) {
                        const savingsBase = Number(updated.ahorroTotal) || 0;
                        const pct = Number(updated.plusPorAhorro) || 0;

                        // New Formula: AhorroAPagar = AhorroTotal * Pct%
                        updated.ahorroAPagar = Math.round(savingsBase * (pct / 100));
                    }

                    // Recalc Total
                    updated.totalAPagarAnalista = Number(updated.montoGestion || 0) + Number(updated.ahorroAPagar || 0) + Number(updated.viaticosAPagar || 0);

                    return updated;
                })
            })),

            // CONFIRM: Mueve de Staging (Local) a Invoices (Firestore)
            confirmInvoice: async (id) => {
                const invoice = get().stagingInvoices.find((i) => i.id === id);
                if (invoice) {
                    const { id: tempId, ...data } = invoice;
                    try {
                        const docRef = await addDoc(collection(db, 'invoices'), data);
                        const newInvoice = { ...data, id: docRef.id };

                        set(state => ({
                            stagingInvoices: state.stagingInvoices.filter(i => i.id !== id),
                            invoices: [...state.invoices, newInvoice]
                        }));

                        // === MIRROR SYNC ===
                        await syncInvoiceToAnalystMirror(newInvoice, newInvoice.id, get().analystProfiles);
                        // ===================

                    } catch (e) {
                        console.error("Error al confirmar factura:", e);
                        alert("Error al guardar en Cloud.");
                    }
                }
            },

            deleteInvoice: async (id) => {
                const invoiceToDelete = get().invoices.find(i => i.id === id);
                try {
                    await deleteDoc(doc(db, 'invoices', id));
                    set((state) => ({ invoices: state.invoices.filter((i) => i.id !== id) }));

                    // === MIRROR SYNC (DELETE) ===
                    if (invoiceToDelete) {
                        await deleteInvoiceFromAnalystMirror(id, invoiceToDelete.analyst, get().analystProfiles);
                    }
                    // ===================

                } catch (e) {
                    console.error("Error borrando factura:", e);
                }
            },

            // --- BULK CHARGE LOGIC (PHASE 2 - FIXES) ---
            previewBulkCobroByEmisor: async ({ emisorName, invoiceNumbers }) => {
                const uniqueNumbers = [...new Set(invoiceNumbers)];
                if (uniqueNumbers.length === 0) return { toCharge: [], alreadyPaid: [], notFound: [], duplicated: [] };

                const toCharge = [];
                const alreadyPaid = [];
                const foundNumbers = new Set();

                try {
                    const invoicesRef = collection(db, 'invoices');
                    const { query, where, getDocs } = await import('firebase/firestore');
                    const q = query(invoicesRef, where("emisor", "==", emisorName));
                    const snapshot = await getDocs(q);

                    snapshot.forEach(doc => {
                        const inv = { ...doc.data(), id: doc.id };
                        const dbNum = String(parseInt(inv.nroFactura, 10));

                        if (uniqueNumbers.includes(dbNum)) {
                            foundNumbers.add(dbNum);
                            if (inv.estadoDeCobro === 'COBRADO') {
                                if (!alreadyPaid.some(x => x.id === inv.id)) alreadyPaid.push(inv);
                            } else {
                                if (!toCharge.some(x => x.id === inv.id)) toCharge.push(inv);
                            }
                        }
                    });

                } catch (error) {
                    console.error("Error previewing bulk charge:", error);
                    return { toCharge: [], alreadyPaid: [], notFound: [], duplicated: [] };
                }

                const notFound = uniqueNumbers.filter(num => !foundNumbers.has(num));
                const duplicated = invoiceNumbers.filter((item, index) => invoiceNumbers.indexOf(item) !== index);

                return { toCharge, alreadyPaid, notFound, duplicated: [...new Set(duplicated)] };
            },

            confirmBulkCobroByEmisor: async ({ docIds, fechaCobro }) => {
                if (!docIds || docIds.length === 0) return { success: false, message: "No ids provided." };

                const batchSize = 500;
                const { writeBatch, doc, Timestamp, serverTimestamp } = await import('firebase/firestore');

                const batches = [];
                let currentBatch = writeBatch(db);
                let count = 0;

                // Robust Date Parsing
                let fechaCobroTimestamp = null;
                try {
                    if (fechaCobro) {
                        if (fechaCobro instanceof Date && !isNaN(fechaCobro)) {
                            fechaCobroTimestamp = Timestamp.fromDate(fechaCobro);
                        } else if (typeof fechaCobro === 'string') {
                            if (fechaCobro.includes('-')) {
                                // Assume YYYY-MM-DD (from input type="date")
                                const [y, m, d] = fechaCobro.split('-');
                                const dateObj = new Date(y, m - 1, d);
                                if (!isNaN(dateObj.getTime())) {
                                    fechaCobroTimestamp = Timestamp.fromDate(dateObj);
                                }
                            } else if (fechaCobro.includes('/')) {
                                // Assume DD/MM/YYYY
                                const [d, m, y] = fechaCobro.split('/');
                                const dateObj = new Date(y, m - 1, d);
                                if (!isNaN(dateObj.getTime())) {
                                    fechaCobroTimestamp = Timestamp.fromDate(dateObj);
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error("Date parse error:", err);
                    // Don't throw, just let it be null or handle gracefully
                }

                if (!fechaCobroTimestamp) {
                    return { success: false, message: "Fecha de cobro inválida o formato desconocido." };
                }

                docIds.forEach(id => {
                    const ref = doc(db, 'invoices', id);
                    currentBatch.update(ref, {
                        estadoDeCobro: 'COBRADO',
                        fechaCobro: fechaCobroTimestamp,
                        cobradoAt: serverTimestamp() // Audit
                    });
                    count++;
                    if (count >= batchSize) {
                        batches.push(currentBatch);
                        currentBatch = writeBatch(db);
                        count = 0;
                    }
                });
                if (count > 0) batches.push(currentBatch);

                try {
                    await Promise.all(batches.map(b => b.commit()));

                    set(state => ({
                        invoices: state.invoices.map(inv => {
                            if (docIds.includes(inv.id)) {
                                return {
                                    ...inv,
                                    estadoDeCobro: 'COBRADO',
                                    fechaCobro: fechaCobroTimestamp // Store assumes raw data or Timestamp, logic must handle
                                };
                            }
                            return inv;
                        })
                    }));
                    return { success: true, count: docIds.length };
                } catch (e) {
                    console.error("Error en batch update:", e);
                    return { success: false, message: e.message };
                }
            },

            // LÓGICA CRÍTICA DE CAMBIO DE ESTADO
            updateInvoiceStatus: async (id, nuevoEstado, fechaPagoReal = null) => {
                const inv = get().invoices.find(i => i.id === id);
                if (!inv) return;

                let updates = { estadoDeCobro: nuevoEstado };
                if (nuevoEstado === 'COBRADO' && fechaPagoReal) {
                    const fechaEmisionObj = parseDate(inv.fecha);
                    const fechaPagoObj = parseDate(fechaPagoReal);
                    const diffTime = Math.abs(fechaPagoObj - fechaEmisionObj);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    updates.fechaPago = fechaPagoReal;
                    updates.diasCobro = diffDays;
                } else if (nuevoEstado === 'NO COBRADO') {
                    updates.fechaPago = null;
                    updates.diasCobro = '-';
                }

                // Optimistic UI
                const updatedInv = { ...inv, ...updates };
                set(state => ({
                    invoices: state.invoices.map(i => i.id === id ? updatedInv : i)
                }));

                try {
                    await updateDoc(doc(db, 'invoices', id), updates);

                    // === MIRROR SYNC ===
                    // Nota: estadoDeCobro cambia, pero NO mapeamos estadoDeCobro a analyst mirror (solo paymentStatus, no collection status)
                    // El user prompt dice: "el analista NO debe poder ver... estado de cobro".
                    // Asi que aqui NO hacemos sync de mirror, porque lo que cambió es info PRIVADA del Admin.
                    // EXCEPTO que actualicemos updatedAt o algo
                    // ===================

                } catch (e) {
                    console.error("Error actualizando estado:", e);
                }
            },

            // Edición General
            updateInvoice: async (id, newValues) => {
                let derivedValues = {};
                const current = get().invoices.find(i => i.id === id);
                let finalUpdates = {};

                if (current) {
                    const merged = { ...current, ...newValues };
                    derivedValues.totalAPagarAnalista = Number(merged.montoGestion || 0) + Number(merged.ahorroAPagar || 0) + Number(merged.viaticosAPagar || 0);
                    finalUpdates = { ...newValues, ...derivedValues };
                } else {
                    finalUpdates = newValues;
                }

                set(state => ({
                    invoices: state.invoices.map(i => i.id === id ? { ...i, ...finalUpdates } : i)
                }));

                try {
                    await updateDoc(doc(db, 'invoices', id), finalUpdates);

                    // === MIRROR SYNC (UPDATE) ===
                    const updatedFull = { ...current, ...finalUpdates };

                    // Check if analyst changed to move the mirror doc
                    if (current && current.analyst !== updatedFull.analyst) {
                        // Delete from old analyst
                        await deleteInvoiceFromAnalystMirror(id, current.analyst, get().analystProfiles);
                        // Create in new analyst
                        await syncInvoiceToAnalystMirror(updatedFull, id, get().analystProfiles);
                    } else {
                        // Just update
                        await syncInvoiceToAnalystMirror(updatedFull, id, get().analystProfiles);
                    }
                    // ===================

                } catch (e) {
                    console.error("Error editando factura:", e);
                }
            },

            addAnalyst: (name) => set((state) => ({ analysts: [...state.analysts, name] })),
            removeAnalyst: (name) => set((state) => ({ analysts: state.analysts.filter(a => a !== name) })),
        }),
        {
            name: 'verax-storage',
            partialize: (state) => ({ stagingInvoices: state.stagingInvoices }),
        }
    )
);

export default useInvoiceStore;
