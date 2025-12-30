import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const ProtectedRoute = ({ allowedRoles }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return <div className="flex h-screen items-center justify-center">Loading...</div>;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (allowedRoles && allowedRoles.length > 0) {
        // user.role is already normalized in AuthContext to 'admin' or 'analyst'
        // But allowedRoles might be passed as ['ADMIN'] or ['ANALYST'] from App.jsx
        // Let's normalize everything to lowercase for comparison
        const userRole = (user.role || 'guest').toLowerCase();
        const safeAllowedRoles = allowedRoles.map(r => r.toLowerCase());

        console.log(`[Route] Checking access. UserRole: ${userRole}. Allowed: ${safeAllowedRoles.join(', ')}`);

        if (!safeAllowedRoles.includes(userRole)) {
            // Authorized Redirects based on Role
            if (userRole === 'analyst') return <Navigate to="/analyst" replace />;
            if (userRole === 'admin') return <Navigate to="/dashboard" replace />;

            // If role is unknown/error, don't loop. Show simple message or Login.
            console.warn(`[Route] Access Denied. UserRole ${userRole} not in ${safeAllowedRoles}`);
            // If we are already at login, don't redirect to login (caught by !user check earlier)
            // If we are at a protected route, redirect to root or unauthorized
            return <div className="p-10 text-red-600 font-bold">Acceso Denegado (Rol: {userRole}). Contacte al administrador.</div>;
        }
    }

    return <Outlet />;
};

export default ProtectedRoute;
