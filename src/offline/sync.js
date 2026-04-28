// Sync worker: drains the offline queue against live API endpoints.
//
// Triggered by:
//   - window 'online' event
//   - manual call (e.g. after a successful foreground request)
//   - a 30s safety timer
//
// Coordination uses a single in-flight promise so concurrent triggers
// collapse to one drain. Per-entry retry uses exponential backoff capped
// at 60s, with a hard ceiling of 8 attempts before the entry is moved
// to status='failed' and surfaced in the UI for the user to clear.

import { listPending, markStatus, remove, notify } from './queue.js';

const MAX_ATTEMPTS = 8;
const BACKOFF_BASE = 2_000;   // 2s
const BACKOFF_CAP  = 60_000;  // 60s

const handlers = new Map();

// Register a sync handler for a queue entry type. The handler is called
// with the entry's payload and must return a Promise. Throwing a 4xx
// HTTP-shaped error (with .status set) lets the worker decide whether
// to give up (4xx, except 408/425/429) or retry (5xx + network).
export function registerSyncHandler(type, handler) {
  handlers.set(type, handler);
}

let inflight = null;

export function syncOnce() {
  if (inflight) return inflight;
  inflight = (async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const pending = await listPending();
    for (const entry of pending) {
      // Honor backoff: skip if last failure was too recent.
      if (entry.attempts > 0) {
        const wait = Math.min(BACKOFF_BASE * Math.pow(2, entry.attempts - 1), BACKOFF_CAP);
        if (Date.now() - entry.updated_at < wait) continue;
      }
      const handler = handlers.get(entry.type);
      if (!handler) continue;
      await markStatus(entry.id, 'syncing');
      try {
        await handler(entry.payload);
        await remove(entry.id);
        notify();
      } catch (e) {
        const status = e?.status || (typeof e?.message === 'string' && /^Request failed: (\d+)/.exec(e.message)?.[1]);
        const isFatal = status && status >= 400 && status < 500 && ![408, 425, 429].includes(Number(status));
        const next = isFatal || entry.attempts + 1 >= MAX_ATTEMPTS ? 'failed' : 'pending';
        await markStatus(entry.id, next, String(e?.message || e));
        notify();
      }
    }
  })().finally(() => { inflight = null; });
  return inflight;
}

let timer = null;
export function startSyncWorker() {
  if (typeof window === 'undefined') return () => {};
  const onOnline = () => syncOnce();
  window.addEventListener('online', onOnline);
  timer = setInterval(syncOnce, 30_000);
  // Run once at boot in case there are leftover entries from a prior session.
  syncOnce();
  return () => {
    window.removeEventListener('online', onOnline);
    if (timer) clearInterval(timer);
    timer = null;
  };
}
