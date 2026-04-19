import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:4200/api"
});

export async function uploadProject({ files, sourceType }) {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file, file.webkitRelativePath || file.name);
  }
  form.append("sourceType", sourceType || "mixed");

  const { data } = await api.post("/projects/upload", form, {
    headers: { "Content-Type": "multipart/form-data" }
  });

  return data.project;
}

export async function getProjects() {
  const { data } = await api.get("/projects");
  return data.projects;
}

export async function runTests(projectId, payload) {
  const { data } = await api.post(`/runs/project/${projectId}`, payload);
  return data.run;
}

export async function getRuns() {
  const { data } = await api.get("/runs");
  return data.runs;
}

export async function getRunLog(runId) {
  const { data } = await api.get(`/runs/${runId}/log`);
  return data;
}

export async function testDatabaseConnection(config) {
  const { data } = await api.post("/health/db", config);
  return data;
}

export function createLogStream(runId) {
  const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4200/api";
  return new EventSource(`${baseURL}/runs/${runId}/logs/stream`);
}

export async function downloadArtifacts(runId) {
  const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4200/api";
  window.location.href = `${baseURL}/runs/${runId}/artifacts/download`;
}

export async function detectProjectIntent(projectId) {
  const { data } = await api.post(`/ai/projects/${projectId}/intent`);
  return data;
}

export async function generateProjectPlan(projectId, intent) {
  const { data } = await api.post(`/ai/projects/${projectId}/plan`, { intent });
  return data;
}

export async function generateProjectTestCases(projectId, plan) {
  const { data } = await api.post(`/ai/projects/${projectId}/test-cases`, { plan });
  return data;
}

export async function getRunDefects(runId) {
  const { data } = await api.get(`/ai/runs/${runId}/defects`);
  return data;
}

export async function rerunFromDefect(runId, payload = {}) {
  const { data } = await api.post(`/ai/runs/${runId}/rerun`, payload);
  return data;
}

export async function suggestDefectFix(runId, defect) {
  const { data } = await api.post(`/ai/runs/${runId}/defects/suggest`, { defect });
  return data;
}

export async function invalidateDefect(runId, defectId) {
  const { data } = await api.post(`/ai/runs/${runId}/defects/invalidate`, { defectId });
  return data;
}

export async function fixDefectAndRerun(runId, defect, payload = {}) {
  const { data } = await api.post(`/ai/runs/${runId}/defects/fix-and-rerun`, { defect, ...payload });
  return data;
}

export async function getRunSummary(runId) {
  const { data } = await api.get(`/ai/runs/${runId}/summary`);
  return data;
}
