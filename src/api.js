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
  setLeaderboardVisibility: (eventId, visible) => request(`/api/admin/events/${eventId}/leaderboard-visibility`, { method: 'POST', body: JSON.stringify({ visible }) }),

  // Admin - Teams (God mode)
  addTeam: (eventId, body) => request(`/api/admin/events/${eventId}/teams`, { method: 'POST', body: JSON.stringify(body) }),
  bulkImport: (eventId, rows) => request(`/api/admin/events/${eventId}/teams/bulk`, { method: 'POST', body: JSON.stringify({ rows }) }),
  overrideScore: (eventId, teamId, body) => request(`/api/admin/events/${eventId}/teams/${teamId}/override`, { method: 'POST', body: JSON.stringify(body) }),
  unlockTeam: (eventId, teamId) => request(`/api/admin/events/${eventId}/teams/${teamId}/unlock`, { method: 'POST', body: JSON.stringify({}) }),

  // Admin - Sponsors
  getSponsors: (eventId) => request(`/api/admin/events/${eventId}/sponsors`),
  addSponsor: (eventId, body) => request(`/api/admin/events/${eventId}/sponsors`, { method: 'POST', body: JSON.stringify(body) }),
  deleteSponsor: (eventId, sponsorId) => request(`/api/admin/events/${eventId}/sponsors/${sponsorId}`, { method: 'DELETE' }),

  // Public - Scoring
  getScoreContext: (token) => request(`/api/score/${token}/context`),
  submitScore: (token, body) => request(`/api/score/${token}/hole`, { method: 'POST', body: JSON.stringify(body) }),
  submitFinal: (token) => request(`/api/score/${token}/submit`, { method: 'POST', body: JSON.stringify({}) }),

  // Public - Leaderboard
  getLeaderboard: (orgSlug, eventSlug) => request(`/api/public/org/${orgSlug}/event/${eventSlug}/leaderboard`),
  getPublicSponsors: (orgSlug, eventSlug) => request(`/api/public/org/${orgSlug}/event/${eventSlug}/sponsors`),
};
