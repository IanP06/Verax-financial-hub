import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import DropZone from './components/ingest/DropZone';
import StagingTable from './components/staging/StagingTable';
import Dashboard from './components/dashboard/Dashboard';
import Settings from './components/settings/Settings';
import useInvoiceStore from './store/useInvoiceStore';
import { applyTheme, getInitialTheme } from "./utils/theme";

// === SMOKE TEST IMPORTS ===
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./lib/firebase";
// ==========================

function App() {
  const { initFromFirestore } = useInvoiceStore();
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    initFromFirestore();
    const t = getInitialTheme();
    setTheme(t);
    applyTheme(t);
  }, [initFromFirestore]);

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
      console.log("ENV VITE_FIREBASE_PROJECT_ID:", import.meta.env.VITE_FIREBASE_PROJECT_ID);
      console.log("DB Initialized:", !!db);

      try {
        const docRef = await addDoc(collection(db, "smoke"), {
          ok: true,
          at: serverTimestamp(),
          where: window.location.href,
          userAgent: navigator.userAgent
        });
        console.log("✅ SMOKE WRITE OK. Doc ID:", docRef.id);
      } catch (error) {
        console.error("❌ SMOKE WRITE FAIL:", error);
        console.error("Error Code:", error.code);
        console.error("Error Message:", error.message);
      }
      console.log("=== FIRESTORE SMOKE TEST END ===");
    };

    runSmokeTest();
  }, []);
  // ========================

  return (
    <Router>
      <div className="flex min-h-screen bg-gray-100 font-sans text-gray-900 dark:bg-slate-950 dark:text-slate-100">
        <Sidebar theme={theme} toggleTheme={toggleTheme} />
        <main className="flex-1 p-8 overflow-y-auto">
          <Routes>
            {/* REDIRECCIÓN INICIAL: Al entrar, ir a Ingesta (o Dashboard si prefieres) */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            <Route path="/ingesta" element={<DropZone />} />
            <Route path="/staging" element={<StagingTable />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
