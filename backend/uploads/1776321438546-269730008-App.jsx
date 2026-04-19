import { Routes, Route, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import DBSetupModal from "./components/DBSetupModal";

import Dashboard from "./pages/Dashboard";
import UploadProject from "./pages/UploadProject";
import TestRuns from "./pages/TestRuns";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Help from "./pages/Help";

export default function App() {
  const [showDBSetup, setShowDBSetup] = useState(false);
  const navigate = useNavigate();

  function handleDBSuccess(config) {
    localStorage.setItem("dbConfig", JSON.stringify(config));
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) return;
      if (e.altKey) {
        switch (e.key.toUpperCase()) {
          case "D":
            e.preventDefault();
            navigate("/");
            break;
          case "U":
            e.preventDefault();
            navigate("/upload");
            break;
          case "T":
            e.preventDefault();
            navigate("/runs");
            break;
          case "S":
            e.preventDefault();
            navigate("/settings");
            break;
          default:
            break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  return (
    <div className="app-layout">
      <Sidebar onDBSetup={() => setShowDBSetup(true)} />

      {showDBSetup && (
        <DBSetupModal onClose={() => setShowDBSetup(false)} onSuccess={handleDBSuccess} />
      )}

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upload" element={<UploadProject />} />
          <Route path="/runs" element={<TestRuns />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/help" element={<Help />} />
        </Routes>
      </main>
    </div>
  );
}

