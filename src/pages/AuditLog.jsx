import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';

// Read-only audit log view for an event. Shows who changed what, when,
// and (optionally) why. Filters by entity type and actor. Empty state
// is rendered cleanly even when migration 0010 hasn't run yet — the
// API returns { entries: [], schema: 'pre-0010' } in that case.

const ACTOR_LABELS = {
  team: { label: 'Team', color: '#1e40af' },
  match_scorer: { label: 'Match Scorer', color: '#7c3aed' },
  admin: { label: 'Admin', color: '#b91c1c' },
  system: { label: 'System', color: '#475569' },
};

const ACTION_LABELS = {
  create: 'created',
  update: 'updated',
  delete: 'deleted',
  override: 'overrode',
  unlock: 'unlocked',
  set_status: 'set status',
  set_visibility: 'set visibility',
  regen_token: 'regenerated token',
};

function formatTimestamp(ts) {
  if (!ts) return '—';
  // D1 returns 'YYYY-MM-DD HH:MM:SS' (UTC); the JS APIs in the worker
  // also write ISO 'YYYY-MM-DDTHH:MM:SS.sssZ'. Normalize.
  const iso = ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleString();
  } catch { return ts; }
}

function describeChange(entry) {
  const t = entry.entity_type;
  if (t === 'score') {
    const before = entry.before?.strokes;
    const after = entry.after?.strokes;
    const hole = entry.after?.hole_number ?? entry.before?.hole_number;
    if (entry.action === 'create') return `Hole ${hole}: ${after} strokes (new)`;
    return `Hole ${hole}: ${before} → ${after} strokes`;
  }
  if (t === 'event' && entry.action === 'set_status') {
    return `${entry.before?.status} → ${entry.after?.status}`;
  }
  if (t === 'team' && entry.action === 'unlock') {
    return 'Team scorecard unlocked';
  }
  return `${ACTION_LABELS[entry.action] || entry.action} ${t}`;
}

export default function AuditLog() {
  const { eventId } = useParams();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [schema, setSchema] = useState(null);
  const [filterEntity, setFilterEntity] = useState('');
  const [filterActor, setFilterActor] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getAuditLog(eventId, {
        entity_type: filterEntity || undefined,
        actor: filterActor || undefined,
        limit: 500,
      });
      setEntries(res.entries || []);
      setSchema(res.schema || null);
      setError('');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [eventId, filterEntity, filterActor]);

  return (
    <div className="page-shell">
      <div className="breadcrumb">
        <Link to="/admin">Admin</Link> / <Link to={`/admin/event/${eventId}`}>Event</Link> / Audit log
      </div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Audit log</h1>
        <button className="btn btn-secondary btn-sm" onClick={load}>↻ Refresh</button>
      </div>

      {schema === 'pre-0010' && (
        <div className="card" style={{ borderLeft: '4px solid var(--amber-500, #f59e0b)' }}>
          The audit_log table doesn't exist yet on this database. Run migration 0010 to enable history capture.
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: '0.8rem' }}>Entity</label>
            <select value={filterEntity} onChange={(e) => setFilterEntity(e.target.value)}>
              <option value="">All</option>
              <option value="score">Score</option>
              <option value="team">Team</option>
              <option value="event">Event</option>
              <option value="wolf_pick">Wolf pick</option>
              <option value="game_point">Game point</option>
              <option value="sponsor">Sponsor</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: '0.8rem' }}>Actor</label>
            <select value={filterActor} onChange={(e) => setFilterActor(e.target.value)}>
              <option value="">All</option>
              <option value="team">Team</option>
              <option value="match_scorer">Match Scorer</option>
              <option value="admin">Admin</option>
              <option value="system">System</option>
            </select>
          </div>
        </div>

        {error && <div style={{ color: 'var(--red-500)' }}>{error}</div>}
        {loading ? <div className="loading">Loading…</div>
          : entries.length === 0 ? (
            <div className="empty-state">No audit entries match these filters.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ whiteSpace: 'nowrap' }}>When</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Change</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const a = ACTOR_LABELS[e.actor] || ACTOR_LABELS.system;
                    return (
                      <tr key={e.id}>
                        <td style={{ whiteSpace: 'nowrap', color: 'var(--slate-500)', fontSize: '0.85rem' }}>
                          {formatTimestamp(e.created_at)}
                        </td>
                        <td>
                          <span style={{
                            background: a.color + '15', color: a.color,
                            padding: '2px 8px', borderRadius: 4, fontSize: '0.8rem', fontWeight: 600,
                          }}>{a.label}</span>
                          {e.actor_label && <span style={{ marginLeft: 6, color: 'var(--slate-500)', fontSize: '0.8rem' }}>{e.actor_label}</span>}
                        </td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--slate-700)' }}>
                          {ACTION_LABELS[e.action] || e.action} <span style={{ color: 'var(--slate-500)' }}>{e.entity_type}</span>
                        </td>
                        <td>{describeChange(e)}</td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--slate-500)' }}>{e.reason || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}
