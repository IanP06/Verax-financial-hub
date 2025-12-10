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

            // Acciones básicas
            addStagingInvoice: (inv) => set((state) => ({ stagingInvoices: [...state.stagingInvoices, { ...inv, id: Date.now(), estado: 'IMPAGO' }] })),
            removeStagingInvoice: (id) => set((state) => ({ stagingInvoices: state.stagingInvoices.filter((i) => i.id !== id) })),
            updateStagingInvoice: (id, field, value) => set((state) => ({
                stagingInvoices: state.stagingInvoices.map((i) => i.id === id ? { ...i, [field]: value } : i)
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
            updateInvoiceStatus: (id, nuevoEstado, fechaPagoReal = null) => set((state) => ({
                invoices: state.invoices.map((inv) => {
                    if (inv.id !== id) return inv;

                    let updates = { estado: nuevoEstado };

                    if (nuevoEstado === 'PAGO' && fechaPagoReal) {
                        const fechaEmisionObj = parseDate(inv.fecha);
                        const fechaPagoObj = parseDate(fechaPagoReal);
                        // Diferencia en milisegundos -> a días
                        const diffTime = Math.abs(fechaPagoObj - fechaEmisionObj);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                        updates.fechaPago = fechaPagoReal;
                        updates.diasCobro = diffDays;
                    } else if (nuevoEstado === 'IMPAGO') {
                        updates.fechaPago = null;
                        updates.diasCobro = '-';
                    }
                    return { ...inv, ...updates };
                })
            })),

            addAnalyst: (name) => set((state) => ({ analysts: [...state.analysts, name] })),
            removeAnalyst: (name) => set((state) => ({ analysts: state.analysts.filter(a => a !== name) })),
        }),
        { name: 'verax-storage' }
    )
);

export default useInvoiceStore;
