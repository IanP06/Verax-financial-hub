import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import DropZone from './components/ingest/DropZone';
import StagingTable from './components/staging/StagingTable';
import Dashboard from './components/dashboard/Dashboard';
import Settings from './components/settings/Settings';
import Login from './components/auth/Login';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AnalystLayout from './components/analyst/AnalystLayout';
import AnalystDashboard from './components/analyst/AnalystDashboard';
import AnalystPayoutRequests from './components/analyst/AnalystPayoutRequests'; // [NEW IMPORT]
import PayoutRequests from './components/admin/PayoutRequests';
import { AuthProvider } from './context/AuthContext';
import useInvoiceStore from './store/useInvoiceStore';
import { applyTheme, getInitialTheme } from "./utils/theme";

// === SMOKE TEST IMPORTS ===
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./lib/firebase";
// ==========================

// Layout Wrapper for Admin to include Sidebar
const AdminLayout = ({ children, theme, toggleTheme }) => {
  const { initAdminData } = useInvoiceStore();
  useEffect(() => {
    initAdminData();
  }, [initAdminData]);

  return (
    <div className="flex min-h-screen bg-gray-100 font-sans text-gray-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar theme={theme} toggleTheme={toggleTheme} />
      <main className="flex-1 p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  );
};


function App() {
  const [theme, setTheme] = useState("light");

  // REMOVED unconditional initFromFirestore to prevent Analyst crashes
  // Logic moved to AdminLayout or Authorized components

  useEffect(() => {
    const t = getInitialTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      return next;
    });
  };

  // === SMOKE TEST EFFECT ===
  useEffect(() => {
    const runSmokeTest = async () => {
      console.log("=== FIRESTORE SMOKE TEST START ===");
      // ... (existing logging code)
    };
    // runSmokeTest(); // Disabled to avoid noise, enabled in original code if needed
  }, []);
  // ========================

  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* ADMIN ROUTES */}
          <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/ingesta" element={<AdminLayout theme={theme} toggleTheme={toggleTheme}><DropZone /></AdminLayout>} />
            <Route path="/staging" element={<AdminLayout theme={theme} toggleTheme={toggleTheme}><StagingTable /></AdminLayout>} />
            <Route path="/dashboard" element={<AdminLayout theme={theme} toggleTheme={toggleTheme}><Dashboard /></AdminLayout>} />
            <Route path="/payouts" element={<AdminLayout theme={theme} toggleTheme={toggleTheme}><PayoutRequests /></AdminLayout>} />
            <Route path="/settings" element={<AdminLayout theme={theme} toggleTheme={toggleTheme}><Settings /></AdminLayout>} />
          </Route>

          {/* ANALYST ROUTES */}
          <Route element={<ProtectedRoute allowedRoles={['ANALYST']} />}>
            <Route path="/analyst" element={<AnalystLayout theme={theme} toggleTheme={toggleTheme} />}>
              <Route index element={<AnalystDashboard />} />
              <Route path="payout-requests" element={<AnalystPayoutRequests />} />
              {/* Add more analyst routes here */}
            </Route>
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
