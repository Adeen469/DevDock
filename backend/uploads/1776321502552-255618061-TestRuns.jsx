import { useEffect, useMemo, useRef, useState } from "react";
import {
  detectProjectIntent,
  fixDefectAndRerun,
  generateProjectPlan,
  generateProjectTestCases,
  getProjects,
  getRunDefects,
  getRuns,
  getRunSummary,
  invalidateDefect,
  rerunFromDefect,
  runTests,
  suggestDefectFix
} from "../api";
import RunDetails from "../components/RunDetails";
import LogViewer from "../components/LogViewer";

function formatDate(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}

export default function TestRuns() {
  const [runs, setRuns] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [workflowRun, setWorkflowRun] = useState(null);
  const [detailsRun, setDetailsRun] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  const [workflowStep, setWorkflowStep] = useState(0);
  const [intentText, setIntentText] = useState("");
  const [planText, setPlanText] = useState("");
  const [casesText, setCasesText] = useState("");
  const [defects, setDefects] = useState([]);
  const [defectSuggestions, setDefectSuggestions] = useState({});
  const [summary, setSummary] = useState(null);
  const [workflowMessage, setWorkflowMessage] = useState("");
  const liveProcessRef = useRef(null);
  const defectReportRef = useRef(null);
  const summaryRef = useRef(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  useEffect(() => {
    async function load() {
      try {
        const [runsList, projectsList] = await Promise.all([getRuns(), getProjects()]);
        setRuns(runsList);
        setProjects(projectsList);
        if (projectsList.length > 0) {
          setSelectedProjectId(projectsList[0].id);
        }
        if (selectedRun) {
          const latest = runsList.find((run) => run.id === selectedRun.id);
          if (latest) {
            setSelectedRun(latest);
          }
        }
      } catch (error) {
        console.error("Failed to load data", error);
      }
    }

    load();

    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [selectedRun]);

  useEffect(() => {
    async function finalizeRun() {
      if (!selectedRun || !selectedRun.finishedAt || workflowStep < 4) {
        return;
      }

      try {
        const [defectData, summaryData] = await Promise.all([
          getRunDefects(selectedRun.id),
          getRunSummary(selectedRun.id)
        ]);
        setDefects(defectData.defects || []);
        setSummary(summaryData.summary || null);
        setWorkflowStep(5);
        setWorkflowMessage("Run completed. Review and edit defects before summary.");
      } catch (error) {
        setWorkflowMessage(`Failed to load defects: ${error.message}`);
      }
    }

    finalizeRun();
  }, [selectedRun, workflowStep]);

  async function handleDetectIntent() {
    if (!selectedProjectId) {
      alert("Please select a project");
      return;
    }

    setBusy(true);
    try {
      const data = await detectProjectIntent(selectedProjectId);
      setIntentText(JSON.stringify(data.intent, null, 2));
      setPlanText("");
      setCasesText("");
      setSummary(null);
      setDefects([]);
      setDefectSuggestions({});
      setWorkflowStep(1);
      setWorkflowMessage("Intent generated. Edit and confirm to continue.");
    } catch (error) {
      setWorkflowMessage(`Failed to detect intent: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmIntent() {
    setBusy(true);
    try {
      const intent = JSON.parse(intentText);
      const data = await generateProjectPlan(selectedProjectId, intent);
      setPlanText(JSON.stringify(data.plan, null, 2));
      setWorkflowStep(2);
      setWorkflowMessage("Test plan generated. Edit and confirm.");
    } catch (error) {
      setWorkflowMessage(`Invalid intent JSON or API failure: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmPlan() {
    setBusy(true);
    try {
      const plan = JSON.parse(planText);
      const data = await generateProjectTestCases(selectedProjectId, plan);
      setCasesText(JSON.stringify(data.testCases, null, 2));
      setWorkflowStep(3);
      setWorkflowMessage("Test cases generated. Edit and confirm.");
    } catch (error) {
      setWorkflowMessage(`Invalid plan JSON or API failure: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmCasesAndRun() {
    setBusy(true);
    try {
      const plan = planText ? JSON.parse(planText) : {};
      if (casesText) {
        JSON.parse(casesText);
      }

      const run = await runTests(selectedProjectId, {
        suite: plan.suite || {
          unitWhiteBox: true,
          apiIntegration: true,
          uiBlackBox: true,
          performance: true
        },
        baseUrl
      });
      setSelectedRun(run);
      setWorkflowRun(run);

      const [defectData, summaryData] = await Promise.all([
        getRunDefects(run.id).catch(() => ({ defects: [] })),
        getRunSummary(run.id).catch(() => ({ summary: null }))
      ]);

      setDefects(defectData.defects || []);
      setSummary(summaryData.summary || null);
      setWorkflowStep(5);
      setWorkflowMessage("Testing completed. Review the defect report and confirm to continue.");

      window.setTimeout(() => {
        liveProcessRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } catch (error) {
      setWorkflowMessage(`Failed to start run: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSuggestFix(defect) {
    try {
      const result = await suggestDefectFix(selectedRun.id, defect);
      setDefectSuggestions((prev) => ({ ...prev, [defect.id]: result.suggestions || [] }));
    } catch (error) {
      setDefectSuggestions((prev) => ({
        ...prev,
        [defect.id]: [`Failed to get suggestions: ${error.message}`]
      }));
    }
  }

  async function handleRerun(defect) {
    setBusy(true);
    try {
      const data = await rerunFromDefect(selectedRun.id, { baseUrl, defect });
      setSelectedRun(data.run);
      setDefects([]);
      setSummary(null);
      setWorkflowStep(4);
      setWorkflowMessage("Rerun started from selected defect.");
    } catch (error) {
      setWorkflowMessage(`Rerun failed: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleFixAndRerun(defect) {
    setBusy(true);
    try {
      const data = await fixDefectAndRerun(selectedRun.id, defect, { baseUrl });
      setSelectedRun(data.run);
      setSelectedProjectId(data.fixedProject.id);
      setDefects([]);
      setSummary(null);
      setWorkflowStep(4);
      setWorkflowMessage(`Fixed project created (${data.fixedProject.name}) and rerun started.`);
      const projectsList = await getProjects();
      setProjects(projectsList);
    } catch (error) {
      setWorkflowMessage(`Auto-fix failed: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleInvalidate(defect) {
    try {
      await invalidateDefect(selectedRun.id, defect.id);
      setDefects((prev) => prev.filter((item) => item.id !== defect.id));
    } catch (error) {
      setWorkflowMessage(`Failed to invalidate defect: ${error.message}`);
    }
  }

  async function handleConfirmDefects() {
    try {
      const fallbackSummary = {
        headline: "Defect report confirmed",
        totals: {
          steps: workflowRun?.steps?.length || 0,
          failedSteps: defects.length,
          defects: defects.length
        },
        observations: defects.map((defect) => defect.name),
        recommendation: defects.length ? "Fix defects and rerun" : "No defects found. Review the run summary and ship if acceptable."
      };

      if (!summary) {
        const summaryData = await getRunSummary(selectedRun.id);
        setSummary(summaryData.summary || fallbackSummary);
      } else {
        setSummary(summary || fallbackSummary);
      }
      setWorkflowStep(6);
      setWorkflowMessage("Defect report confirmed. Summary report is ready.");
      window.setTimeout(() => {
        summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } catch (error) {
      setWorkflowMessage(`Unable to load summary report: ${error.message}`);
    }
  }

  const filteredRuns =
    filter === "all"
      ? runs
      : filter === "passed"
        ? runs.filter((r) => r.status === "passed")
        : filter === "failed"
          ? runs.filter((r) => r.status === "failed")
          : runs.filter((r) => !r.finishedAt);

  return (
    <div className="page-content">
      <h1>Test Runs & History</h1>

      <section className="card">
        <h2>Guided Testing Flow</h2>

        <label className="field">
          Project
          <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
            <option value="">Select project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Base URL
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="Optional for web apps" />
        </label>

        <div className="flow-stepper">
          <span className={workflowStep >= 1 ? "active" : ""}>1. Intent</span>
          <span className={workflowStep >= 2 ? "active" : ""}>2. Plan</span>
          <span className={workflowStep >= 3 ? "active" : ""}>3. Test Cases</span>
          <span className={workflowStep >= 4 ? "active" : ""}>4. Execute</span>
          <span className={workflowStep >= 5 ? "active" : ""}>5. Defects</span>
          <span className={workflowStep >= 6 ? "active" : ""}>6. Summary</span>
        </div>

        <button disabled={busy || !selectedProjectId} onClick={handleDetectIntent} className="primary-btn">
          {busy ? "Working..." : "▶ Auto-Detect and Start Testing"}
        </button>

        {workflowMessage && <p className="hint">{workflowMessage}</p>}

        {workflowStep >= 1 && (
          <div className="workflow-card">
            <h3>Project Intent (Editable)</h3>
            <textarea value={intentText} onChange={(e) => setIntentText(e.target.value)} rows={10} />
            <button disabled={busy} onClick={handleConfirmIntent} className="primary-btn">
              Confirm Intent & Continue
            </button>
          </div>
        )}

        {workflowStep >= 2 && (
          <div className="workflow-card">
            <h3>Test Plan (Editable)</h3>
            <textarea value={planText} onChange={(e) => setPlanText(e.target.value)} rows={12} />
            <button disabled={busy} onClick={handleConfirmPlan} className="primary-btn">
              Confirm Plan & Continue
            </button>
          </div>
        )}

        {workflowStep >= 3 && (
          <div className="workflow-card">
            <h3>Possible Test Cases (Editable)</h3>
            <textarea value={casesText} onChange={(e) => setCasesText(e.target.value)} rows={12} />
            <button disabled={busy} onClick={handleConfirmCasesAndRun} className="primary-btn">
              Confirm Test Cases & Run
            </button>
          </div>
        )}

        {workflowStep >= 4 && selectedRun && (
          <div className="workflow-card" ref={liveProcessRef}>
            <h3>Live Testing Process</h3>
            <p className="hint">
              {selectedProject?.name || "Project"} is running. Black-box and white-box command markers are streamed below.
            </p>
            {workflowRun?.steps?.length ? (
              <div className="process-list">
                {workflowRun.steps.map((step, index) => (
                  <div key={`${step.name}-${index}`} className={`process-item ${step.ok ? "ok" : "bad"}`}>
                    <div className="process-title">
                      <strong>{step.name}</strong>
                      <span>{step.ok ? "passed" : step.skipped ? "skipped" : "running/failed"}</span>
                    </div>
                    <pre>{step.command}</pre>
                    {step.stdout && <pre>{step.stdout}</pre>}
                    {step.stderr && <pre>{step.stderr}</pre>}
                  </div>
                ))}
              </div>
            ) : null}
            <LogViewer runId={selectedRun.id} isRunning={!selectedRun.finishedAt} />
          </div>
        )}

        {workflowStep >= 5 && (
          <div className="workflow-card" ref={defectReportRef}>
            <h3>Defect Report (Editable)</h3>
            {defects.length === 0 ? (
              <p>No active defects found.</p>
            ) : (
              <div className="defect-list">
                {defects.map((defect) => (
                  <details key={defect.id} className="defect-item" open>
                    <summary>{defect.name}</summary>
                    <pre>{defect.message}</pre>
                    <div className="defect-actions">
                      <button onClick={() => handleRerun(defect)}>Run This Test Again</button>
                      <button onClick={() => handleSuggestFix(defect)}>Ways to Fix</button>
                      <button onClick={() => handleFixAndRerun(defect)}>Fix Defect & Run Again</button>
                      <button className="secondary" onClick={() => handleInvalidate(defect)}>
                        Invalid Defect
                      </button>
                    </div>
                    {defectSuggestions[defect.id] && (
                      <ul className="suggestion-list">
                        {defectSuggestions[defect.id].map((item, index) => (
                          <li key={`${defect.id}-${index}`}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </details>
                ))}
              </div>
            )}
            <button onClick={handleConfirmDefects} className="primary-btn">
              Confirm Defect Report & Continue
            </button>
          </div>
        )}

        {workflowStep >= 6 && summary && (
          <div className="workflow-card" ref={summaryRef}>
            <h3>Test Summary Report</h3>
            <pre>{JSON.stringify(summary, null, 2)}</pre>
          </div>
        )}
      </section>

      {detailsRun && <RunDetails run={detailsRun} onClose={() => setDetailsRun(null)} />}

      <section className="card">
        <h2>Run History ({filteredRuns.length})</h2>

        <div className="filter-buttons">
          <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
            All
          </button>
          <button className={filter === "passed" ? "active" : ""} onClick={() => setFilter("passed")}>
            Passed
          </button>
          <button className={filter === "failed" ? "active" : ""} onClick={() => setFilter("failed")}>
            Failed
          </button>
          <button className={filter === "running" ? "active" : ""} onClick={() => setFilter("running")}>
            Running
          </button>
        </div>

        {filteredRuns.length === 0 ? (
          <p>No test runs found.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Run ID</th>
                <th>Project</th>
                <th>Status</th>
                <th>Started</th>
                <th>Finished</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRuns.map((run) => (
                <tr key={run.id}>
                  <td className="mono">{run.id.slice(0, 8)}</td>
                  <td>{run.projectId?.slice(0, 8)}</td>
                  <td>
                    <span className={`badge ${run.status}`}>{run.status || "In Progress"}</span>
                  </td>
                  <td>{formatDate(run.startedAt)}</td>
                  <td>{formatDate(run.finishedAt)}</td>
                  <td>
                    <button onClick={() => setDetailsRun(run)} className="link-btn">
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
