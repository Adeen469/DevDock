import { useState } from "react";
import { testDatabaseConnection } from "../api";

export default function DBSetupModal({ onClose, onSuccess }) {
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState("3306");
  const [user, setUser] = useState("root");
  const [password, setPassword] = useState("");
  const [database, setDatabase] = useState("qa_engineer");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  async function handleTest() {
    setTesting(true);
    setResult(null);
    try {
      const response = await testDatabaseConnection({ host, port, user, password, database });
      setResult(response);
      if (response.ok) {
        setTimeout(() => {
          onSuccess({ host, port, user, password, database });
          onClose();
        }, 800);
      }
    } catch (error) {
      setResult({ ok: false, error: error?.message || "Test failed" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Database Setup Wizard</h2>
        <p>Configure your MySQL database for persistent test storage.</p>

        <label className="field">
          Host
          <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="127.0.0.1" />
        </label>

        <label className="field">
          Port
          <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="3306" type="number" />
        </label>

        <label className="field">
          User
          <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="root" />
        </label>

        <label className="field">
          Password
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
        </label>

        <label className="field">
          Database
          <input value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="qa_engineer" />
        </label>

        {result && (
          <div className={`result ${result.ok ? "ok" : "bad"}`}>
            {result.ok ? "✓ Connection successful" : `✗ ${result.error}`}
          </div>
        )}

        <div className="modal-buttons">
          <button disabled={testing} onClick={handleTest}>
            {testing ? "Testing..." : "Test Connection"}
          </button>
          <button onClick={onClose} className="secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
