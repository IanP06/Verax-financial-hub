import React from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Simple Layout for Analyst
// For now, simpler than Admin Sidebar, or maybe reuse Sidebar but with restricted items?
// The prompt says "Crear un nuevo layout y rutas /analyst".
// Let's create a specific top bar or sidebar for Analyst.

const AnalystLayout = () => {
    const { user, logout } = useAuth();

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
            {/* Header */}
            <header className="bg-white dark:bg-slate-950 shadow">
                <div className="mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
                    <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
                        Portal Analistas
                    </h1>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                            {user?.displayName || user?.email}
                        </span>
                        <button
                            onClick={logout}
                            className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500"
                        >
                            Cerrar Sesión
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                <Outlet />
            </main>
        </div>
    );
};

export default AnalystLayout;
