import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';

function ScoreDiff({ strokes, par }) {
  const diff = strokes - par;
  if (diff < 0) return <span className="score-diff under">{diff}</span>;
  if (diff > 0) return <span className="score-diff over">+{diff}</span>;
  return <span className="score-diff even">E</span>;
}

export default function ScoreEntry() {
  const { accessToken } = useParams();
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedHole, setSelectedHole] = useState(1);
  const [strokes, setStrokes] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.getScoreContext(accessToken);
      setCtx(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { load(); }, [load]);

  // When hole changes, prefill strokes if already entered
  useEffect(() => {
    if (!ctx) return;
    const existing = ctx.scores[selectedHole];
    if (existing) {
      setStrokes(String(existing.strokes));
    } else {
      setStrokes('');
    }
  }, [selectedHole, ctx]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  };

  const handleSave = async () => {
    const s = parseInt(strokes);
    if (isNaN(s) || s < 1 || s > 20) { showToast('Enter strokes 1–20'); return; }
    setSaving(true);
    try {
      const result = await api.submitScore(accessToken, { hole_number: selectedHole, strokes: s });
      setCtx((prev) => ({ ...prev, scores: result.scores }));
      showToast('Saved ✓');

      // Auto-advance to next empty hole
      const totalHoles = ctx.event.holes;
      for (let i = 1; i <= totalHoles; i++) {
        const nextHole = ((selectedHole - 1 + i) % totalHoles) + 1;
        if (!result.scores[nextHole]) {
          setSelectedHole(nextHole);
          break;
        }
      }
    } catch (e) {
      showToast('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
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
  const isLocked = event.locked_at || event.status === 'completed';
  const totalHoles = event.holes;
  const currentPar = pars[selectedHole] || 4;

  // Calculate totals
  const holesEntered = Object.keys(scores).length;
  const totalStrokes = Object.values(scores).reduce((sum, s) => sum + s.strokes, 0);
  const totalPar = Object.keys(scores).reduce((sum, h) => sum + (pars[h] || 0), 0);

  return (
    <div className="score-page">
      {/* Header */}
      <div className="score-header">
        <h1>{event.name}</h1>
        <div className="team">{team.team_name}</div>
        {event.status !== 'live' && (
          <div style={{ marginTop: '0.5rem' }}>
            <span className={`badge badge-${event.status}`}>{event.status}</span>
          </div>
        )}
      </div>

      {isLocked && (
        <div className="locked-banner">
          🔒 This event is completed. Scores are locked.
        </div>
      )}

      {/* Hole Selector */}
      <div className="hole-selector">
        {Array.from({ length: totalHoles }, (_, i) => i + 1).map((h) => (
          <button
            key={h}
            className={`hole-btn ${selectedHole === h ? 'active' : ''} ${scores[h] ? 'has-score' : ''}`}
            onClick={() => setSelectedHole(h)}
          >
            {h}
          </button>
        ))}
      </div>

      {/* Stroke Input */}
      <div className="stroke-input-area">
        <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--green-900)', marginBottom: '0.25rem' }}>
          Hole {selectedHole}
        </div>
        <div className="par-display">Par <strong>{currentPar}</strong></div>
        {isLocked ? (
          <div style={{ fontSize: '2.5rem', fontWeight: 600, color: 'var(--green-900)', padding: '0.5rem 0' }}>
            {scores[selectedHole] ? scores[selectedHole].strokes : '—'}
            {scores[selectedHole] && <ScoreDiff strokes={scores[selectedHole].strokes} par={currentPar} />}
          </div>
        ) : (
          <>
            <input
              type="number"
              min="1"
              max="20"
              value={strokes}
              onChange={(e) => setStrokes(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder="—"
              autoFocus
            />
            <div className="save-row">
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !strokes}>
                {saving ? 'Saving...' : scores[selectedHole] ? 'Update Score' : 'Save Score'}
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
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: totalHoles }, (_, i) => i + 1).map((h) => {
                const s = scores[h];
                const par = pars[h] || 4;
                return (
                  <tr
                    key={h}
                    onClick={() => setSelectedHole(h)}
                    style={{ cursor: 'pointer', background: selectedHole === h ? 'var(--green-50)' : undefined }}
                  >
                    <td style={{ fontWeight: 600 }}>{h}</td>
                    <td>{par}</td>
                    <td style={{ fontWeight: s ? 600 : 400, color: s ? 'var(--slate-800)' : 'var(--slate-300)' }}>
                      {s ? s.strokes : '—'}
                    </td>
                    <td>
                      {s && <ScoreDiff strokes={s.strokes} par={par} />}
                    </td>
                  </tr>
                );
              })}
              {holesEntered > 0 && (
                <tr className="total-row">
                  <td>Total</td>
                  <td>{totalPar}</td>
                  <td>{totalStrokes}</td>
                  <td><ScoreDiff strokes={totalStrokes} par={totalPar} /></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
