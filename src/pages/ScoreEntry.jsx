import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import { submitTeamHole } from '../offline/scorer';
import SyncStatusPill from '../components/SyncStatusPill';

function ScoreDiff({ strokes, par }) {
  const diff = strokes - par;
  if (diff < 0) return <span className="score-diff under">{diff}</span>;
  if (diff > 0) return <span className="score-diff over">+{diff}</span>;
  return <span className="score-diff even">E</span>;
}

// Modified Stableford table used by Jeff Martin. Kept in sync with
// functions/_game_scoring.js::stablefordPoints.
function stablefordPoints(diff) {
  if (diff >= 2) return 0;
  if (diff === 1) return 1;
  if (diff === 0) return 2;
  if (diff === -1) return 3;
  if (diff === -2) return 4;
  if (diff === -3) return 5;
  return 6;
}

function formatToPar(val) {
  if (val === 0) return 'E';
  return val > 0 ? `+${val}` : `${val}`;
}

// Returns ordered array of hole numbers starting from startingHole.
// getHoleOrder(7, 18) → [7,8,9,10,11,12,13,14,15,16,17,18,1,2,3,4,5,6]
function getHoleOrder(startingHole, totalHoles) {
  const order = [];
  for (let i = 0; i < totalHoles; i++) {
    order.push(((startingHole - 1 + i) % totalHoles) + 1);
  }
  return order;
}

