import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import DropZone from './components/ingest/DropZone';
import StagingTable from './components/staging/StagingTable';
import Dashboard from './components/dashboard/Dashboard';
import Settings from './components/settings/Settings';
import useInvoiceStore from './store/useInvoiceStore';

function App() {
  const { initFromFirestore } = useInvoiceStore();

  useEffect(() => {
    initFromFirestore();
  }, [initFromFirestore]);

  return (
    <Router>
      <div className="flex min-h-screen bg-gray-100 font-sans text-gray-900">
        <Sidebar />
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
