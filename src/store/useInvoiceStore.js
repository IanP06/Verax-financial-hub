import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
            config: {
                montoGestion: 20000,
                // Default seeds (fallback) - User can edit these in Settings
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
                ],
                aseguradoras: {
                    // Deprecated or Kept for backward compatibility but UI will focus on validAseguradoras array
                    'SANCOR': { dias: 15, tolerancia: 3 },
                    'PROVINCIA': { dias: 7, tolerancia: 3 },
                    'ATM': { dias: 30, tolerancia: 3 },
                    'AMCA': { dias: 30, tolerancia: 3 },
                    'OTRA': { dias: 30, tolerancia: 3 }
                }
            },
            updateConfig: (newConfig) => set({ config: newConfig }),

            // Acciones básicas
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
                // Pre-calc
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

                    // Recalcular total si cambian los componentes
                    if (['montoGestion', 'ahorroAPagar', 'viaticosAPagar', 'plusPorAhorro'].includes(field)) {
                        updated.totalAPagarAnalista = Number(updated.montoGestion || 0) + Number(updated.ahorroAPagar || 0) + Number(updated.viaticosAPagar || 0);
                    }
                    return updated;
                })
            })),

            confirmInvoice: (id) => {
                const invoice = get().stagingInvoices.find((i) => i.id === id);
                if (invoice) {
                    set((state) => ({
                        invoices: [...state.invoices, invoice],
                        stagingInvoices: state.stagingInvoices.filter((i) => i.id !== id),
                    }));
                }
            },

            deleteInvoice: (id) => set((state) => ({ invoices: state.invoices.filter((i) => i.id !== id) })),

            // LÓGICA CRÍTICA DE CAMBIO DE ESTADO Y CÁLCULO DE DÍAS
            // LÓGICA CRÍTICA DE CAMBIO DE ESTADO Y CÁLCULO DE DÍAS (Cobro a Aseguradora)
            updateInvoiceStatus: (id, nuevoEstado, fechaPagoReal = null) => set((state) => ({
                invoices: state.invoices.map((inv) => {
                    if (inv.id !== id) return inv;

                    // Compatibilidad o cambio directo: 'COBRADO' / 'NO COBRADO'
                    let updates = { estadoDeCobro: nuevoEstado };

                    if (nuevoEstado === 'COBRADO' && fechaPagoReal) {
                        const fechaEmisionObj = parseDate(inv.fecha);
                        const fechaPagoObj = parseDate(fechaPagoReal);
                        // Diferencia en milisegundos -> a días
                        const diffTime = Math.abs(fechaPagoObj - fechaEmisionObj);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                        updates.fechaPago = fechaPagoReal;
                        updates.diasCobro = diffDays;
                    } else if (nuevoEstado === 'NO COBRADO') {
                        updates.fechaPago = null;
                        updates.diasCobro = '-';
                    }
                    return { ...inv, ...updates };
                })
            })),

            // Actualización general para Master (Edición completa)
            updateInvoice: (id, newValues) => set((state) => ({
                invoices: state.invoices.map((inv) => {
                    if (inv.id === id) {
                        const merged = { ...inv, ...newValues };
                        // Recalcular total si es necesario
                        merged.totalAPagarAnalista = Number(merged.montoGestion || 0) + Number(merged.ahorroAPagar || 0) + Number(merged.viaticosAPagar || 0);
                        return merged;
                    }
                    return inv;
                })
            })),

            addAnalyst: (name) => set((state) => ({ analysts: [...state.analysts, name] })),
            removeAnalyst: (name) => set((state) => ({ analysts: state.analysts.filter(a => a !== name) })),
        }),
        { name: 'verax-storage' }
    )
);

export default useInvoiceStore;
