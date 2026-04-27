import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api';

function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

function gameLabel(key) {
  const labels = {
    stroke_play: '⛳ Stroke Play',
    match_play: '🥊 Match Play',
    skins: '🏆 Skins',
    bingo_bango_bongo: '🎲 Bingo Bango Bongo',
    nassau: '💰 Nassau',
    wolf: '🐺 Wolf',
    nine_points: '🎯 9 Points',
    jeff_martin: '🎖️ Jeff Martin',
    match_play_presses: '🥊 Match Play (Presses)',
    skins_presses: '🏆 Skins (Presses)',
  };
  return labels[key] ?? key.replaceAll('_', ' ');
}

function gameStat(game, row) {
  if (game === 'stroke_play') {
    const net = row.net_strokes;
    if (net === 0) return 'E';
    return net > 0 ? `+${net}` : `${net}`;
  }
  if (game === 'match_play' || game === 'nine_points' || game === 'jeff_martin') return `${row.points} pts`;
  if (game === 'skins') return `${row.skins_won} skin${row.skins_won !== 1 ? 's' : ''}`;
  if (game === 'bingo_bango_bongo') return `${row.points} pts`;
  return row.net_strokes ?? row.points ?? row.skins_won;
}

/* ── Handicap editor — controlled per-team ── */
function HandicapEditor({ teamId, initialValue, eventId, onSaved, showToast }) {
  const [val, setVal] = useState(String(initialValue ?? 0));

  const save = async () => {
    const n = parseInt(val);
    if (isNaN(n)) return;
    try {
      await api.updateHandicap(eventId, teamId, n);
      showToast('Handicap updated');
      onSaved();
    } catch (e) { showToast('Error: ' + e.message); }
  };

  return (
    <input
      type="number"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={save}
      style={{ width: 70 }}
    />
  );
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
function TeamScorecard({ team, holes, eventId, onUpdate, showToast, jmEnabled = false }) {
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

  // Jeff Martin: per-hole Stableford points with your-hole bonus
  const yourHoles = team.your_holes || {};
  const stablefordPoints = (diff) => {
    if (diff >= 2) return 0;
    if (diff === 1) return 1;
    if (diff === 0) return 2;
    if (diff === -1) return 3;
    if (diff === -2) return 4;
    if (diff === -3) return 5;
    return 6;
  };
  const jmPointsByHole = {};
  let jmTotal = 0;
  if (jmEnabled) {
    holes.forEach(h => {
      const sc = team.scores?.[h.hole_number];
      const strokes = sc ? (sc.strokes || sc) : null;
      if (strokes == null) return;
      const hasYH = yourHoles[h.hole_number] != null;
      const adj = hasYH ? strokes - 1 : strokes;
      const pts = stablefordPoints(adj - h.par);
      jmPointsByHole[h.hole_number] = { pts, hasYH };
      jmTotal += pts;
    });
  }

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

  const handleRegenToken = async () => {
    if (!confirm(`Regenerate the scorecard link for ${team.team_name}? The current link will stop working immediately.`)) return;
    try {
      await api.regenTeamToken(eventId, team.id);
      showToast(`${team.team_name} token regenerated`);
      onUpdate();
    } catch (e) { showToast('Error: ' + e.message); }
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
          {jmEnabled && holesEntered > 0 && (
            <span className="god-jm-badge" title="Jeff Martin — Stableford points">🎖️ {jmTotal}</span>
          )}
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
            <button className="btn btn-sm btn-secondary" onClick={handleRegenToken} title="Issue a new scorecard link; the old one stops working">
              ↻ New link
            </button>
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
                {jmEnabled && (
                  <tr className="god-jm-row">
                    <td title="Stableford points (Your-Hole bonus included)">JM Pts</td>
                    {holes.map(h => {
                      const cell = jmPointsByHole[h.hole_number];
                      if (!cell) return <td key={h.hole_number}></td>;
                      return (
                        <td key={h.hole_number}>
                          {cell.pts}
                          {cell.hasYH && <span className="god-yh-dot" title="Your hole bonus applied">●</span>}
                        </td>
                      );
                    })}
                    <td className="god-total-td god-jm-total">{holesEntered > 0 ? jmTotal : ''}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Jeff Martin admin panel (god mode) ── */
function JeffMartinAdminPanel({ eventId, holes, showToast }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.getJeffMartin(eventId);
      setState(d);
    } catch (e) { showToast('Error loading Jeff Martin: ' + e.message); }
    finally { setLoading(false); }
  }, [eventId, showToast]);

  useEffect(() => { load(); }, [load]);

  const setYourHole = async (teamId, holeNum, playerIndex) => {
    setBusy(true);
    try {
      await api.setAdminYourHole(eventId, { team_id: teamId, hole_number: holeNum, player_index: playerIndex });
      await load();
    } catch (e) { showToast('Error: ' + e.message); }
    finally { setBusy(false); }
  };

  const setMulligan = async (teamId, playerIndex, used_count, holes_used) => {
    setBusy(true);
    try {
      await api.setAdminMulligan(eventId, { team_id: teamId, player_index: playerIndex, used_count, holes_used });
      await load();
    } catch (e) { showToast('Error: ' + e.message); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="card god-card" style={{ marginBottom: '1.5rem' }}>Loading Jeff Martin state…</div>;
  if (!state) return null;

  const { teams, your_holes, mulligans } = state;
  const holeCount = (holes && holes.length) || state.event.holes || 18;

  return (
    <div className="card god-card" style={{ marginBottom: '1.5rem' }}>
      <h2>🎖️ Jeff Martin — Admin Override</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--slate-500)', marginTop: '-0.25rem', marginBottom: '1rem' }}>
        Set "your hole" ownership and adjust mulligan counts for any team. Changes bypass team/event locks.
      </p>
      {teams.length === 0 && <div className="empty-state">No teams yet.</div>}
      {teams.map(t => {
        const teamYourHoles = your_holes[t.id] || {};
        const teamMulligans = mulligans[t.id] || {};
        return (
          <div key={t.id} className="jm-admin-team">
            <div className="jm-admin-team-header">
              <strong>{t.team_name}</strong>
              <span className="jm-hint">{t.players.length} player{t.players.length === 1 ? '' : 's'}</span>
            </div>

            {t.players.length === 0 ? (
              <div className="empty-state" style={{ fontSize: '0.85rem' }}>
                No players on this team — add players to enable Jeff Martin tracking.
              </div>
            ) : (
              <>
                {/* Mulligan counts per player */}
                <div className="jm-admin-section">
                  <div className="jm-admin-section-label">Mulligans (2 per player per 6 holes)</div>
                  <div className="jm-admin-mulligans">
                    {t.players.map((p, i) => {
                      const m = teamMulligans[i] || { used_count: 0, holes_used: [] };
                      return (
                        <div key={i} className="jm-admin-mul-row">
                          <span className="jm-admin-mul-name">{p || `Player ${i + 1}`}</span>
                          <input
                            type="number" min="0" max="6"
                            value={m.used_count}
                            onChange={(e) => {
                              const n = Math.max(0, Math.min(6, parseInt(e.target.value) || 0));
                              setMulligan(t.id, i, n, m.holes_used);
                            }}
                            disabled={busy}
                            style={{ width: 60 }}
                            title="Mulligans used"
                          />
                          <span className="jm-hint">
                            {m.holes_used.length > 0 ? `holes ${m.holes_used.join(', ')}` : 'none logged'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Your-hole grid: one column per hole */}
                <div className="jm-admin-section">
                  <div className="jm-admin-section-label">"Your hole" picks by hole</div>
                  <div className="jm-admin-yh-grid">
                    {Array.from({ length: holeCount }, (_, i) => i + 1).map(h => {
                      const picked = teamYourHoles[h];
                      return (
                        <div key={h} className="jm-admin-yh-cell">
                          <div className="jm-admin-yh-hole">H{h}</div>
                          <select
                            value={picked ?? ''}
                            onChange={(e) => {
                              const v = e.target.value === '' ? null : parseInt(e.target.value);
                              setYourHole(t.id, h, v);
                            }}
                            disabled={busy}
                            className="jm-admin-yh-select"
                          >
                            <option value="">—</option>
                            {t.players.map((p, i) => (
                              <option key={i} value={i}>{p || `P${i + 1}`}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })}
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
  const [teamHandicap, setTeamHandicap] = useState(0);

  const [bulkText, setBulkText] = useState('');
  const [importing, setImporting] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  const [toast, setToast] = useState('');
  const [gameResults, setGameResults] = useState({});
  const [eventType, setEventType] = useState('tournament');
  const [enabledGames, setEnabledGames] = useState(['stroke_play']);
  const [jmShowMulligans, setJmShowMulligans] = useState(true);
  const [gamePointTeam, setGamePointTeam] = useState('');
  const [gamePointHole, setGamePointHole] = useState(1);
  const [gamePointType, setGamePointType] = useState('bingo');
  const [gamePointValue, setGamePointValue] = useState(1);

  const toggleGame = (key, checked) => {
    setEnabledGames((prev) => {
      const current = new Set(prev);
      if (checked) current.add(key);
      else current.delete(key);

      if (key === 'stroke_play' && checked) current.delete('match_play');
      if (key === 'match_play' && checked) current.delete('stroke_play');

      if (key === 'bingo_bango_bongo') {
        if (checked) {
          current.add('bingo');
          current.add('bango');
          current.add('bongo');
        } else {
          current.delete('bingo');
          current.delete('bango');
          current.delete('bongo');
        }
      }
      return Array.from(current);
    });
  };

  const hasBBB = ['bingo', 'bango', 'bongo'].every((g) => enabledGames.includes(g));

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const load = useCallback(async () => {
    try {
      const [d, g] = await Promise.all([api.getEvent(eventId), api.getGameResults(eventId)]);
      setData(d);
      setGameResults(g.results || {});
      setEventType(d.event.event_type || 'tournament');
      // 1 (or null/undefined for legacy events pre-migration) → visible; 0 → hidden
      setJmShowMulligans(d.event.jm_show_mulligans === 0 ? false : true);
      try {
        const parsed = JSON.parse(d.event.enabled_games_json || '["stroke_play"]');
        setEnabledGames(Array.isArray(parsed) && parsed.length > 0 ? parsed : ['stroke_play']);
      } catch {
        setEnabledGames(['stroke_play']);
      }
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
      await api.addTeam(eventId, {
        team_name: teamName.trim(),
        players: playerList.length > 0 ? playerList : undefined,
        handicap_strokes: parseInt(teamHandicap) || 0,
      });
      setTeamName(''); setPlayers(''); setTeamHandicap(0);
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

  const saveGameSettings = async () => {
    try {
      await api.updateGameSettings(eventId, {
        event_type: eventType,
        enabled_games: enabledGames,
        jm_show_mulligans: jmShowMulligans,
      });
      showToast('Game settings saved');
      load();
    } catch (e) { showToast('Error: ' + e.message); }
  };

  const saveGamePoint = async () => {
    if (!gamePointTeam) { showToast('Choose a team'); return; }
    try {
      await api.setGamePoint(eventId, {
        team_id: gamePointTeam,
        hole_number: parseInt(gamePointHole),
        game_type: gamePointType,
        points: Number(gamePointValue),
      });
      showToast('Side-game points saved');
      load();
    } catch (e) { showToast('Error: ' + e.message); }
  };

  const navigate = useNavigate();
  const handleDeleteEvent = async () => {
    if (!data) return;
    const name = data.event.name;
    if (!window.confirm(`Delete "${name}"? This will permanently remove all teams, scores, and game data. This cannot be undone.`)) return;
    try {
      await api.deleteEvent(eventId);
      navigate(`/admin/org/${data.event.org_id}`);
    } catch (e) { showToast('Delete failed: ' + e.message); }
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

        {event.scorer_token && (
          <div className="god-scorer-link">
            <div className="god-public-links-label">🎮 MATCH SCORER LINK</div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <a href={`${origin}/match/${event.scorer_token}`} target="_blank" rel="noopener" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                📱 Open Match Scorer
              </a>
              <code style={{ fontSize: '0.7rem', color: 'var(--slate-500)', background: 'var(--slate-100)', padding: '0.2rem 0.5rem', borderRadius: 4 }}>
                {event.scorer_token.slice(0, 8)}...
              </code>
              <button className="copy-btn" onClick={() => { navigator.clipboard.writeText(`${origin}/match/${event.scorer_token}`); showToast('Scorer link copied!'); }}>
                Copy
              </button>
              <button
                className="copy-btn"
                onClick={async () => {
                  if (!confirm('Regenerate the scorer link? The current link will stop working immediately.')) return;
                  try {
                    await api.regenScorerToken(eventId);
                    showToast('Scorer token regenerated');
                    load();
                  } catch (e) { showToast('Error: ' + e.message); }
                }}
                title="Issue a new scorer link"
              >
                ↻ New
              </button>
            </div>
            {event.token_expires_at && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: new Date(event.token_expires_at) < new Date() ? 'var(--red-600)' : 'var(--slate-500)' }}>
                {new Date(event.token_expires_at) < new Date() ? '⚠ Expired ' : 'Expires '}
                {new Date(event.token_expires_at).toLocaleString()}
                {' · '}policy: <code>{event.token_policy || 'never'}</code>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Weekly Match / Game Settings */}
      <div className="card god-card" style={{ marginBottom: '1.5rem' }}>
        <h2>🎮 Weekly Match Games</h2>
        <div className="form-row">
          <div className="form-group">
            <label>Mode</label>
            <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
              <option value="tournament">Tournament</option>
              <option value="weekly_match">Weekly Match</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Enabled Games</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {[
              ['stroke_play', '⛳ Stroke Play'],
              ['match_play', '🥊 Match Play'],
              ['nassau', '💰 Nassau'],
              ['skins', '🏆 Skins'],
              ['wolf', '🐺 Wolf'],
              ['nine_points', '🎯 9 Points (Nines)'],
              ['bingo_bango_bongo', '🎲 Bingo Bango Bongo'],
              ['jeff_martin', '🎖️ Jeff Martin'],
            ].map(([key, label]) => (
              <label key={key} style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={key === 'bingo_bango_bongo' ? hasBBB : enabledGames.includes(key)}
                  onChange={(e) => toggleGame(key, e.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        {enabledGames.includes('jeff_martin') && (
          <div className="jm-options" style={{ marginBottom: '1rem' }}>
            <div className="jm-options-label">🎖️ Jeff Martin options</div>
            <label className="jm-options-toggle">
              <input
                type="checkbox"
                checked={jmShowMulligans}
                onChange={(e) => setJmShowMulligans(e.target.checked)}
              />
              <span>Show mulligan tracker on scorecard pages</span>
              <span className="jm-options-hint">
                {jmShowMulligans
                  ? 'Scorers can log mulligans per player from the score-entry page.'
                  : 'Mulligans become honor-system only — the rule is still listed in the rules card, but no widget appears.'}
              </span>
            </label>
          </div>
        )}

        <button className="btn btn-primary btn-sm" onClick={saveGameSettings}>Save Game Settings</button>

        {hasBBB && (
          <div style={{ marginTop: '1rem', borderTop: '1px solid var(--slate-200)', paddingTop: '1rem' }}>
            <h3 style={{ fontSize: '0.95rem' }}>Manual Side-Game Points (Bingo / Bango / Bongo)</h3>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label className="input-label">Team</label>
                <select value={gamePointTeam} onChange={(e) => setGamePointTeam(e.target.value)}>
                  <option value="">Select team...</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.team_name}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Hole</label>
                <input type="number" min="1" max={event.holes} value={gamePointHole} onChange={(e) => setGamePointHole(e.target.value)} />
              </div>
              <div>
                <label className="input-label">Game</label>
                <select value={gamePointType} onChange={(e) => setGamePointType(e.target.value)}>
                  {['bingo', 'bango', 'bongo'].filter((g) => enabledGames.includes(g)).map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="input-label">Points</label>
                <input type="number" step="0.5" value={gamePointValue} onChange={(e) => setGamePointValue(e.target.value)} />
              </div>
              <button className="btn btn-secondary btn-sm" onClick={saveGamePoint}>Save Points</button>
            </div>
          </div>
        )}

        <div style={{ marginTop: '1rem' }}>
          <h3 style={{ fontSize: '0.95rem' }}>Current Game Standings</h3>
          {Object.keys(gameResults || {}).length === 0 ? (
            <div className="empty-state">No game standings yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {Object.entries(gameResults).map(([game, data]) => {
                // Nassau has sub-results (front, back, overall, presses)
                if (game === 'nassau' && data && typeof data === 'object' && !Array.isArray(data)) {
                  return (
                    <div key={game} className="card" style={{ padding: '0.75rem' }}>
                      <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>💰 Nassau</div>
                      {['front', 'back', 'overall'].map(seg => data[seg] && (
                        <div key={seg} style={{ marginBottom: '0.5rem' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--slate-500)', textTransform: 'uppercase' }}>
                            {seg === 'front' ? 'Front 9' : seg === 'back' ? 'Back 9' : 'Overall'}
                          </div>
                          <div style={{ fontSize: '0.9rem' }}>
                            {data[seg].slice(0, 5).map((r, i) => (
                              <div key={r.team_id}>{i + 1}. {r.team_name} — {r.points} pts</div>
                            ))}
                          </div>
                        </div>
                      ))}
                      {data.presses && data.presses.length > 0 && (
                        <div style={{ borderTop: '1px solid var(--slate-200)', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--red-500)' }}>🔥 PRESSES</div>
                          {data.presses.map((p, i) => (
                            <div key={i} style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                              {p.pressed_by_name} pressed {p.game_type.replace('nassau_', '')} from hole {p.from_hole}
                              {p.results && <span> — Leader: {p.results[0]?.team_name} ({p.results[0]?.points} pts)</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }
                // Wolf has standings and picks
                if (game === 'wolf' && data && data.standings) {
                  return (
                    <div key={game} className="card" style={{ padding: '0.75rem' }}>
                      <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>🐺 Wolf</div>
                      <div style={{ fontSize: '0.9rem' }}>
                        {data.standings.slice(0, 5).map((r, i) => (
                          <div key={r.team_id}>{i + 1}. {r.team_name} — {r.points > 0 ? '+' : ''}{r.points} pts</div>
                        ))}
                      </div>
                      {data.picks && data.picks.length > 0 && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--slate-500)', marginTop: '0.5rem' }}>
                          {data.picks.map(p => (
                            <div key={p.hole_number}>Hole {p.hole_number}: {p.wolf_name} → {p.partner_name}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }
                // Press sub-results
                if (game.endsWith('_presses') && Array.isArray(data)) {
                  return (
                    <div key={game} className="card" style={{ padding: '0.75rem', borderLeft: '3px solid var(--red-400, #f87171)' }}>
                      <div style={{ fontWeight: 700, marginBottom: '0.5rem', color: 'var(--red-500)' }}>🔥 {gameLabel(game)}</div>
                      {data.map((p, i) => (
                        <div key={i} style={{ fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                          {p.pressed_by_name} pressed from hole {p.from_hole}: {p.results[0]?.team_name} leads ({p.results[0]?.points} pts)
                        </div>
                      ))}
                    </div>
                  );
                }
                // Standard array results
                const rows = Array.isArray(data) ? data : [];
                if (rows.length === 0) return null;
                return (
                  <div key={game} className="card" style={{ padding: '0.75rem' }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>{gameLabel(game)}</div>
                    <div style={{ fontSize: '0.9rem' }}>
                      {rows.slice(0, 5).map((r, idx) => (
                        <div key={r.team_id}>{idx + 1}. {r.team_name} — {gameStat(game, r)}</div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
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

      {/* Jeff Martin admin panel — only when enabled */}
      {enabledGames.includes('jeff_martin') && (
        <JeffMartinAdminPanel eventId={eventId} holes={holes} showToast={showToast} />
      )}

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
            <Link to={`/admin/event/${eventId}/audit`} className="btn btn-secondary btn-sm">
              📜 Audit Log
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
          <input
            type="number"
            placeholder="HCP"
            value={teamHandicap}
            onChange={(e) => setTeamHandicap(e.target.value)}
            className="input"
            style={{ width: 90 }}
            title="Handicap strokes"
          />
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
              <div key={t.id}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.35rem', gap: '0.4rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--slate-500)' }}>Handicap</span>
                  <HandicapEditor
                    teamId={t.id}
                    initialValue={t.handicap_strokes ?? 0}
                    eventId={eventId}
                    onSaved={load}
                    showToast={showToast}
                  />
                </div>
                <TeamScorecard team={t} holes={holes} eventId={eventId} onUpdate={load} showToast={showToast} jmEnabled={enabledGames.includes('jeff_martin')} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="card god-card" style={{ marginTop: '2rem', borderColor: 'var(--red-200, #fecaca)' }}>
        <h2 style={{ color: 'var(--red-600, #dc2626)' }}>⚠️ Danger Zone</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--slate-500)', marginBottom: '1rem' }}>
          Permanently delete this event and all associated teams, scores, and game data. This action cannot be undone.
        </p>
        <button
          className="btn"
          style={{ background: 'var(--red-600, #dc2626)', color: 'white', border: 'none' }}
          onClick={handleDeleteEvent}
        >
          🗑️ Delete Event
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
