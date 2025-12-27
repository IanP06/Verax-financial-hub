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
