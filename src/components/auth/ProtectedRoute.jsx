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
        const userRole = user.role || 'GUEST'; // Default to guest if no role
        if (!allowedRoles.includes(userRole)) {
            // Unauthorized Role: Redirect based on actual role
            if (userRole === 'ANALYST') return <Navigate to="/analyst" replace />;
            if (userRole === 'ADMIN') return <Navigate to="/dashboard" replace />;
            return <Navigate to="/unauthorized" replace />;
        }
    }

    return <Outlet />;
};

export default ProtectedRoute;
