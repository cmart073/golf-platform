const BASE = '';

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

export const api = {
  // Admin - Orgs
  getOrgs: () => request('/api/admin/orgs'),
  createOrg: (body) => request('/api/admin/orgs', { method: 'POST', body: JSON.stringify(body) }),

  // Admin - Courses
  getCourses: (orgId) => request(`/api/admin/orgs/${orgId}/courses`),
  createCourse: (orgId, body) => request(`/api/admin/orgs/${orgId}/courses`, { method: 'POST', body: JSON.stringify(body) }),

  // Admin - Events
  getEvents: (orgId) => request(`/api/admin/orgs/${orgId}/events`),
  createEvent: (orgId, body) => request(`/api/admin/orgs/${orgId}/events`, { method: 'POST', body: JSON.stringify(body) }),
  getEvent: (eventId) => request(`/api/admin/events/${eventId}`),
  updateStatus: (eventId, status) => request(`/api/admin/events/${eventId}/status`, { method: 'POST', body: JSON.stringify({ status }) }),

  // Admin - Teams
  addTeam: (eventId, body) => request(`/api/admin/events/${eventId}/teams`, { method: 'POST', body: JSON.stringify(body) }),
  bulkImport: (eventId, rows) => request(`/api/admin/events/${eventId}/teams/bulk`, { method: 'POST', body: JSON.stringify({ rows }) }),

  // Public - Scoring
  getScoreContext: (token) => request(`/api/score/${token}/context`),
  submitScore: (token, body) => request(`/api/score/${token}/hole`, { method: 'POST', body: JSON.stringify(body) }),
};
