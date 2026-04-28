import React, { useEffect, useState } from 'react';
import { listAll, subscribe, remove as removeEntry } from '../offline/queue.js';
import { syncOnce } from '../offline/sync.js';

// Small pill rendered on scorer pages. States, in order of severity:
//   • offline + queued       → "📡 Offline · N saved locally"
//   • online + queued        → "↻ Syncing N…"
//   • online + failed entries → "⚠ N didn't sync — tap to retry"
//   • online + idle          → "✓ All synced"  (auto-fades after 4s)
//   • brand new, no traffic  → renders nothing

export default function SyncStatusPill() {
  const [entries, setEntries] = useState([]);
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [showSynced, setShowSynced] = useState(false);
  const [hadActivity, setHadActivity] = useState(false);

  const refresh = async () => {
    try {
      const all = await listAll();
      setEntries(all);
      if (all.length > 0) setHadActivity(true);
      // Briefly flash "All synced" right after the queue drains.
      if (all.length === 0 && hadActivity) {
        setShowSynced(true);
        setTimeout(() => setShowSynced(false), 4000);
      }
    } catch { /* IDB may be unavailable; render nothing */ }
  };

  useEffect(() => {
    refresh();
    const unsub = subscribe(refresh);
    const onOnline  = () => { setOnline(true); refresh(); };
    const onOffline = () => { setOnline(false); refresh(); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const interval = setInterval(refresh, 5000);
    return () => {
      unsub();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(interval);
    };
  }, [hadActivity]);

  const failed = entries.filter((e) => e.status === 'failed');
  const pending = entries.filter((e) => e.status !== 'failed');

  let label = null;
  let color = '#475569';
  let bg = '#f1f5f9';

  if (!online && pending.length > 0) {
    label = `📡 Offline · ${pending.length} saved locally`;
    bg = '#fef3c7'; color = '#92400e';
  } else if (failed.length > 0) {
    label = `⚠ ${failed.length} didn't sync — tap to retry`;
    bg = '#fee2e2'; color = '#b91c1c';
  } else if (pending.length > 0) {
    label = `↻ Syncing ${pending.length}…`;
    bg = '#dbeafe'; color = '#1e40af';
  } else if (showSynced) {
    label = '✓ All synced';
    bg = '#dcfce7'; color = '#166534';
  } else if (!online && hadActivity) {
    label = '📡 Offline';
    bg = '#fef3c7'; color = '#92400e';
  }

  if (!label) return null;

  const handleClick = async () => {
    if (failed.length > 0) {
      // Retry: nudge each failed entry back to pending then drain.
      for (const e of failed) {
        try { await removeEntry(e.id); } catch {}
      }
    }
    syncOnce();
    refresh();
  };

  return (
    <button
      onClick={handleClick}
      style={{
        position: 'fixed', bottom: 16, right: 16, zIndex: 50,
        background: bg, color, border: 0, padding: '0.5rem 0.85rem',
        borderRadius: 999, fontSize: '0.85rem', fontWeight: 600,
        boxShadow: '0 2px 6px rgba(0,0,0,0.12)', cursor: 'pointer',
      }}
      title="Tap for details"
    >{label}</button>
  );
}
