import { useEffect, useState } from "react";
import { getProjects } from "../api";

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const p = await getProjects();
        setProjects(p);

        const passedCount = p.length;
        const totalRuns = p.reduce((sum) => sum + 1, 0);

        setStats({
          totalProjects: p.length,
          totalRuns,
          successRate: passedCount > 0 ? ((passedCount / totalRuns) * 100).toFixed(1) : 0
        });
      } catch (error) {
        console.error("Failed to load projects", error);
      }
    }

    load();
  }, []);

  return (
    <div className="page-content">
      <h1>Dashboard</h1>
      <p>Welcome to QA Engineer Command Center</p>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats?.totalProjects || 0}</div>
          <div className="stat-label">Projects Uploaded</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.totalRuns || 0}</div>
          <div className="stat-label">Total Test Runs</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.successRate || 0}%</div>
          <div className="stat-label">Success Rate</div>
        </div>
      </div>

      <section className="card">
        <h2>Recent Projects</h2>
        {projects.length === 0 ? (
          <p>No projects uploaded yet. <a href="/upload">Upload one now</a></p>
        ) : (
          <ul className="project-list">
            {projects.slice(0, 5).map((project) => (
              <li key={project.id}>
                <span className="project-name">{project.name}</span>
                <span className="project-meta">{project.sourceType}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Getting Started</h2>
        <ol>
          <li>Configure your database in <strong>Settings</strong></li>
          <li>Upload a project in <strong>Upload Project</strong></li>
          <li>Run automated tests across Jest, Newman, Playwright, and JMeter</li>
          <li>View results and download reports in <strong>Test History</strong></li>
        </ol>
      </section>
    </div>
  );
}
