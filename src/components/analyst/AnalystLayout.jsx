import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import useAnalystStore from '../../store/useAnalystStore';
import Sidebar from '../layout/Sidebar';

const AnalystLayout = ({ theme, toggleTheme }) => {
    const { user, userProfile, logout } = useAuth();
    // Removed fetchAnalystData

    useEffect(() => {
        let unsubscribe = () => { };

        if (user?.uid && (userProfile?.analystKey || userProfile?.displayName)) {
            const keyToUse = userProfile.analystKey || userProfile.displayName;

            // Subscribe strictly once
            unsubscribe = useAnalystStore.getState().subscribeToAnalystData(user.uid, keyToUse);

            if (typeof unsubscribe !== 'function') {
                console.warn("[AnalystLayout] Subscription return is not a function:", unsubscribe);
                unsubscribe = () => { }; // Safety
            }
        }

        return () => {
            if (typeof unsubscribe === 'function') unsubscribe();
        };
    }, [user, userProfile]);

    return (
        <div className="flex min-h-screen bg-gray-50 font-sans text-gray-900 dark:bg-slate-950 dark:text-slate-100">
            {/* Shared Sidebar */}
            <Sidebar theme={theme} toggleTheme={toggleTheme} />

            {/* Main Content */}
            <main className="flex-1 p-8 overflow-y-auto">
                <div className="mx-auto max-w-7xl">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default AnalystLayout;
