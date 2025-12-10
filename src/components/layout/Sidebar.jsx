import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, UploadCloud, FileSpreadsheet, Settings } from 'lucide-react';

const Sidebar = () => {
    const linkClasses = ({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
            ? 'bg-[#355071] text-white shadow-md'
            : 'text-gray-400 hover:bg-[#1d2e3f] hover:text-white'
        }`;

    return (
        <div className="w-64 bg-[#0f172a] min-h-screen flex flex-col text-white">
            {/* Header */}
            <div className="p-6 border-b border-gray-700">
                <h1 className="text-xl font-bold text-white tracking-wide">Verax Financial Hub</h1>
                <p className="text-xs text-gray-400 mt-1">Gestión Financiera</p>
            </div>

            {/* Navegación Principal */}
            <nav className="flex-1 p-4 space-y-2">
                <NavLink to="/ingesta" className={linkClasses}>
                    <UploadCloud size={20} />
                    <span className="font-medium">Ingesta & OCR</span>
                </NavLink>

                <NavLink to="/staging" className={linkClasses}>
                    <FileSpreadsheet size={20} />
                    <span className="font-medium">Staging Area</span>
                </NavLink>

                <NavLink to="/dashboard" className={linkClasses}>
                    <LayoutDashboard size={20} />
                    <span className="font-medium">Dashboard</span>
                </NavLink>
            </nav>

            {/* Footer / Configuración */}
            <div className="p-4 border-t border-gray-700">
                <NavLink to="/settings" className={linkClasses}>
                    <Settings size={20} />
                    <span className="font-medium">Configuración</span>
                </NavLink>
            </div>
        </div>
    );
};

export default Sidebar;
