// Tiny IndexedDB-backed queue for offline score submissions.
//
// Design goals:
//   - Survives page reload and tab close (used by scorers in spotty cell coverage).
//   - One IDB store per app — keyed-by-id with insertion order via auto-increment.
//   - No external deps; compact API surface (enqueue, list, mark, remove).
//   - Per-token "latest write wins" coalescing for { team_hole, match_hole }
//     so retrying an offline edit overwrites the prior queued value rather
//     than re-submitting both. Each entry also tracks a deterministic
//     dedup key (token + hole_number [+ team_id]) the sync worker uses
//     to coalesce on enqueue.
//
// Entry shape:
//   {
//     id,                       // auto-increment
//     type,                     // 'team_hole' | 'match_hole' | …
//     dedup_key,                // see above; undefined → never coalesce
//     payload,                  // arbitrary JSON describing the request
//     created_at,               // ms epoch — first time it was queued
//     updated_at,               // ms epoch — last coalesce / retry
//     attempts,                 // failed network attempts
//     last_error,               // string|null
//     status,                   // 'pending' | 'syncing' | 'failed'
//   }

const DB_NAME = 'golf-platform-offline';
const DB_VERSION = 1;
const STORE = 'submissions';

let dbPromise = null;

function openDb() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB not available'));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('dedup_key', 'dedup_key', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode = 'readonly') {
  return openDb().then((db) => {
    const t = db.transaction(STORE, mode);
    return { tx: t, store: t.objectStore(STORE) };
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Coalesce: if there's an existing pending entry with the same dedup_key,
// update its payload + updated_at instead of inserting a second row. This
// keeps the queue tight when a scorer rapidly edits the same hole offline.
export async function enqueue(entry) {
  const { store } = await tx('readwrite');
  const now = Date.now();
  const seed = {
    type: entry.type,
    dedup_key: entry.dedup_key,
    payload: entry.payload,
    created_at: now,
    updated_at: now,
    attempts: 0,
    last_error: null,
    status: 'pending',
  };
  if (entry.dedup_key) {
    const idx = store.index('dedup_key');
    const existing = await reqToPromise(idx.get(entry.dedup_key));
    if (existing && existing.status === 'pending') {
      existing.payload = seed.payload;
      existing.updated_at = now;
      existing.attempts = 0;
      existing.last_error = null;
      await reqToPromise(store.put(existing));
      return existing;
    }
  }
  const id = await reqToPromise(store.add(seed));
  return { id, ...seed };
}

export async function listAll() {
  const { store } = await tx('readonly');
  return reqToPromise(store.getAll());
}

export async function listPending() {
  const all = await listAll();
  return all
    .filter((e) => e.status !== 'failed')
    .sort((a, b) => a.created_at - b.created_at);
}

export async function markStatus(id, status, lastError = null) {
  const { store } = await tx('readwrite');
  const e = await reqToPromise(store.get(id));
  if (!e) return null;
  e.status = status;
  e.updated_at = Date.now();
  if (status === 'failed' || status === 'pending') {
    e.attempts = (e.attempts || 0) + (status === 'failed' ? 1 : 0);
  }
  if (lastError !== undefined) e.last_error = lastError;
  await reqToPromise(store.put(e));
  return e;
}

export async function remove(id) {
  const { store } = await tx('readwrite');
  await reqToPromise(store.delete(id));
}

export async function clearAll() {
  const { store } = await tx('readwrite');
  await reqToPromise(store.clear());
}

// Subscribe to in-process changes (queue mutations from this tab). The
// IDB events themselves are scoped per-connection, so we use a tiny
// EventTarget. The sync worker calls notify() after every state change.
const bus = new EventTarget();
export function notify() { bus.dispatchEvent(new Event('change')); }
export function subscribe(handler) {
  const fn = () => handler();
  bus.addEventListener('change', fn);
  return () => bus.removeEventListener('change', fn);
}
