const BASE = '';

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const contentType = res.headers.get('content-type') || '';
  let data = null;

  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Request failed: ${res.status} ${res.statusText}. Expected JSON but received ${contentType || 'unknown content type'}.`);
    }
    throw new Error(`Unexpected non-JSON response from ${path}: ${text.slice(0, 120)}`);
  }

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
  deleteEvent: (eventId) => request(`/api/admin/events/${eventId}`, { method: 'DELETE' }),
  getGameResults: (eventId) => request(`/api/admin/events/${eventId}/game-results`),
  updateStatus: (eventId, status) => request(`/api/admin/events/${eventId}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  setLeaderboardVisibility: (eventId, visible) => request(`/api/admin/events/${eventId}/leaderboard-visibility`, { method: 'POST', body: JSON.stringify({ visible }) }),
  updateGameSettings: (eventId, body) => request(`/api/admin/events/${eventId}/game-settings`, { method: 'POST', body: JSON.stringify(body) }),
  setGamePoint: (eventId, body) => request(`/api/admin/events/${eventId}/game-points`, { method: 'POST', body: JSON.stringify(body) }),
  cloneEvent: (eventId, body) => request(`/api/admin/events/${eventId}/clone`, { method: 'POST', body: JSON.stringify(body) }),
  patchEvent: (eventId, body) => request(`/api/admin/events/${eventId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  getAuditLog: (eventId, params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
    return request(`/api/admin/events/${eventId}/audit${qs ? '?' + qs : ''}`);
  },
  regenTeamToken: (eventId, teamId, body = {}) => request(`/api/admin/events/${eventId}/teams/${teamId}/regen-token`, { method: 'POST', body: JSON.stringify(body) }),
  regenScorerToken: (eventId, body = {}) => request(`/api/admin/events/${eventId}/regen-scorer-token`, { method: 'POST', body: JSON.stringify(body) }),
  getFormats: (selectedGames) => {
    const qs = selectedGames && selectedGames.length > 0
      ? `?games=${encodeURIComponent(selectedGames.join(','))}`
      : '';
    return request(`/api/admin/formats${qs}`);
  },

  // Admin - Teams (God mode)
  addTeam: (eventId, body) => request(`/api/admin/events/${eventId}/teams`, { method: 'POST', body: JSON.stringify(body) }),
  bulkImport: (eventId, rows) => request(`/api/admin/events/${eventId}/teams/bulk`, { method: 'POST', body: JSON.stringify({ rows }) }),
  overrideScore: (eventId, teamId, body) => request(`/api/admin/events/${eventId}/teams/${teamId}/override`, { method: 'POST', body: JSON.stringify(body) }),
  unlockTeam: (eventId, teamId) => request(`/api/admin/events/${eventId}/teams/${teamId}/unlock`, { method: 'POST', body: JSON.stringify({}) }),
  updateHandicap: (eventId, teamId, handicap_strokes) => request(`/api/admin/events/${eventId}/teams/${teamId}/handicap`, { method: 'POST', body: JSON.stringify({ handicap_strokes }) }),

  // Admin - Sponsors
  getSponsors: (eventId) => request(`/api/admin/events/${eventId}/sponsors`),
  addSponsor: (eventId, body) => request(`/api/admin/events/${eventId}/sponsors`, { method: 'POST', body: JSON.stringify(body) }),
  deleteSponsor: (eventId, sponsorId) => request(`/api/admin/events/${eventId}/sponsors/${sponsorId}`, { method: 'DELETE' }),

  // Public - Scoring (individual team)
  getScoreContext: (token) => request(`/api/score/${token}/context`),
  submitScore: (token, body) => request(`/api/score/${token}/hole`, { method: 'POST', body: JSON.stringify(body) }),
  submitFinal: (token) => request(`/api/score/${token}/submit`, { method: 'POST', body: JSON.stringify({}) }),
  setYourHole: (token, body) => request(`/api/score/${token}/your-hole`, { method: 'POST', body: JSON.stringify(body) }),
  logMulligan: (token, body) => request(`/api/score/${token}/mulligan`, { method: 'POST', body: JSON.stringify(body) }),

  // Admin - Jeff Martin (god mode)
  getJeffMartin: (eventId) => request(`/api/admin/events/${eventId}/jeff-martin`),
  setAdminYourHole: (eventId, body) => request(`/api/admin/events/${eventId}/jeff-martin/your-hole`, { method: 'POST', body: JSON.stringify(body) }),
  setAdminMulligan: (eventId, body) => request(`/api/admin/events/${eventId}/jeff-martin/mulligan`, { method: 'POST', body: JSON.stringify(body) }),

  // Public - Match Scorer (single scorecard for whole group)
  getMatchContext: (scorerToken) => request(`/api/score/match/${scorerToken}/context`),
  submitMatchHole: (scorerToken, body) => request(`/api/score/match/${scorerToken}/hole`, { method: 'POST', body: JSON.stringify(body) }),
  submitMatchBBB: (scorerToken, body) => request(`/api/score/match/${scorerToken}/bbb`, { method: 'POST', body: JSON.stringify(body) }),
  submitMatchWolf: (scorerToken, body) => request(`/api/score/match/${scorerToken}/wolf`, { method: 'POST', body: JSON.stringify(body) }),
  submitMatchPress: (scorerToken, body) => request(`/api/score/match/${scorerToken}/press`, { method: 'POST', body: JSON.stringify(body) }),

  // Admin - Bets (presses, multipliers, values)
  getBets: (eventId) => request(`/api/admin/events/${eventId}/bets`),
  manageBet: (eventId, body) => request(`/api/admin/events/${eventId}/bets`, { method: 'POST', body: JSON.stringify(body) }),

  // Public - Leaderboard
  getLeaderboard: (orgSlug, eventSlug) => request(`/api/public/org/${orgSlug}/event/${eventSlug}/leaderboard`),
  getPublicSponsors: (orgSlug, eventSlug) => request(`/api/public/org/${orgSlug}/event/${eventSlug}/sponsors`),
};
