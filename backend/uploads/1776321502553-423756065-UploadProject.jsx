import { useEffect, useState } from "react";
import { getProjects, runTests, uploadProject } from "../api";

export default function UploadProject() {
  const [files, setFiles] = useState([]);
  const [sourceType, setSourceType] = useState("folder");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    async function load() {
      try {
        const p = await getProjects();
        setProjects(p);
      } catch (error) {
        console.error("Failed to load projects", error);
      }
    }
    load();
  }, []);

  async function handleUpload(event) {
    event.preventDefault();
    if (!files.length) {
      setMessage("Choose a file, folder, or zip before upload.");
      return;
    }

    setBusy(true);
    setMessage("Uploading project...");

    try {
      const project = await uploadProject({ files, sourceType });
      setMessage(`✓ Uploaded ${project.name}. Detecting project type and starting tests...`);
      const run = await runTests(project.id, {});
      setFiles([]);
      setMessage(
        `✓ Uploaded ${project.name} and started ${project.detection?.projectType || "auto-detected"} testing (run ${run.id.slice(0, 8)}).`
      );
      
      const p = await getProjects();
      setProjects(p);
    } catch (error) {
      setMessage(`✗ Upload failed: ${error.response?.data?.error || error.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-content">
      <h1>Upload Project</h1>

      <section className="card">
        <h2>Select Project Source</h2>
        <form onSubmit={handleUpload} className="uploadForm">
          <label className="field">
            Upload type
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
              <option value="folder">📁 Full Folder</option>
              <option value="zip">📦 ZIP File</option>
              <option value="files">📄 Individual Files</option>
            </select>
          </label>

          <div className="upload-input-wrapper">
            {sourceType === "folder" ? (
              <>
                <input
                  id="folder-input"
                  type="file"
                  multiple
                  webkitdirectory="true"
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                  style={{ display: "none" }}
                />
                <button type="button" onClick={() => document.getElementById("folder-input").click()}>
                  Choose Folder
                </button>
              </>
            ) : (
              <>
                <input
                  id="file-input"
                  type="file"
                  multiple
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                  style={{ display: "none" }}
                />
                <button type="button" onClick={() => document.getElementById("file-input").click()}>
                  Choose Files
                </button>
              </>
            )}
          </div>

          {files.length > 0 && (
            <div className="file-info">
              <strong>{files.length}</strong> file(s) selected
            </div>
          )}

          <button disabled={busy || !files.length} type="submit" className="primary-btn">
            {busy ? "Uploading..." : "Upload"}
          </button>
        </form>

        {message && <div className={`result ${message.startsWith("✓") ? "ok" : "bad"}`}>{message}</div>}

        <p className="hint">Supports Google Drive-like folder uploads, ZIP archives, or raw files.</p>
      </section>

      <section className="card">
        <h2>Uploaded Projects ({projects.length})</h2>
        {projects.length === 0 ? (
          <p>No projects uploaded yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Project Name</th>
                <th>Type</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td>{project.name}</td>
                  <td>{project.sourceType}</td>
                  <td>{new Date(project.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