/* ── Mini Leaderboard ── */
function MiniLeaderboard({ lbData, expanded, onToggle, showSideGames }) {
  if (!lbData) return null;
  const { leaderboard = [], game_results = {}, event } = lbData;
  if (leaderboard.length === 0) return null;

  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);
  const hasSkins = showSideGames && Array.isArray(game_results.skins) && game_results.skins.length > 0;
  const skinsLeader = hasSkins ? game_results.skins.find(r => r.skins_won > 0) : null;

  const formatScore = (r) => {
    if (r.net_strokes == null) return '—';
    const diff = r.net_strokes - (r.total_par || 0);
    if (diff === 0) return 'E';
    return diff > 0 ? `+${diff}` : `${diff}`;
  };

  const rowStyle = (i) => ({
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    padding: '0.3rem 0', borderBottom: '1px solid var(--slate-100)',
    fontSize: '0.85rem',
  });

  return (
    <div style={{
      background: 'var(--slate-50)', border: '1px solid var(--slate-200)',
      borderRadius: 10, margin: '1rem 0', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0.5rem 0.75rem',
        background: 'var(--green-800)', color: '#fff',
      }}>
        <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>📊 Live Leaderboard</span>
        <button onClick={onToggle} style={{
          background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 4,
          color: '#fff', fontSize: '0.75rem', padding: '0.15rem 0.5rem', cursor: 'pointer',
        }}>
          {expanded ? 'Show less ▲' : `All ${leaderboard.length} teams ▼`}
        </button>
      </div>

      {/* Skins leader pill if applicable */}
      {skinsLeader && (
        <div style={{
          padding: '0.3rem 0.75rem', background: '#fefce8',
          fontSize: '0.78rem', borderBottom: '1px solid var(--slate-200)',
          color: 'var(--green-800)',
        }}>
          🏆 Skins leader: <strong>{skinsLeader.team_name}</strong> · {skinsLeader.skins_won} skin{skinsLeader.skins_won !== 1 ? 's' : ''}
        </div>
      )}

      {/* Standings */}
      <div style={{ padding: '0.25rem 0.75rem' }}>
        {top3.map((r, i) => (
          <div key={r.team_id} style={rowStyle(i)}>
            <span style={{ fontWeight: 700, color: 'var(--slate-400)', width: 18, flexShrink: 0 }}>{i + 1}</span>
            <span style={{ flex: 1, fontWeight: r.team_id === lbData._my_team_id ? 700 : 400 }}>
              {r.team_name}
              {r.team_id === lbData._my_team_id && <span style={{ fontSize: '0.7rem', color: 'var(--green-600)', marginLeft: 4 }}>← you</span>}
            </span>
            <span style={{
              fontWeight: 700, minWidth: 32, textAlign: 'right',
              color: (() => { const d = r.net_strokes - (r.total_par||0); return d < 0 ? 'var(--green-700)' : d > 0 ? 'var(--red-500)' : 'var(--slate-600)'; })(),
            }}>
              {formatScore(r)}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--slate-400)', minWidth: 38, textAlign: 'right' }}>
              {r.holes_complete}/{event?.holes || 18}
            </span>
          </div>
        ))}

        {expanded && rest.map((r, i) => (
          <div key={r.team_id} style={rowStyle(i)}>
            <span style={{ fontWeight: 700, color: 'var(--slate-400)', width: 18, flexShrink: 0 }}>{i + 4}</span>
            <span style={{ flex: 1, fontWeight: r.team_id === lbData._my_team_id ? 700 : 400 }}>
              {r.team_name}
              {r.team_id === lbData._my_team_id && <span style={{ fontSize: '0.7rem', color: 'var(--green-600)', marginLeft: 4 }}>← you</span>}
            </span>
            <span style={{
              fontWeight: 700, minWidth: 32, textAlign: 'right',
              color: (() => { const d = r.net_strokes - (r.total_par||0); return d < 0 ? 'var(--green-700)' : d > 0 ? 'var(--red-500)' : 'var(--slate-600)'; })(),
            }}>
              {formatScore(r)}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--slate-400)', minWidth: 38, textAlign: 'right' }}>
              {r.holes_complete}/{event?.holes || 18}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}


export default function ScoreEntry() {
  const { accessToken } = useParams();
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedHole, setSelectedHole] = useState(null); // null until ctx loaded
  const [strokes, setStrokes] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [toast, setToast] = useState('');
  const [lbData, setLbData] = useState(null);
  const [lbExpanded, setLbExpanded] = useState(false);
  const lbPollRef = useRef(null);
  const [jmBusy, setJmBusy] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getScoreContext(accessToken);
      setCtx(data);
      // On first load, set selectedHole to the team's starting hole
      setSelectedHole(prev => {
        if (prev !== null) return prev; // already navigated away, don't reset
        return data.team.starting_hole || 1;
      });
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [accessToken]);

  useEffect(() => { load(); }, [load]);

  // Live leaderboard poll — only during active round (not after submission)
  // Derive stable values for the poll — avoids stale closure issues with ctx
  const lbOrgSlug = ctx?.org_slug ?? null;
  const lbEventSlug = ctx?.event?.slug ?? null;
  const lbEventStatus = ctx?.event?.status ?? null;
  const lbTeamLocked = ctx?.team?.locked_at ?? null;

  useEffect(() => {
    // Only poll when we have slugs, event is live, and team hasn't submitted
    if (!lbOrgSlug || !lbEventSlug) return;
    if (lbEventStatus !== 'live') return;
    if (lbTeamLocked) return;

    const fetchLb = async () => {
      try {
        const res = await fetch(`/api/public/org/${lbOrgSlug}/event/${lbEventSlug}/leaderboard`);
        if (res.ok) setLbData(await res.json());
      } catch { /* silent fail */ }
    };

    fetchLb();
    lbPollRef.current = setInterval(fetchLb, 60000);
    return () => clearInterval(lbPollRef.current);
  }, [lbOrgSlug, lbEventSlug, lbEventStatus, lbTeamLocked]);

  const strokesInputRef = useRef(null);

  useEffect(() => {
    if (!ctx || selectedHole === null) return;
    const existing = ctx.scores[selectedHole];
    setStrokes(existing ? String(existing.strokes) : '');
  }, [selectedHole, ctx]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [selectedHole]);

  useEffect(() => {
    if (!ctx || selectedHole === null) return;
    const hasScore = !!ctx.scores[selectedHole];
    const el = strokesInputRef.current;
    if (!el) return;
    if (hasScore) {
      el.blur();
    } else {
      el.focus();
    }
  }, [selectedHole, ctx]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const handleSave = async () => {
    const s = parseInt(strokes);
    if (isNaN(s) || s < 1 || s > 20) { showToast('Enter strokes 1–20'); return; }
    setSaving(true);
    try {
      const outcome = await submitTeamHole({ accessToken, hole_number: selectedHole, strokes: s });
      if (outcome.queued) {
        setCtx((prev) => ({
          ...prev,
          scores: { ...(prev.scores || {}), [selectedHole]: { strokes: s, updated_at: new Date().toISOString(), pending: true } },
        }));
        showToast('Saved locally — will sync when online');
      } else {
        setCtx((prev) => ({ ...prev, scores: outcome.response.scores }));
        showToast('Saved ✓');
      }

      if (strokesInputRef.current) strokesInputRef.current.blur();

      // If Jeff Martin is on, don't auto-advance — let the scorer pick the your-hole player first.
      if (jmEnabled) return;

      // Auto-advance to next empty hole in play order
      const currentScores = outcome.queued
        ? { ...(ctx.scores || {}), [selectedHole]: { strokes: s } }
        : outcome.response.scores;

      for (let i = 1; i <= totalHoles; i++) {
        const nextHole = holeOrder[(holeOrder.indexOf(selectedHole) + i) % totalHoles];
        if (!currentScores[nextHole]) {
          setSelectedHole(nextHole);
          return;
        }
      }
      // All holes filled — stay on current
    } catch (e) { showToast('Error: ' + e.message); }
    finally { setSaving(false); }
  };

  const handleSetYourHole = async (playerIndex) => {
    setJmBusy(true);
    try {
      const res = await api.setYourHole(accessToken, {
        hole_number: selectedHole,
        player_index: playerIndex,
      });
      setCtx(prev => ({ ...prev, your_holes: res.your_holes }));
      showToast(playerIndex === null ? 'Cleared' : 'Saved ✓');
    } catch (e) { showToast('Error: ' + e.message); }
    finally { setJmBusy(false); }
  };

  const handleMulligan = async (playerIndex, delta) => {
    setJmBusy(true);
    try {
      const res = await api.logMulligan(accessToken, {
        player_index: playerIndex,
        hole_number: selectedHole,
        delta,
      });
      setCtx(prev => ({ ...prev, mulligans: res.mulligans }));
      showToast(delta > 0 ? 'Mulligan logged ✓' : 'Mulligan removed');
    } catch (e) { showToast(e.message); }
    finally { setJmBusy(false); }
  };

  // Advance to next empty hole in play order
  const advanceToNextEmpty = () => {
    const sc = ctx.scores;
    for (let i = 1; i <= totalHoles; i++) {
      const idx = (holeOrder.indexOf(selectedHole) + i) % totalHoles;
      const nextHole = holeOrder[idx];
      if (!sc[nextHole]) { setSelectedHole(nextHole); return; }
    }
  };

  const handleSubmitFinal = async () => {
    setSubmitting(true);
    try {
      const result = await api.submitFinal(accessToken);
      setCtx(prev => ({ ...prev, team: { ...prev.team, locked_at: result.locked_at } }));
      setShowConfirm(false);
      showToast('Scores submitted! 🎉');
    } catch (e) { showToast('Error: ' + e.message); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="score-page"><div className="loading">Loading...</div></div>;
  if (error) return (
    <div className="score-page">
      <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⛳</div>
        <h2 style={{ color: 'var(--red-500)', marginBottom: '0.5rem' }}>Invalid Link</h2>
        <p style={{ color: 'var(--slate-500)' }}>This scoring link is not valid. Check with your event organizer.</p>
      </div>
    </div>
  );
  if (!ctx || selectedHole === null) return null;

  const { team, event, pars, tees, scores, org_slug } = ctx;
  const isTeamLocked = !!team.locked_at;
  const isEventLocked = !!event.locked_at || event.status === 'completed';
  const isLocked = isTeamLocked || isEventLocked;
  const isNotLive = event.status !== 'live' && event.status !== 'completed';
  const totalHoles = event.holes;
  const leaderboardUrl = org_slug && event.slug
    ? `/o/${org_slug}/e/${event.slug}/leaderboard`
    : null;
  const currentPar = pars[selectedHole] || 4;

  // Tee box display config
  const TEE_CONFIG = {
    red:   { label: 'Red Tees',   bg: '#dc2626', color: '#fff' },
    white: { label: 'White Tees', bg: '#fff',    color: '#1e293b', border: '2px solid #cbd5e1' },
    blue:  { label: 'Blue Tees',  bg: '#1d4ed8', color: '#fff' },
  };
  const currentTee = tees ? tees[selectedHole] : null;
  const teeStyle = currentTee ? TEE_CONFIG[currentTee] : null;


  // Hole order — wrap-around for shotgun starts
  const startingHole = team.starting_hole || 1;
  const holeOrder = getHoleOrder(startingHole, totalHoles);
  const isShotgun = event.shotgun_start && startingHole !== 1;

  // Jeff Martin state
  const enabledGames = event.enabled_games || ['stroke_play'];
  const jmEnabled = enabledGames.includes('jeff_martin');
  const jmShowMulligans = event.jm_show_mulligans !== false;
  const roster = Array.isArray(team.players) ? team.players : [];
  const yourHoles = ctx.your_holes || {};
  const mulligans = ctx.mulligans || {};
  const selectedHoleYourPlayer = yourHoles[selectedHole];
  const hasScoreForSelected = !!scores[selectedHole];

  // Totals
  const holesEntered = Object.keys(scores).length;
  const totalStrokes = Object.values(scores).reduce((sum, s) => sum + s.strokes, 0);
  const totalParDone = Object.keys(scores).reduce((sum, h) => sum + (pars[h] || 0), 0);
  const toPar = totalStrokes - totalParDone;
  const allHolesComplete = holesEntered >= totalHoles;

  // Jeff Martin running total
  const jmTotalPoints = jmEnabled
    ? Object.keys(scores).reduce((sum, h) => {
        const s = scores[h];
        if (!s) return sum;
        const par = pars[h] || 4;
        const hasYH = yourHoles[h] != null;
        const adj = hasYH ? s.strokes - 1 : s.strokes;
        return sum + stablefordPoints(adj - par);
      }, 0)
    : 0;

  return (
    <div className="score-page">
      <SyncStatusPill />
      {/* Header */}
      <div className="score-header">
        <h1>{event.name}</h1>
        <div className="team">{team.team_name}</div>
        {/* Shotgun start badge — confirms their starting hole */}
        {isShotgun && (
          <div style={{
            marginTop: '0.35rem',
            fontSize: '0.8rem',
            fontWeight: 600,
            color: 'var(--green-700)',
            background: 'var(--green-50)',
            border: '1px solid var(--green-200)',
            borderRadius: 6,
            display: 'inline-block',
            padding: '0.2rem 0.6rem',
          }}>
            ⛳ Starting hole: {startingHole}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem' }}>
          {event.status === 'live' && !isTeamLocked && <span className="badge badge-live" style={{ fontSize: '0.7rem' }}>● LIVE</span>}
          {event.status === 'completed' && <span className="badge badge-completed">FINAL</span>}
          {event.status === 'draft' && <span className="badge badge-draft">NOT STARTED</span>}
          {isTeamLocked && <span className="badge badge-completed">✓ SUBMITTED</span>}
        </div>
      </div>

      {/* To-Par Bar */}
      {holesEntered > 0 && (
        <div className="score-topar-bar">
          {jmEnabled && (
            <div className="score-topar-item">
              <div className="score-topar-label">JM Pts</div>
              <div className="score-topar-val" style={{ color: 'var(--green-800)' }}>{jmTotalPoints}</div>
            </div>
          )}
          <div className="score-topar-item">
            <div className="score-topar-label">To Par</div>
            <div className={`score-topar-val ${toPar < 0 ? 'under' : toPar > 0 ? 'over' : 'even'}`}>
              {formatToPar(toPar)}
            </div>
          </div>
          <div className="score-topar-item">
            <div className="score-topar-label">Thru</div>
            <div className="score-topar-val">{holesEntered}</div>
          </div>
          <div className="score-topar-item">
            <div className="score-topar-label">Strokes</div>
            <div className="score-topar-val">{totalStrokes}</div>
          </div>
        </div>
      )}

      {/* Locked: Team submitted */}
      {isTeamLocked && (
        <div className="submit-complete-banner">
          <div className="submit-complete-icon">🏆</div>
          <div className="submit-complete-title">Scores Submitted</div>
          <div className="submit-complete-sub">
            Your round is complete. Final score: {totalStrokes} ({formatToPar(toPar)})
          </div>
          {leaderboardUrl && (
            <a href={leaderboardUrl} target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-block', marginTop: '0.75rem',
                background: 'var(--green-700)', color: '#fff',
                padding: '0.5rem 1.25rem', borderRadius: 8,
                fontWeight: 600, fontSize: '0.9rem', textDecoration: 'none',
              }}>
              📊 View Leaderboard →
            </a>
          )}
        </div>
      )}

      {/* Locked: Event completed */}
      {isEventLocked && !isTeamLocked && (
        <div className="locked-banner">🔒 Event completed — Scores are final</div>
      )}

      {event.scoring_mode === 'single' && !isLocked && (
        <div className="locked-banner" style={{ background: '#fef3c7', borderColor: '#fbbf24' }}>
          ⚠ This event uses <strong>single-scorer mode</strong>. Ask your organizer for the match-scorer link
          if you need to enter scores. This view is read-only.
        </div>
      )}

      {isNotLive && !isLocked && (
        <div className="locked-banner" style={{ background: 'var(--slate-100)', borderColor: 'var(--slate-200)' }}>
          Event is not live yet. Check back soon!
        </div>
      )}

      {/* Submit prompt */}
      {allHolesComplete && !isLocked && !isNotLive && (
        <div className="submit-prompt">
          <div className="submit-prompt-title">🎉 All {totalHoles} holes entered!</div>
          <div className="submit-prompt-summary">
            Total: <strong>{totalStrokes}</strong> · To Par: <strong className={toPar < 0 ? 'under' : toPar > 0 ? 'over' : 'even'}>{formatToPar(toPar)}</strong>
          </div>
          <p className="submit-prompt-note">
            Review your scores below, then submit. Once submitted, scores are locked and cannot be changed.
          </p>
          <button className="btn btn-submit" onClick={() => setShowConfirm(true)}>
            ✅ Submit Final Scores
          </button>
        </div>
      )}

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="modal confirm-modal" onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⛳</div>
              <h2 style={{ marginBottom: '0.5rem' }}>Submit Scores?</h2>
              <p style={{ color: 'var(--slate-500)', marginBottom: '0.5rem' }}>
                <strong>{team.team_name}</strong>
              </p>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.75rem 0' }}>
                {totalStrokes} strokes · <span className={toPar < 0 ? 'under' : toPar > 0 ? 'over' : 'even'}>{formatToPar(toPar)}</span>
              </div>
              <p style={{ color: 'var(--slate-500)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                Once submitted, scores are <strong>locked</strong> and can only be changed by the event admin.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                <button className="btn btn-secondary" onClick={() => setShowConfirm(false)}>Go Back</button>
                <button className="btn btn-submit" onClick={handleSubmitFinal} disabled={submitting}>
                  {submitting ? 'Submitting...' : '✅ Confirm & Submit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hole Selector — rendered in play order for shotgun starts */}
      {!isTeamLocked && (
        <>
          <div className="hole-selector">
            {holeOrder.map(h => (
              <button key={h}
                className={`hole-btn ${selectedHole === h ? 'active' : ''} ${scores[h] ? 'has-score' : ''}`}
                onClick={() => setSelectedHole(h)}
              >{h}</button>
            ))}
          </div>

          {/* Stroke Input */}
          <div className="stroke-input-area">
            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--green-900)', marginBottom: '0.25rem' }}>
              Hole {selectedHole}
            </div>
            {teeStyle && (
              <div style={{
                display: 'inline-block',
                background: teeStyle.bg,
                color: teeStyle.color,
                border: teeStyle.border || 'none',
                borderRadius: 8,
                padding: '0.3rem 1rem',
                fontWeight: 700,
                fontSize: '1rem',
                letterSpacing: '0.04em',
                marginBottom: '0.4rem',
                boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
              }}>
                {teeStyle.label}
              </div>
            )}
            <div className="par-display">Par <strong>{currentPar}</strong></div>

            {isNotLive || isEventLocked ? (
              <div style={{ fontSize: '2.5rem', fontWeight: 600, color: 'var(--green-900)', padding: '0.5rem 0' }}>
                {scores[selectedHole] ? scores[selectedHole].strokes : '—'}
              </div>
            ) : (
              <>
                <input type="number" min="1" max="20" value={strokes}
                  ref={strokesInputRef}
                  onChange={e => setStrokes(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  placeholder="—" />
                <div className="save-row">
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving || !strokes}>
                    {saving ? 'Saving...' : scores[selectedHole] ? 'Update' : 'Save'}
                  </button>
                </div>
              </>
            )}
            {scores[selectedHole] && (
              <div style={{ fontSize: '0.75rem', color: 'var(--slate-400)', marginTop: '0.5rem' }}>
                Last updated: {new Date(scores[selectedHole].updated_at).toLocaleTimeString()}
              </div>
            )}
          </div>

          {/* Jeff Martin Panel */}
          {jmEnabled && !isLocked && !isNotLive && (
            <div className="jm-panel">
              <div className="jm-panel-header">
                <span className="jm-panel-title">Jeff Martin — Hole {selectedHole}</span>
                <button className="jm-rules-toggle" onClick={() => setShowRules(v => !v)} type="button">
                  {showRules ? 'Hide rules' : 'View rules'}
                </button>
              </div>

              <div className="jm-section">
                <div className="jm-section-label">
                  Whose hole? <span className="jm-hint">(all shots from one player → −1)</span>
                </div>
                {!hasScoreForSelected ? (
                  <div className="jm-muted">Enter strokes first, then mark the hole.</div>
                ) : roster.length === 0 ? (
                  <div className="jm-muted">No players added to this team. Ask your event admin to add teammates.</div>
                ) : (
                  <div className="jm-yh-options">
                    <button
                      type="button"
                      className={`jm-yh-opt ${selectedHoleYourPlayer == null ? 'active' : ''}`}
                      onClick={() => handleSetYourHole(null)}
                      disabled={jmBusy}
                    >None</button>
                    {roster.map((p, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`jm-yh-opt ${selectedHoleYourPlayer === i ? 'active' : ''}`}
                        onClick={() => handleSetYourHole(i)}
                        disabled={jmBusy}
                      >{p || `Player ${i + 1}`}</button>
                    ))}
                  </div>
                )}
              </div>

              {jmShowMulligans && roster.length > 0 && (
                <div className="jm-section">
                  <div className="jm-section-label">
                    Mulligans <span className="jm-hint">(2 per player per 6 holes)</span>
                  </div>
                  <div className="jm-mulligan-list">
                    {roster.map((p, i) => {
                      const used = mulligans[i]?.used_count ?? 0;
                      const holesUsed = mulligans[i]?.holes_used ?? [];
                      return (
                        <div className="jm-mulligan-row" key={i}>
                          <div className="jm-mulligan-name">{p || `Player ${i + 1}`}</div>
                          <div className="jm-mulligan-count">
                            {used}/6 <span className="jm-hint">used</span>
                            {holesUsed.length > 0 && (
                              <div className="jm-mulligan-holes">Holes: {holesUsed.join(', ')}</div>
                            )}
                          </div>
                          <div className="jm-mulligan-btns">
                            <button
                              type="button"
                              className="jm-mul-btn"
                              onClick={() => handleMulligan(i, -1)}
                              disabled={jmBusy || used === 0}
                              aria-label="Remove last mulligan"
                            >−</button>
                            <button
                              type="button"
                              className="jm-mul-btn jm-mul-btn-add"
                              onClick={() => handleMulligan(i, 1)}
                              disabled={jmBusy}
                              aria-label={`Log mulligan for ${p || `Player ${i + 1}`} on hole ${selectedHole}`}
                            >+ mulligan</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {hasScoreForSelected && (
                <button className="btn btn-secondary jm-next-btn" onClick={advanceToNextEmpty} type="button">
                  Next unfilled hole →
                </button>
              )}

              {showRules && (
                <div className="jm-rules">
                  <div className="jm-rules-section">
                    <div className="jm-rules-title">Format</div>
                    <div>4-person scramble, Modified Stableford scoring.</div>
                  </div>
                  <div className="jm-rules-section">
                    <div className="jm-rules-title">Stableford points</div>
                    <table className="jm-rules-table">
                      <tbody>
                        <tr><td>+2 or worse</td><td>0 pts</td></tr>
                        <tr><td>+1</td><td>1 pt</td></tr>
                        <tr><td>Par</td><td>2 pts</td></tr>
                        <tr><td>−1 (Birdie)</td><td>3 pts</td></tr>
                        <tr><td>−2 (Eagle)</td><td>4 pts</td></tr>
                        <tr><td>−3</td><td>5 pts</td></tr>
                        <tr><td>−4 or better</td><td>6 pts</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="jm-rules-section">
                    <div className="jm-rules-title">Mulligans</div>
                    <div>
                      2 per person per 6 holes (6 total over 18).
                      {!jmShowMulligans && ' Tracked on the honor system for this event.'}
                    </div>
                  </div>
                  <div className="jm-rules-section">
                    <div className="jm-rules-title">Your Hole (−1 bonus)</div>
                    <div>If all shots on a hole were from the same player, subtract 1 from the score.</div>
                  </div>
                  <div className="jm-rules-section">
                    <div className="jm-rules-title">Riders</div>
                    <div>Any player can play as an extra for any shot on any team at any time. (Not tracked here.)</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Scores Summary — rendered in play order for shotgun starts */}
      {holesEntered > 0 && (
        <div className="scores-summary" style={{ marginTop: '1.5rem' }}>
          {isShotgun && (
            <div style={{ fontSize: '0.75rem', color: 'var(--slate-400)', marginBottom: '0.5rem', textAlign: 'center' }}>
              Scores shown in your play order (starting hole {startingHole})
            </div>
          )}
          <table>
            <thead>
              <tr>
                <th>Hole</th>
                <th>Par</th>
                <th>Score</th>
                <th>+/−</th>
                {jmEnabled && <th title="Stableford points (with Your-Hole bonus)">Pts</th>}
              </tr>
            </thead>
            <tbody>
              {holeOrder.map(h => {
                const s = scores[h];
                const par = pars[h] || 4;
                let jmCell = null;
                if (jmEnabled) {
                  if (s) {
                    const hasYH = yourHoles[h] != null;
                    const adj = hasYH ? s.strokes - 1 : s.strokes;
                    const pts = stablefordPoints(adj - par);
                    jmCell = (
                      <td style={{ fontWeight: 600, color: 'var(--green-800)' }}>
                        {pts}
                        {hasYH && <span className="jm-yh-dot" title={`Your hole: ${team.players[yourHoles[h]] || `Player ${yourHoles[h] + 1}`}`}> ●</span>}
                      </td>
                    );
                  } else {
                    jmCell = <td style={{ color: 'var(--slate-300)' }}>—</td>;
                  }
                }
                return (
                  <tr key={h}
                    onClick={() => !isTeamLocked && setSelectedHole(h)}
                    style={{ cursor: isTeamLocked ? 'default' : 'pointer', background: selectedHole === h && !isTeamLocked ? 'var(--green-50)' : undefined }}
                  >
                    <td style={{ fontWeight: 600 }}>{h}</td>
                    <td>{par}</td>
                    <td style={{ fontWeight: s ? 600 : 400, color: s ? 'var(--slate-800)' : 'var(--slate-300)' }}>
                      {s ? s.strokes : '—'}
                    </td>
                    <td>{s && <ScoreDiff strokes={s.strokes} par={par} />}</td>
                    {jmCell}
                  </tr>
                );
              })}
              <tr className="total-row">
                <td>Total</td>
                <td>{totalParDone}</td>
                <td>{totalStrokes}</td>
                <td><ScoreDiff strokes={totalStrokes} par={totalParDone} /></td>
                {jmEnabled && <td style={{ color: 'var(--green-800)' }}>{jmTotalPoints}</td>}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Live leaderboard — only shown during active round, not after submission */}
      {!isTeamLocked && !isEventLocked && !isNotLive && lbData && (
        <MiniLeaderboard
          lbData={lbData}
          expanded={lbExpanded}
          onToggle={() => setLbExpanded(v => !v)}
          showSideGames={event.show_side_games !== false}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}


