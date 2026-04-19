import { useState } from "react";
import { downloadArtifacts } from "../api";
import LogViewer from "./LogViewer";

function formatDate(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}

export default function RunDetails({ run, onClose }) {
  const [downloading, setDownloading] = useState(false);

  function handleDownload() {
    setDownloading(true);
    try {
      downloadArtifacts(run.id);
    } finally {
      setDownloading(false);
    }
  }

  const isRunning = !run.finishedAt;

  return (
    <div className="modal-overlay">
      <div className="modal-large">
        <div className="modal-header">
          <h2>Run Details: {run.id.slice(0, 8)}</h2>
          <button onClick={onClose} className="close-btn">
            ✕
          </button>
        </div>

        <div className="run-info">
          <div className="info-row">
            <span className="label">Status:</span>
            <span className={`badge ${run.status}`}>{run.status || "In Progress"}</span>
          </div>
          <div className="info-row">
            <span className="label">Started:</span>
            <span>{formatDate(run.startedAt)}</span>
          </div>
          <div className="info-row">
            <span className="label">Finished:</span>
            <span>{formatDate(run.finishedAt)}</span>
          </div>
        </div>

        <LogViewer runId={run.id} isRunning={isRunning} />

        {run.finishedAt && (
          <div className="modal-buttons">
            <button onClick={handleDownload} disabled={downloading}>
              {downloading ? "Downloading..." : "⬇ Download Test Reports"}
            </button>
            <button onClick={onClose} className="secondary">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
