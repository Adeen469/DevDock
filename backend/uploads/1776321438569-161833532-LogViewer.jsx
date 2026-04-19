import { useEffect, useState } from "react";
import { createLogStream, getRunLog } from "../api";

export default function LogViewer({ runId, isRunning }) {
  const [logs, setLogs] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!runId) {
      return;
    }

    let canceled = false;

    async function loadInitialLog() {
      try {
        const content = await getRunLog(runId);
        if (!canceled) {
          setLogs(content || "");
        }
      } catch {
        if (!canceled) {
          setLogs("");
        }
      }
    }

    loadInitialLog();

    if (!isRunning) {
      return () => {
        canceled = true;
      };
    }

    const eventSource = createLogStream(runId);

    eventSource.onopen = () => {
      setIsConnected(true);
      setLogs("");
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.done) {
          eventSource.close();
          setIsConnected(false);
        } else if (data.line) {
          setLogs((prev) => prev + data.line + "\n");
        }
      } catch (err) {
        // Ignore parse errors
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      eventSource.close();
    };

    return () => {
      canceled = true;
      eventSource.close();
    };
  }, [runId, isRunning]);

  return (
    <div className="log-viewer">
      <div className="log-header">
        <h3>Test Output</h3>
        <span className={`status ${isConnected ? "connected" : "disconnected"}`}>
          {isConnected ? "● Live" : "○ Offline"}
        </span>
      </div>
      <pre className="log-content">{logs || "Waiting for test output..."}</pre>
    </div>
  );
}
