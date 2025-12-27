import React, { useState } from 'react';

const PaymentConfirmationModal = ({ count, total, onConfirm, onClose }) => {
    const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);

    const handleSubmit = () => {
        onConfirm(fecha);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 shadow-xl w-96">
                <h2 className="text-xl font-bold text-[#1d2e3f] mb-4">Confirmar Pagos</h2>
                <div className="mb-4 text-sm text-gray-700">
                    <p>Vas a marcar como <strong>PAGADAS</strong>:</p>
                    <p className="text-2xl font-bold my-2">{count} facturas</p>
                    <p>Total a desembolsar:</p>
                    <p className="text-2xl font-bold text-[#355071]">${total.toLocaleString('es-AR')}</p>
                </div>

                <div className="mb-6">
                    <label className="block text-xs font-bold text-gray-700 mb-1">Fecha de Pago</label>
                    <input
                        type="date"
                        value={fecha}
                        onChange={e => setFecha(e.target.value)}
                        className="border p-2 rounded w-full"
                    />
                </div>

                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancelar</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-bold">
                        Confirmar Pago
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PaymentConfirmationModal;
