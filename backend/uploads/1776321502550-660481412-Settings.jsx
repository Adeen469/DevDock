import { useState, useEffect } from "react";
import DBSetupModal from "../components/DBSetupModal";

export default function Settings() {
  const [showDBSetup, setShowDBSetup] = useState(false);
  const [dbConfig, setDbConfig] = useState(null);
  const [apiBase, setApiBase] = useState(import.meta.env.VITE_API_BASE_URL || "http://localhost:4200/api");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("dbConfig");
    if (saved) {
      setDbConfig(JSON.parse(saved));
    }
  }, []);

  function handleDBSuccess(config) {
    setDbConfig(config);
    setMessage("✓ Database configuration saved!");
    setTimeout(() => setMessage(""), 3000);
  }

  function handleClearDB() {
    if (confirm("Clear database configuration?")) {
      localStorage.removeItem("dbConfig");
      setDbConfig(null);
      setMessage("✓ Database configuration cleared");
      setTimeout(() => setMessage(""), 3000);
    }
  }

  function handleSaveAPIBase() {
    localStorage.setItem("apiBase", apiBase);
    setMessage("✓ API base URL saved!");
    setTimeout(() => setMessage(""), 3000);
  }

  return (
    <div className="page-content">
      <h1>Settings</h1>

      {showDBSetup && (
        <DBSetupModal onClose={() => setShowDBSetup(false)} onSuccess={handleDBSuccess} />
      )}

      <section className="card">
        <h2>Database Configuration</h2>
        {dbConfig ? (
          <div className="config-info">
            <p className="config-ok">✓ Database configured</p>
            <p>
              <strong>Host:</strong> {dbConfig.host}:{dbConfig.port}
            </p>
            <p>
              <strong>User:</strong> {dbConfig.user}
            </p>
            <p>
              <strong>Database:</strong> {dbConfig.database}
            </p>
            <button onClick={() => setShowDBSetup(true)}>Update Configuration</button>
            <button onClick={handleClearDB} className="secondary">
              Clear Configuration
            </button>
          </div>
        ) : (
          <div>
            <p>No database configured yet.</p>
            <button onClick={() => setShowDBSetup(true)}>Configure Database</button>
          </div>
        )}
      </section>

      <section className="card">
        <h2>API Configuration</h2>
        <label className="field">
          API Base URL
          <input value={apiBase} onChange={(e) => setApiBase(e.target.value)} />
        </label>
        <button onClick={handleSaveAPIBase}>Save API Configuration</button>
        <p className="hint">Set this to point to your QA Engineer backend server.</p>
      </section>

      <section className="card">
        <h2>Application Info</h2>
        <p>
          <strong>Version:</strong> 1.0.0
        </p>
        <p>
          <strong>Frontend:</strong> React 18 + Vite
        </p>
        <p>
          <strong>Backend:</strong> Node.js Express + MySQL
        </p>
      </section>

      {message && <div className={`result ${message.startsWith("✓") ? "ok" : "bad"}`}>{message}</div>}
    </div>
  );
}
