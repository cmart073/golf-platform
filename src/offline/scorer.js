// High-level helpers used by ScoreEntry.jsx and MatchScorer.jsx.
//
// submitTeamHole({ accessToken, hole_number, strokes }) and
// submitMatchHole({ scorerToken, hole_number, scores }) try the live
// endpoint first. On network failure (or when navigator.onLine is false)
// they enqueue the request for background sync and resolve with
// { queued: true } so the UI can render an optimistic "saved" state.
//
// Successful live writes also kick the sync worker once so any prior
// queued entries get a chance to drain on the same network blip.

import { api } from '../api';
import { enqueue, notify } from './queue.js';
import { registerSyncHandler, syncOnce } from './sync.js';

registerSyncHandler('team_hole', async (payload) => {
  const { accessToken, hole_number, strokes } = payload;
  await api.submitScore(accessToken, { hole_number, strokes });
});

registerSyncHandler('match_hole', async (payload) => {
  const { scorerToken, hole_number, scores } = payload;
  await api.submitMatchHole(scorerToken, { hole_number, scores });
});

function isNetworkError(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  // fetch() throws TypeError on transport failure (DNS, no connection, CORS pre-flight).
  if (err?.name === 'TypeError') return true;
  // Our request() helper wraps these into Error('Request failed: 500 …') for HTTP errors;
  // anything without a status-prefixed message we treat as a network blip too.
  const m = /^Request failed: (\d+)/.exec(err?.message || '');
  if (!m) return true;
  const code = Number(m[1]);
  // 5xx and gateway-timeout-like → retryable; 4xx (other than 408/425/429) → caller error.
  return code >= 500 || [408, 425, 429].includes(code);
}

export async function submitTeamHole({ accessToken, hole_number, strokes }) {
  try {
    const res = await api.submitScore(accessToken, { hole_number, strokes });
    syncOnce();
    return { synced: true, response: res };
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    await enqueue({
      type: 'team_hole',
      dedup_key: `team_hole:${accessToken}:${hole_number}`,
      payload: { accessToken, hole_number, strokes },
    });
    notify();
    return { queued: true, error: err };
  }
}

export async function submitMatchHole({ scorerToken, hole_number, scores }) {
  try {
    const res = await api.submitMatchHole(scorerToken, { hole_number, scores });
    syncOnce();
    return { synced: true, response: res };
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    await enqueue({
      type: 'match_hole',
      dedup_key: `match_hole:${scorerToken}:${hole_number}`,
      payload: { scorerToken, hole_number, scores },
    });
    notify();
    return { queued: true, error: err };
  }
}
