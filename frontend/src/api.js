// Thin fetch wrapper. All data comes from the TraceLine API; nothing is invented client-side.
const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `HTTP ${status}`);
    this.status = status;
    this.code = body?.error?.code;
  }
}

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json', 'X-Actor': 'investigator' }, ...opts });
  const type = res.headers.get('content-type') || '';
  const body = type.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, body);
  return body;
}

const q = (o = {}) => {
  const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  dashboard: () => req('/dashboard'),
  cases: () => req('/cases'),
  case: (id) => req(`/cases/${id}`),
  evidence: (id) => req(`/cases/${id}/evidence`),
  actors: (id) => req(`/cases/${id}/actors`),
  scenarios: (id) => req(`/cases/${id}/reconstruction/scenarios`),
  buildScenario: (id, body) => req(`/cases/${id}/reconstruction/scenarios`, { method: 'POST', body: JSON.stringify(body) }),
  timeline: (id, scenario) => req(`/cases/${id}/timeline${q({ scenario_id: scenario })}`),
  summary: (eventId) => req(`/events/${eventId}/summary`),
  contradictions: (id, s) => req(`/cases/${id}/contradictions${q({ scenario_id: s })}`),
  corroborations: (id, s) => req(`/cases/${id}/corroborations${q({ scenario_id: s })}`),
  gaps: (id, s) => req(`/cases/${id}/gaps${q({ scenario_id: s })}`),
  findings: (id, s) => req(`/cases/${id}/findings${q({ scenario_id: s })}`),
  review: (fid, status) => req(`/findings/${fid}`, { method: 'PATCH', body: JSON.stringify({ review_status: status }) }),
  trajectories: (id, s, frame) => req(`/cases/${id}/trajectories${q({ scenario_id: s, frame })}`),
  seek: (id, ms, s) => req(`/cases/${id}/seek${q({ case_ms: ms, scenario_id: s })}`),
  overlays: (evId, from, to) => req(`/evidence/${evId}/overlays${q({ from_ms: from, to_ms: to })}`),
  sensorRecords: (evId, from, to) => req(`/evidence/${evId}/sensor-records${q({ limit: 5000, from_ms: from, to_ms: to, fields: 'speed,accel_long,heading' })}`),
  event: (id) => req(`/events/${id}`),
  frames: (evId, from, to) => req(`/evidence/${evId}/frames${q({ from_ms: from, to_ms: to, sampled: false, limit: 30 })}`),
  statement: (id) => req(`/statements/${id}`),
  statements: (witnessId) => req(`/witnesses/${witnessId}/statements`),
  report: (id, scenario) => req(`/cases/${id}/reports`, { method: 'POST', body: JSON.stringify({ scenario_id: scenario || null }) }),
  reportById: (rid) => req(`/reports/${rid}`),
  witnesses: (id) => req(`/cases/${id}/witnesses`),
  claims: (stId) => req(`/statements/${stId}/claims`),
  reports: (id) => req(`/cases/${id}/reports`),
  reportMd: (rid) => req(`/reports/${rid}/markdown`),
  createCase: (body) => req('/cases', { method: 'POST', body: JSON.stringify(body) }),
  upload: async (caseId, file, kind, synthetic) => {
    const fd = new FormData();
    fd.append('file', file); fd.append('kind', kind); fd.append('synthetic', String(synthetic));
    const res = await fetch(`${BASE}/cases/${caseId}/evidence`, { method: 'POST', body: fd, headers: { 'X-Actor': 'investigator' } });
    const body = await res.json();
    if (!res.ok) throw new ApiError(res.status, body);
    return body;
  },
  jobs: (id) => req(`/cases/${id}/jobs`),
  addWitness: (id, label) => req(`/cases/${id}/witnesses`, { method: 'POST', body: JSON.stringify({ label }) }),
  addStatement: (wid, text, synthetic) => req(`/witnesses/${wid}/statements`, { method: 'POST', body: JSON.stringify({ text, synthetic }) }),
  fullFrameUrl: (frameId) => `${BASE}/frames/${frameId}/image?full=true`,
  streamUrl: (evId) => `${BASE}/evidence/${evId}/stream`,
  pdfUrl: (rid) => `${BASE}/reports/${rid}/pdf`,
};
