import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import useAnalystStore from '../../store/useAnalystStore';
import Sidebar from '../layout/Sidebar';

const AnalystLayout = ({ theme, toggleTheme }) => {
    const { user, logout } = useAuth();
    const { fetchAnalystData } = useAnalystStore();

    useEffect(() => {
        if (user?.uid) {
            // Determine the key to use for querying
            // Priority: profile.analystKey > profile.displayName > auth.displayName
            const keyToUse = user.analystKey || user.displayName;
            // console.log(`[AnalystLayout] Fetching data for UID: ${user.uid} using Key: ${keyToUse}`);

            if (keyToUse) {
                fetchAnalystData(user.uid, keyToUse);
            } else {
                console.warn("[AnalystLayout] No analyst key identifier found for user");
            }
        }
    }, [user, fetchAnalystData]);

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
