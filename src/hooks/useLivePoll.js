import { useEffect, useRef, useState, useCallback } from 'react';

// useLivePoll(fetchFn, options)
//
// Drop-in replacement for the V1 setInterval(fetchData, 10000) pattern.
// Adds:
//   - Visibility pause: stops polling when the tab is hidden, polls
//     once immediately on tab return.
//   - Online pause: stops polling while navigator.onLine === false.
//   - Exponential backoff on consecutive failures (configurable).
//   - Last-success / last-error / staleness state for the UI.
//
// fetchFn must return a Promise. It's called with no arguments. On
// success the resolved value is stored as `data`. On error the error
// is stored and the next attempt is delayed.
//
// Returns: {
//   data, error, loading,
//   lastSuccessAt: Date|null,
//   isStale: boolean,    // older than staleThresholdMs
//   isOffline: boolean,
//   refresh: () => void, // force a fetch now
// }

const DEFAULTS = {
  intervalMs: 5000,
  staleThresholdMs: 30000,
  maxBackoffMs: 30000,
};

export function useLivePoll(fetchFn, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastSuccessAt, setLastSuccessAt] = useState(null);
  const [isStale, setIsStale] = useState(false);
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);

  const failuresRef = useRef(0);
  const timerRef = useRef(null);
  const inFlightRef = useRef(false);
  const fnRef = useRef(fetchFn);
  fnRef.current = fetchFn;

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const schedule = useCallback((delayMs) => {
    clearTimer();
    timerRef.current = setTimeout(tick, delayMs);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // tick is recreated each call but always reads from fnRef so callers can
  // change fetchFn without us tearing down the polling loop.
  function tick() {
    if (typeof document !== 'undefined' && document.hidden) {
      // Reschedule a check shortly; visibilitychange handler will fire when tab returns.
      schedule(opts.intervalMs);
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      schedule(opts.intervalMs);
      return;
    }
    if (inFlightRef.current) {
      schedule(opts.intervalMs);
      return;
    }
    inFlightRef.current = true;
    Promise.resolve().then(() => fnRef.current()).then(
      (result) => {
        setData(result);
        setError(null);
        setLastSuccessAt(new Date());
        failuresRef.current = 0;
        setLoading(false);
        schedule(opts.intervalMs);
      },
      (err) => {
        setError(err);
        setLoading(false);
        failuresRef.current += 1;
        const backoff = Math.min(opts.intervalMs * Math.pow(2, failuresRef.current - 1), opts.maxBackoffMs);
        schedule(backoff);
      },
    ).finally(() => { inFlightRef.current = false; });
  }

  const refresh = useCallback(() => {
    clearTimer();
    failuresRef.current = 0;
    tick();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    tick();
    return clearTimer;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Visibility + online listeners
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVis = () => { if (!document.hidden) refresh(); };
    const onOnline = () => { setIsOffline(false); refresh(); };
    const onOffline = () => { setIsOffline(true); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refresh]);

  // Staleness ticker — re-evaluate every second so the "X seconds ago"
  // label and the stale warning update without needing a fetch to land.
  useEffect(() => {
    const id = setInterval(() => {
      if (!lastSuccessAt) { setIsStale(false); return; }
      const ageMs = Date.now() - lastSuccessAt.getTime();
      setIsStale(ageMs > opts.staleThresholdMs);
    }, 1000);
    return () => clearInterval(id);
  }, [lastSuccessAt, opts.staleThresholdMs]);

  return { data, error, loading, lastSuccessAt, isStale, isOffline, refresh };
}

// formatRelativeAgo(date) — "just now", "12s ago", "3m ago".
export function formatRelativeAgo(date) {
  if (!date) return '—';
  const sec = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  return `${hr}h ago`;
}
