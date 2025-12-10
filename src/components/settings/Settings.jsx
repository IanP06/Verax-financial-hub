import React, { useState } from 'react';
import { Trash, Plus, User } from 'lucide-react';
import useInvoiceStore from '../../store/useInvoiceStore';

const Settings = () => {
    const { analysts, addAnalyst, removeAnalyst } = useInvoiceStore();
    const [newAnalyst, setNewAnalyst] = useState('');

    const handleAdd = () => {
        if (newAnalyst.trim()) {
            addAnalyst(newAnalyst.trim());
            setNewAnalyst('');
        }
    };

    return (
        <div className="p-6 max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold text-[#355071] mb-6 flex items-center gap-2">
                <User /> Gestión de Analistas
            </h1>

            <div className="bg-white p-6 rounded shadow">
                <div className="flex gap-2 mb-6">
                    <input
                        type="text"
                        value={newAnalyst}
                        onChange={(e) => setNewAnalyst(e.target.value)}
                        placeholder="Nombre del nuevo analista..."
                        className="flex-1 border p-2 rounded"
                    />
                    <button
                        onClick={handleAdd}
                        className="bg-[#355071] text-white px-4 py-2 rounded hover:bg-[#2c425e]"
                    >
                        <Plus size={20} />
                    </button>
                </div>

                <ul className="space-y-2">
                    {analysts && analysts.length > 0 ? (
                        analysts.map((name) => (
                            <li key={name} className="flex justify-between items-center p-3 bg-gray-50 rounded border">
                                <span className="font-medium text-[#1d2e3f]">{name}</span>
                                <button
                                    onClick={() => removeAnalyst(name)}
                                    className="text-[#d13737] hover:bg-red-50 p-1 rounded"
                                >
                                    <Trash size={18} />
                                </button>
                            </li>
                        ))
                    ) : (
                        <p className="text-gray-400 italic">No hay analistas configurados.</p>
                    )}
                </ul>
            </div>
        </div>
    );
};

export default Settings;
