import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, UploadCloud, FileSpreadsheet, Settings, DollarSign, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const Sidebar = ({ theme, toggleTheme }) => {
    const { logout } = useAuth();
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

                <NavLink to="/payouts" className={linkClasses}>
                    <DollarSign size={20} />
                    <span className="font-medium">Solicitudes Pago</span>
                </NavLink>
            </nav>

            {/* Footer / Configuración */}
            <div className="p-4 border-t border-gray-700 space-y-2">
                <div className="pt-2 border-t border-gray-700">
                    <button
                        onClick={toggleTheme}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-md
                                     bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                        type="button"
                    >
                        <span className="text-sm">Modo Oscuro</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${theme === 'dark' ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-400'}`}>
                            {theme === 'dark' ? 'ON' : 'OFF'}
                        </span>
                    </button>
                </div>

                <NavLink to="/settings" className={linkClasses}>
                    <Settings size={20} />
                    <span className="font-medium">Configuración</span>
                </NavLink>

                <button
                    onClick={() => logout()}
                    className="w-full flex items-center gap-3 px-4 py-2 mt-2 rounded-lg text-red-400 hover:bg-red-900/20 hover:text-red-300 transition-colors"
                >
                    <LogOut size={20} />
                    <span className="font-medium">Cerrar Sesión</span>
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
