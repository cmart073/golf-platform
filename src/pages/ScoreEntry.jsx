import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';

function ScoreDiff({ strokes, par }) {
  const diff = strokes - par;
  if (diff < 0) return <span className="score-diff under">{diff}</span>;
  if (diff > 0) return <span className="score-diff over">+{diff}</span>;
  return <span className="score-diff even">E</span>;
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

  const load = useCallback(async () => {
    try {
      const data = await api.getScoreContext(accessToken);
      setCtx(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [accessToken]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!ctx) return;
    const existing = ctx.scores[selectedHole];
    setStrokes(existing ? String(existing.strokes) : '');
  }, [selectedHole, ctx]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const handleSave = async () => {
    const s = parseInt(strokes);
    if (isNaN(s) || s < 1 || s > 20) { showToast('Enter strokes 1–20'); return; }
    setSaving(true);
    try {
      const result = await api.submitScore(accessToken, { hole_number: selectedHole, strokes: s });
      setCtx(prev => ({ ...prev, scores: result.scores }));
      showToast('Saved ✓');

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

  // Totals
  const holesEntered = Object.keys(scores).length;
  const totalStrokes = Object.values(scores).reduce((sum, s) => sum + s.strokes, 0);
  const totalParDone = Object.keys(scores).reduce((sum, h) => sum + (pars[h] || 0), 0);
  const toPar = totalStrokes - totalParDone;
  const allHolesComplete = holesEntered >= totalHoles;

  return (
    <div className="score-page">
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
                  onChange={e => setStrokes(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  placeholder="—" autoFocus />
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
        </>
      )}

      {/* Scores Summary */}
      {holesEntered > 0 && (
        <div className="scores-summary" style={{ marginTop: '1.5rem' }}>
          <table>
            <thead>
              <tr><th>Hole</th><th>Par</th><th>Score</th><th>+/−</th></tr>
            </thead>
            <tbody>
              {Array.from({ length: totalHoles }, (_, i) => i + 1).map(h => {
                const s = scores[h];
                const par = pars[h] || 4;
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
                  </tr>
                );
              })}
              <tr className="total-row">
                <td>Total</td>
                <td>{totalParDone}</td>
                <td>{totalStrokes}</td>
                <td><ScoreDiff strokes={totalStrokes} par={totalParDone} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
