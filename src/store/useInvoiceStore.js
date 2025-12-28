import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc, writeBatch, getDoc } from 'firebase/firestore';

// Helper para parsear fechas DD/MM/AAAA a objeto Date JS
const parseDate = (dateStr) => {
    if (!dateStr) return new Date();
    const [day, month, year] = dateStr.split('/');
    return new Date(year, month - 1, day);
};

const useInvoiceStore = create(
    persist(
        (set, get) => ({
            stagingInvoices: [],
            invoices: [],
            analysts: ['Ariel', 'Cesar', 'Daniel', 'Emiliano', 'Eugenia y Debora', 'Jazmin', 'Jeremias', 'Natalia', 'Pablo', 'Rodrigo', 'Sofia', 'Tomás'],
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

            // INIT: Carga inicial desde Firestore
            initFromFirestore: async () => {
                if (get().isHydrated) return;
                try {
                    // 1. Configurar
                    const settingsRef = doc(db, 'settings', 'global');
                    const settingsSnap = await getDoc(settingsRef);
                    if (settingsSnap.exists()) {
                        set({ config: { ...get().config, ...settingsSnap.data() } });
                    } else {
                        // Si no existe, crear con defaults (Seed inicial)
                        await setDoc(settingsRef, get().config);
                    }

                    // 2. Facturas
                    const invoicesSnap = await getDocs(collection(db, 'invoices'));
                    const invoicesData = invoicesSnap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                    set({ invoices: invoicesData, isHydrated: true });

                } catch (error) {
                    console.error("Error inicializando Firestore:", error);
                    alert("Error de conexión con la base de datos.");
                }
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
                    if (['montoGestion', 'ahorroAPagar', 'viaticosAPagar', 'plusPorAhorro'].includes(field)) {
                        updated.totalAPagarAnalista = Number(updated.montoGestion || 0) + Number(updated.ahorroAPagar || 0) + Number(updated.viaticosAPagar || 0);
                    }
                    return updated;
                })
            })),

            // CONFIRM: Mueve de Staging (Local) a Invoices (Firestore)
            confirmInvoice: async (id) => {
                const invoice = get().stagingInvoices.find((i) => i.id === id);
                if (invoice) {
                    // Quitar ID temporal
                    const { id: tempId, ...data } = invoice;
                    try {
                        // Optimistic update
                        const optimisticId = "temp_" + Date.now();
                        set(state => ({
                            stagingInvoices: state.stagingInvoices.filter(i => i.id !== id),
                            // Temporalmente agregamos con ID falso mientras se confirma, o esperamos?
                            // Mejor esperar confirmación para evitar desincronización de IDs, 
                            // pero para UX rápido podríamos agregar. 
                            // Vamos a esperar el await para tener el ID real de Firestore.
                        }));

                        const docRef = await addDoc(collection(db, 'invoices'), data);
                        const newInvoice = { ...data, id: docRef.id };

                        set(state => ({
                            invoices: [...state.invoices, newInvoice]
                        }));

                    } catch (e) {
                        console.error("Error al confirmar factura:", e);
                        alert("Error al guardar en Cloud.");
                        // Rollback logic would go here (add back to staging)
                    }
                }
            },

            deleteInvoice: async (id) => {
                try {
                    await deleteDoc(doc(db, 'invoices', id));
                    set((state) => ({ invoices: state.invoices.filter((i) => i.id !== id) }));
                } catch (e) {
                    console.error("Error borrando factura:", e);
                }
            },

            // --- BULK CHARGE LOGIC (PHASE 2 - FIXES) ---
            previewBulkCobroByEmisor: async ({ emisorName, invoiceNumbers }) => {
                const uniqueNumbers = [...new Set(invoiceNumbers)]; // Normalized strings "976", "977"
                if (uniqueNumbers.length === 0) return { toCharge: [], alreadyPaid: [], notFound: [], duplicated: [] };

                const toCharge = [];
                const alreadyPaid = [];
                const foundNumbers = new Set();

                try {
                    // NEW STRATEGY: Fetch all invoices for the Emisor, then filter in memory.
                    // Ideally we'd use 'in' query on nroFactura, but without emisorCuit reliable, 
                    // and since 'emisor' (Name) is indexed/simple, this is safer.
                    // If Emisor has THOUSANDS of invoices, this might be heavy, but for this use case likely fine.
                    // Alternative: Chunked 'in' queries on nroFactura directly + client filter by emisor.
                    // Let's try Chunked 'in' query on nroFactura, AND client filter by Emisor.
                    // This avoids downloading ALL emisor history if legal.
                    // ACTUALLY: nroFactura is not unique across system, but high cardinality.
                    // Let's stick to the prompt suggestion: "Primero traer dataset por emisor con query barata: query(invoicesRef, where('emisor','==', selectedEmisorId))"

                    const invoicesRef = collection(db, 'invoices');
                    const { query, where, getDocs } = await import('firebase/firestore');

                    // Fetch by Emisor Name (ID)
                    const q = query(invoicesRef, where("emisor", "==", emisorName));
                    const snapshot = await getDocs(q);

                    snapshot.forEach(doc => {
                        const inv = { ...doc.data(), id: doc.id };
                        // Normalize inv.nroFactura (just in case DB has zeros)
                        const dbNum = String(parseInt(inv.nroFactura, 10));

                        if (uniqueNumbers.includes(dbNum)) {
                            foundNumbers.add(dbNum); // Track which inputs were found
                            // Logic: If input "0976" matches "976", it's a match.

                            // Check Status
                            if (inv.estadoDeCobro === 'COBRADO') {
                                // Prevent duplicates in array if multiple DB docs match same number (unlikely per spec but possible)
                                if (!alreadyPaid.some(x => x.id === inv.id)) alreadyPaid.push(inv);
                            } else {
                                if (!toCharge.some(x => x.id === inv.id)) toCharge.push(inv);
                            }
                        }
                    });

                } catch (error) {
                    console.error("Error previewing bulk charge:", error);
                    alert("Error consultando Firestore.");
                    return { toCharge: [], alreadyPaid: [], notFound: [], duplicated: [] };
                }

                // Determine Not Found
                // We check which of uniqueNumbers were NOT in foundNumbers
                // Note: uniqueNumbers are already normalized strings.
                const notFound = uniqueNumbers.filter(num => !foundNumbers.has(num));

                // Duplicate inputs check (visual only)
                const duplicated = invoiceNumbers.filter((item, index) => invoiceNumbers.indexOf(item) !== index);

                return { toCharge, alreadyPaid, notFound, duplicated: [...new Set(duplicated)] };
            },

            confirmBulkCobroByEmisor: async ({ docIds, fechaCobro }) => {
                // Now accepts docIds directly to be safe and atomic based on preview
                if (!docIds || docIds.length === 0) return { success: false, message: "No ids provided." };

                const batchSize = 500;
                const { writeBatch, doc } = await import('firebase/firestore');

                const batches = [];
                let currentBatch = writeBatch(db);
                let count = 0;

                docIds.forEach(id => {
                    const ref = doc(db, 'invoices', id);
                    currentBatch.update(ref, {
                        estadoDeCobro: 'COBRADO',
                        fechaCobro: fechaCobro
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

                    // Update Local State
                    set(state => ({
                        invoices: state.invoices.map(inv => {
                            if (docIds.includes(inv.id)) {
                                return { ...inv, estadoDeCobro: 'COBRADO', fechaCobro: fechaCobro };
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
                set(state => ({
                    invoices: state.invoices.map(i => i.id === id ? { ...i, ...updates } : i)
                }));

                try {
                    await updateDoc(doc(db, 'invoices', id), updates);
                } catch (e) {
                    console.error("Error actualizando estado:", e);
                }
            },

            // Edición General
            updateInvoice: async (id, newValues) => {
                // Calc total locally
                let derivedValues = {};
                const current = get().invoices.find(i => i.id === id);
                if (current) {
                    const merged = { ...current, ...newValues };
                    derivedValues.totalAPagarAnalista = Number(merged.montoGestion || 0) + Number(merged.ahorroAPagar || 0) + Number(merged.viaticosAPagar || 0);
                }

                const finalUpdates = { ...newValues, ...derivedValues };

                set(state => ({
                    invoices: state.invoices.map(i => i.id === id ? { ...i, ...finalUpdates } : i)
                }));

                try {
                    await updateDoc(doc(db, 'invoices', id), finalUpdates);
                } catch (e) {
                    console.error("Error editando factura:", e);
                }
            },

            addAnalyst: (name) => set((state) => ({ analysts: [...state.analysts, name] })),
            removeAnalyst: (name) => set((state) => ({ analysts: state.analysts.filter(a => a !== name) })),
        }),
        {
            name: 'verax-storage',
            // IMPORTANT: Only persist STAGING to localStorage. Everything else comes from DB.
            partialize: (state) => ({ stagingInvoices: state.stagingInvoices }),
        }
    )
);

export default useInvoiceStore;
