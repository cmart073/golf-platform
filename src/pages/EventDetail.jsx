import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api';

function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

/* ── Sponsor management ── */
function SponsorSection({ eventId, sponsors: initialSponsors, onUpdate }) {
  const [sponsors, setSponsors] = useState(initialSponsors || []);
  const [logoUrl, setLogoUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => { setSponsors(initialSponsors || []); }, [initialSponsors]);

  const handleAdd = async () => {
    if (!logoUrl.trim()) return;
    setAdding(true);
    try {
      await api.addSponsor(eventId, { logo_url: logoUrl, display_order: sponsors.length, link_url: linkUrl || undefined });
      setLogoUrl(''); setLinkUrl('');
      onUpdate();
    } catch (e) { alert(e.message); }
    finally { setAdding(false); }
  };

  const handleDelete = async (sponsorId) => {
    try { await api.deleteSponsor(eventId, sponsorId); onUpdate(); }
    catch (e) { alert(e.message); }
  };

  return (
    <div className="card god-card" style={{ marginBottom: '1.5rem' }}>
      <h2>🎯 Sponsors</h2>
      {sponsors.length === 0 ? (
        <div className="empty-state" style={{ marginBottom: '1rem' }}>No sponsors yet.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          {sponsors.map(sp => (
            <div key={sp.id} className="sponsor-card">
              <img src={sp.logo_url} alt="Sponsor" onError={(e) => { e.target.style.display = 'none'; }} />
              <button className="sponsor-delete" onClick={() => handleDelete(sp.id)} title="Remove">✕</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '2 1 200px' }}>
          <label className="input-label">Logo Image URL *</label>
          <input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://example.com/logo.png" className="input" />
        </div>
        <div style={{ flex: '1 1 150px' }}>
          <label className="input-label">Link URL</label>
          <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://sponsor.com" className="input" />
        </div>
        <button className="btn btn-primary" onClick={handleAdd} disabled={adding || !logoUrl.trim()}>
          {adding ? 'Adding...' : '+ Add'}
        </button>
      </div>
    </div>
  );
}

/* ── God Mode: Team Scorecard Editor ── */
function TeamScorecard({ team, holes, eventId, onUpdate, showToast }) {
  const [expanded, setExpanded] = useState(false);
  const [editHole, setEditHole] = useState(null);
  const [editVal, setEditVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  const holesEntered = Object.keys(team.scores || {}).length;
  const totalHoles = holes.length;
  const totalStrokes = Object.values(team.scores || {}).reduce((sum, s) => sum + (s.strokes || s), 0);
  const totalPar = holes.reduce((sum, h) => sum + h.par, 0);
  const parDone = Object.keys(team.scores || {}).reduce((sum, h) => {
    const hole = holes.find(x => x.hole_number === parseInt(h));
    return sum + (hole ? hole.par : 0);
  }, 0);
  const toPar = totalStrokes - parDone;

  const formatToPar = (v) => v === 0 ? 'E' : v > 0 ? `+${v}` : `${v}`;

  const handleSave = async (holeNum) => {
    const val = parseInt(editVal);
    if (isNaN(val) || val < 1 || val > 20) { showToast('Enter 1–20'); return; }
    setSaving(true);
    try {
      await api.overrideScore(eventId, team.id, { hole_number: holeNum, strokes: val });
      showToast(`Hole ${holeNum} → ${val} (admin override)`);
      setEditHole(null);
      setEditVal('');
      onUpdate();
    } catch (e) { showToast('Error: ' + e.message); }
    finally { setSaving(false); }
  };

  const handleUnlock = async () => {
    setUnlocking(true);
    try {
      await api.unlockTeam(eventId, team.id);
      showToast(`${team.team_name} unlocked`);
      onUpdate();
    } catch (e) { showToast('Error: ' + e.message); }
    finally { setUnlocking(false); }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const scoreUrl = `${origin}/score/${team.access_token}`;

  return (
    <div className={`god-team-card ${team.locked_at ? 'god-team-locked' : ''}`}>
      {/* Team header row */}
      <div className="god-team-header" onClick={() => setExpanded(!expanded)}>
        <div className="god-team-left">
          <span className="god-team-name">{team.team_name}</span>
          {team.locked_at && <span className="god-lock-badge">🔒 SUBMITTED</span>}
          {!team.locked_at && holesEntered === totalHoles && <span className="god-ready-badge">✓ ALL IN</span>}
        </div>
        <div className="god-team-right">
          <span className="god-stat">{holesEntered}/{totalHoles} holes</span>
          {holesEntered > 0 && (
            <span className={`god-topar ${toPar < 0 ? 'under' : toPar > 0 ? 'over' : 'even'}`}>
              {formatToPar(toPar)}
            </span>
          )}
          <span className="god-expand">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded: full scorecard + controls */}
      {expanded && (
        <div className="god-team-body">
          {/* Admin actions */}
          <div className="god-actions">
            {team.locked_at && (
              <button className="btn btn-sm btn-danger" onClick={handleUnlock} disabled={unlocking}>
                {unlocking ? 'Unlocking...' : '🔓 Unlock Team'}
              </button>
            )}
            <a href={scoreUrl} target="_blank" rel="noopener" className="btn btn-sm btn-secondary">
              📱 Open Score Page
            </a>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <QRCodeSVG value={scoreUrl} size={36} level="M" />
              <code style={{ fontSize: '0.65rem', color: 'var(--slate-400)' }}>{team.access_token.slice(0, 8)}</code>
            </div>
          </div>

          {/* Players */}
          {team.players && team.players.length > 0 && (
            <div className="god-players">
              {team.players.join(' · ')}
            </div>
          )}

          {/* Hole-by-hole scorecard */}
          <div className="god-scorecard">
            <table>
              <thead>
                <tr>
                  <th>Hole</th>
                  {holes.map(h => <th key={h.hole_number} className="god-hole-th">{h.hole_number}</th>)}
                  <th className="god-total-th">TOT</th>
                </tr>
              </thead>
              <tbody>
                <tr className="god-par-row">
                  <td>Par</td>
                  {holes.map(h => <td key={h.hole_number}>{h.par}</td>)}
                  <td className="god-total-td">{totalPar}</td>
                </tr>
                <tr className="god-score-row">
                  <td>Score</td>
                  {holes.map(h => {
                    const sc = team.scores?.[h.hole_number];
                    const strokes = sc ? (sc.strokes || sc) : null;
                    const isEditing = editHole === h.hole_number;
                    const diff = strokes ? strokes - h.par : null;

                    return (
                      <td key={h.hole_number}
                        className={`god-score-cell ${diff !== null ? (diff < 0 ? 'birdie' : diff > 0 ? 'bogey' : 'par-score') : 'empty'}`}
                      >
                        {isEditing ? (
                          <div className="god-edit-cell">
                            <input
                              type="number" min="1" max="20"
                              value={editVal}
                              onChange={e => setEditVal(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSave(h.hole_number);
                                if (e.key === 'Escape') { setEditHole(null); setEditVal(''); }
                              }}
                              autoFocus
                              className="god-edit-input"
                            />
                            <div className="god-edit-actions">
                              <button onClick={() => handleSave(h.hole_number)} disabled={saving} className="god-save-btn">✓</button>
                              <button onClick={() => { setEditHole(null); setEditVal(''); }} className="god-cancel-btn">✕</button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="god-score-val"
                            onClick={() => { setEditHole(h.hole_number); setEditVal(strokes ? String(strokes) : ''); }}
                            title="Click to edit (admin override)"
                          >
                            {strokes || '–'}
                            {sc?.updated_by === 'admin' && <span className="god-admin-dot" title="Admin override">●</span>}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="god-total-td god-total-score">{totalStrokes || '–'}</td>
                </tr>
                <tr className="god-diff-row">
                  <td>+/−</td>
                  {holes.map(h => {
                    const sc = team.scores?.[h.hole_number];
                    const strokes = sc ? (sc.strokes || sc) : null;
                    const diff = strokes ? strokes - h.par : null;
                    return (
                      <td key={h.hole_number} className={diff !== null ? (diff < 0 ? 'under' : diff > 0 ? 'over' : 'even') : ''}>
                        {diff !== null ? (diff === 0 ? 'E' : diff > 0 ? `+${diff}` : diff) : ''}
                      </td>
                    );
                  })}
                  <td className={`god-total-td ${toPar < 0 ? 'under' : toPar > 0 ? 'over' : 'even'}`}>
                    {holesEntered > 0 ? formatToPar(toPar) : ''}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main Page ── */
export default function EventDetail() {
  const { eventId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [teamName, setTeamName] = useState('');
  const [players, setPlayers] = useState('');
  const [addingTeam, setAddingTeam] = useState(false);

  const [bulkText, setBulkText] = useState('');
  const [importing, setImporting] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  const [toast, setToast] = useState('');

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const load = useCallback(async () => {
    try {
      const d = await api.getEvent(eventId);
      setData(d);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh when live
  useEffect(() => {
    if (!data || data.event.status !== 'live') return;
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [data, load]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const handleAddTeam = async () => {
    if (!teamName.trim()) return;
    setAddingTeam(true);
    try {
      const playerList = players.split(',').map(p => p.trim()).filter(Boolean);
      await api.addTeam(eventId, { team_name: teamName.trim(), players: playerList.length > 0 ? playerList : undefined });
      setTeamName(''); setPlayers('');
      showToast('Team added');
      load();
    } catch (e) { showToast('Error: ' + e.message); }
    finally { setAddingTeam(false); }
  };

  const handleBulkImport = async () => {
    if (!bulkText.trim()) return;
    setImporting(true);
    try {
      const result = await api.bulkImport(eventId, bulkText);
      setBulkText(''); setShowBulk(false);
      showToast(`Imported ${result.count} teams`);
      load();
    } catch (e) { showToast('Error: ' + e.message); }
    finally { setImporting(false); }
  };

  const handleStatusChange = async (status) => {
    const confirm_msg = status === 'completed'
      ? 'Lock & complete this event? Teams will no longer be able to edit scores.'
      : status === 'live'
      ? 'Set event to LIVE? Teams will be able to enter scores.'
      : null;
    if (confirm_msg && !window.confirm(confirm_msg)) return;
    try {
      await api.updateStatus(eventId, status);
      showToast(`Event → ${status.toUpperCase()}`);
      load();
    } catch (e) { showToast('Error: ' + e.message); }
  };

  const handleLeaderboardToggle = async (visible) => {
    try {
      await api.setLeaderboardVisibility(eventId, visible);
      showToast(visible ? 'Leaderboard visible' : 'Leaderboard hidden');
      load();
    } catch (e) { showToast('Error: ' + e.message); }
  };

  if (loading) return <div className="page-shell"><div className="loading">Loading...</div></div>;
  if (error) return <div className="page-shell"><div className="card" style={{ color: 'var(--red-500)' }}>{error}</div></div>;
  if (!data) return null;

  const { event, holes, teams, sponsors, org } = data;
  const totalPar = holes.reduce((sum, h) => sum + h.par, 0);
  const lbVisible = event.leaderboard_visible === 1 || event.leaderboard_visible === true;
  const publicBase = org ? `${origin}/o/${org.slug}/e/${event.slug}` : null;

  const teamsSubmitted = teams.filter(t => t.locked_at).length;
  const teamsWithAllHoles = teams.filter(t => Object.keys(t.scores || {}).length === holes.length).length;

  return (
    <div className="page-shell">
      <div className="breadcrumb">
        <Link to="/admin">Admin</Link> / <Link to={`/admin/org/${event.org_id}`}>Org</Link> / Event
      </div>

      {/* Event header */}
      <div className="page-header">
        <div>
          <h1>{event.name}</h1>
          <div style={{ color: 'var(--slate-500)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            {event.holes} holes · Par {totalPar} {event.date && `· ${event.date}`}
          </div>
        </div>
        <StatusBadge status={event.status} />
      </div>

      {/* Stats bar */}
      <div className="god-stats-bar">
        <div className="god-stats-item">
          <div className="god-stats-num">{teams.length}</div>
          <div className="god-stats-label">Teams</div>
        </div>
        <div className="god-stats-item">
          <div className="god-stats-num">{teamsWithAllHoles}</div>
          <div className="god-stats-label">All Holes In</div>
        </div>
        <div className="god-stats-item">
          <div className="god-stats-num">{teamsSubmitted}</div>
          <div className="god-stats-label">Submitted</div>
        </div>
        <div className="god-stats-item">
          <div className="god-stats-num">{teams.length - teamsSubmitted}</div>
          <div className="god-stats-label">Still Playing</div>
        </div>
      </div>

      {/* Controls */}
      <div className="card god-card" style={{ marginBottom: '1.5rem' }}>
        <h2>⚡ Event Controls</h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {event.status === 'draft' && (
            <button className="btn btn-primary" onClick={() => handleStatusChange('live')}>▶ Go LIVE</button>
          )}
          {event.status === 'live' && (
            <button className="btn btn-danger" onClick={() => handleStatusChange('completed')}>🔒 Lock & Complete</button>
          )}
          {event.status === 'completed' && (
            <button className="btn btn-secondary" onClick={() => handleStatusChange('live')}>↩ Reopen Event</button>
          )}
          <div style={{ borderLeft: '1px solid var(--slate-200)', margin: '0 0.25rem' }} />
          {lbVisible ? (
            <button className="btn btn-secondary" onClick={() => handleLeaderboardToggle(false)}>🙈 Hide Leaderboard</button>
          ) : (
            <button className="btn btn-primary" onClick={() => handleLeaderboardToggle(true)}>👁 Show Leaderboard</button>
          )}
        </div>

        {/* Public Links */}
        {publicBase && (
          <div className="god-public-links">
            <div className="god-public-links-label">PUBLIC LINKS</div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
              <a href={`${publicBase}/leaderboard`} target="_blank" rel="noopener">📊 Leaderboard</a>
              <a href={`${publicBase}/tv`} target="_blank" rel="noopener">📺 TV Mode</a>
            </div>
          </div>
        )}
      </div>

      {/* Hole Pars */}
      <div className="card god-card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem' }}>Hole Pars</h2>
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          {holes.map(h => (
            <div key={h.hole_number} className="god-par-chip">
              <div className="god-par-hole">{h.hole_number}</div>
              <div className="god-par-val">{h.par}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sponsors */}
      <SponsorSection eventId={eventId} sponsors={sponsors} onUpdate={load} />

      {/* Teams — God Mode */}
      <div className="card god-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 style={{ margin: 0 }}>👥 Teams ({teams.length})</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowBulk(!showBulk)}>
              {showBulk ? 'Hide Bulk' : '📋 Bulk Import'}
            </button>
            <Link to={`/admin/event/${eventId}/qr-pack`} className="btn btn-secondary btn-sm">
              🖨 QR Pack
            </Link>
          </div>
        </div>

        {/* Add single team */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <input placeholder="Team name" value={teamName} onChange={e => setTeamName(e.target.value)}
            className="input" style={{ flex: '1 1 180px' }}
            onKeyDown={e => e.key === 'Enter' && handleAddTeam()} />
          <input placeholder="Players (comma separated)" value={players} onChange={e => setPlayers(e.target.value)}
            className="input" style={{ flex: '2 1 280px' }}
            onKeyDown={e => e.key === 'Enter' && handleAddTeam()} />
          <button className="btn btn-primary" onClick={handleAddTeam} disabled={addingTeam || !teamName.trim()}>
            {addingTeam ? 'Adding...' : '+ Add'}
          </button>
        </div>

        {/* Bulk import */}
        {showBulk && (
          <div className="god-bulk-area">
            <div style={{ fontSize: '0.8rem', color: 'var(--slate-500)', marginBottom: '0.5rem' }}>
              One team per line: <code>Team Name, Player1, Player2, Player3, Player4</code>
            </div>
            <textarea rows={6} value={bulkText} onChange={e => setBulkText(e.target.value)}
              placeholder={"Eagles, John Smith, Jane Doe, Bob Wilson, Alice Brown\nBirdies, Tom Jones, Sarah Lee"}
              className="god-bulk-textarea" />
            <button className="btn btn-primary btn-sm" onClick={handleBulkImport}
              disabled={importing || !bulkText.trim()} style={{ marginTop: '0.5rem' }}>
              {importing ? 'Importing...' : 'Import Teams'}
            </button>
          </div>
        )}

        {/* Team scorecards */}
        {teams.length === 0 ? (
          <div className="empty-state">No teams yet.</div>
        ) : (
          <div className="god-teams-list">
            {teams.map(t => (
              <TeamScorecard key={t.id} team={t} holes={holes} eventId={eventId} onUpdate={load} showToast={showToast} />
            ))}
          </div>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
