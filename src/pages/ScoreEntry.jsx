import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
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

export default function ScoreEntry() {
  const { accessToken } = useParams();
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedHole, setSelectedHole] = useState(1);
  const [strokes, setStrokes] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [toast, setToast] = useState('');
  const [jmBusy, setJmBusy] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getScoreContext(accessToken);
      setCtx(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [accessToken]);

  useEffect(() => { load(); }, [load]);

  const strokesInputRef = useRef(null);

  useEffect(() => {
    if (!ctx) return;
    const existing = ctx.scores[selectedHole];
    setStrokes(existing ? String(existing.strokes) : '');
  }, [selectedHole, ctx]);

  // Scroll to top whenever the selected hole changes — applies to auto-advance,
  // the "Next unfilled hole" button, and manual hole-chip taps.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [selectedHole]);

  // Focus the stroke input only when the hole has no score yet. If a score
  // already exists, keep the keyboard dismissed — the scorer is reviewing,
  // not entering.
  useEffect(() => {
    if (!ctx) return;
    const hasScore = !!ctx.scores[selectedHole];
    const el = strokesInputRef.current;
    if (!el) return;
    if (hasScore) {
      // Dismiss any open mobile keyboard.
      el.blur();
    } else {
      // Empty hole — pop the keyboard for quick entry.
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
        // Offline / network blip — apply optimistic update locally so the
        // scorer keeps their flow. Sync worker will resolve in the
        // background and the SyncStatusPill surfaces status.
        setCtx((prev) => ({
          ...prev,
          scores: { ...(prev.scores || {}), [selectedHole]: { strokes: s, updated_at: new Date().toISOString(), pending: true } },
        }));
        showToast('Saved locally — will sync when online');
      } else {
        setCtx((prev) => ({ ...prev, scores: outcome.response.scores }));
        showToast('Saved ✓');
      }

      // Dismiss mobile keyboard — user just saved, they're not typing anymore.
      // (If the hole changes below via auto-advance, the focus effect will
      // re-focus on the new empty hole.)
      if (strokesInputRef.current) strokesInputRef.current.blur();

      // If Jeff Martin is on, don't auto-advance — let the scorer pick the your-hole player first.
      if (jmEnabled) return;

      // Auto-advance to next empty hole
      const totalHoles = ctx.event.holes;
      for (let i = 1; i <= totalHoles; i++) {
        const nextHole = ((selectedHole - 1 + i) % totalHoles) + 1;
        if (!result.scores[nextHole]) {
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

  const advanceToNextEmpty = () => {
    const totalHoles = ctx.event.holes;
    const sc = ctx.scores;
    for (let i = 1; i <= totalHoles; i++) {
      const nextHole = ((selectedHole - 1 + i) % totalHoles) + 1;
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
  if (!ctx) return null;

  const { team, event, pars, scores } = ctx;
  const isTeamLocked = !!team.locked_at;
  const isEventLocked = !!event.locked_at || event.status === 'completed';
  const isLocked = isTeamLocked || isEventLocked;
  const isNotLive = event.status !== 'live' && event.status !== 'completed';
  const totalHoles = event.holes;
  const currentPar = pars[selectedHole] || 4;

  // Jeff Martin state
  const enabledGames = event.enabled_games || ['stroke_play'];
  const jmEnabled = enabledGames.includes('jeff_martin');
  const jmShowMulligans = event.jm_show_mulligans !== false; // legacy events default to visible
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

  // Jeff Martin running total — sum of Stableford points with your-hole bonus
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
        </div>
      )}

      {/* Locked: Event completed */}
      {isEventLocked && !isTeamLocked && (
        <div className="locked-banner">🔒 Event completed — Scores are final</div>
      )}

      {/* Not live */}
      {isNotLive && !isLocked && (
        <div className="locked-banner" style={{ background: 'var(--slate-100)', borderColor: 'var(--slate-200)' }}>
          Event is not live yet. Check back soon!
        </div>
      )}

      {/* ═══ SUBMIT PROMPT — shown when all holes complete and not locked ═══ */}
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

      {/* Hole Selector */}
      {!isTeamLocked && (
        <>
          <div className="hole-selector">
            {Array.from({ length: totalHoles }, (_, i) => i + 1).map(h => (
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

          {/* ═══ JEFF MARTIN PANEL ═══ */}
          {jmEnabled && !isLocked && !isNotLive && (
            <div className="jm-panel">
              <div className="jm-panel-header">
                <span className="jm-panel-title">Jeff Martin — Hole {selectedHole}</span>
                <button className="jm-rules-toggle" onClick={() => setShowRules(v => !v)} type="button">
                  {showRules ? 'Hide rules' : 'View rules'}
                </button>
              </div>

              {/* Your Hole picker */}
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

              {/* Mulligans */}
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

              {/* Next hole shortcut when strokes are entered */}
              {hasScoreForSelected && (
                <button className="btn btn-secondary jm-next-btn" onClick={advanceToNextEmpty} type="button">
                  Next unfilled hole →
                </button>
              )}

              {/* Rules popover */}
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
                      {!jmShowMulligans && ' Tracked on the honor system for this event — adjust your strokes accordingly.'}
                    </div>
                  </div>
                  <div className="jm-rules-section">
                    <div className="jm-rules-title">Your Hole (−1 bonus)</div>
                    <div>If all shots on a hole were from the same player, subtract 1 from the score. Example: one player's drive, approach, and made putt for a 3 counts as a 2.</div>
                  </div>
                  <div className="jm-rules-section">
                    <div className="jm-rules-title">Riders</div>
                    <div>Any player can play as an extra for any shot on any team at any time. (Not tracked here — just a rule.)</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Scores Summary */}
      {holesEntered > 0 && (
        <div className="scores-summary" style={{ marginTop: '1.5rem' }}>
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
              {Array.from({ length: totalHoles }, (_, i) => i + 1).map(h => {
                const s = scores[h];
                const par = pars[h] || 4;
                // Stableford + your-hole adjustment for this row
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

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
