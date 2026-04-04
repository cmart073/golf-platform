import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';

// ── helpers ──────────────────────────────────────────────────────────────────

function toNum(v, def = 0) { const n = Number(v); return Number.isFinite(n) ? n : def; }

function formatToPar(v) {
  if (v === 0) return 'E';
  return v > 0 ? `+${v}` : `${v}`;
}

function computeLiveStandings(teams, holeCount, enabledGames) {
  const minHcp = Math.min(...teams.map(t => toNum(t.handicap_strokes)));

  // Stroke play net totals
  const strokePlay = teams.map(t => {
    const scores = Object.values(t.scores);
    const gross = scores.reduce((a, b) => a + b, 0);
    const net = gross - toNum(t.handicap_strokes);
    return { team_id: t.id, team_name: t.team_name, gross, net, holes: scores.length };
  }).sort((a, b) => a.net - b.net);

  // Skins
  let skins = null;
  if (enabledGames.includes('skins')) {
    const wins = {};
    teams.forEach(t => { wins[t.id] = 0; });
    let carry = 1;
    for (let h = 1; h <= holeCount; h++) {
      const holeScores = teams
        .map(t => {
          const s = t.scores[h];
          if (s == null) return null;
          const relHcp = toNum(t.handicap_strokes) - minHcp;
          return { team_id: t.id, team_name: t.team_name, net: s - relHcp / holeCount };
        })
        .filter(Boolean);
      if (holeScores.length < 2) continue;
      const best = Math.min(...holeScores.map(x => x.net));
      const winners = holeScores.filter(x => x.net === best);
      if (winners.length === 1) { wins[winners[0].team_id] += carry; carry = 1; }
      else { carry += 1; }
    }
    skins = teams.map(t => ({ team_id: t.id, team_name: t.team_name, skins: wins[t.id] }))
      .sort((a, b) => b.skins - a.skins);
  }

  // Match play
  let matchPlay = null;
  if (enabledGames.includes('match_play')) {
    const pts = {};
    teams.forEach(t => { pts[t.id] = 0; });
    for (let h = 1; h <= holeCount; h++) {
      const holeScores = teams
        .map(t => {
          const s = t.scores[h];
          if (s == null) return null;
          const relHcp = toNum(t.handicap_strokes) - minHcp;
          return { team_id: t.id, team_name: t.team_name, net: s - relHcp / holeCount };
        })
        .filter(Boolean);
      if (holeScores.length < 2) continue;
      const best = Math.min(...holeScores.map(x => x.net));
      const winners = holeScores.filter(x => x.net === best);
      const award = 1 / winners.length;
      winners.forEach(w => { pts[w.team_id] += award; });
    }
    matchPlay = teams.map(t => ({ team_id: t.id, team_name: t.team_name, points: +pts[t.id].toFixed(2) }))
      .sort((a, b) => b.points - a.points);
  }

  // BBB
  let bbb = null;
  if (enabledGames.includes('bingo') && enabledGames.includes('bango') && enabledGames.includes('bongo')) {
    const totals = {};
    teams.forEach(t => { totals[t.id] = 0; });
    bbb = { totals };
  }

  return { strokePlay, skins, matchPlay };
}

// ── Standings sidebar ─────────────────────────────────────────────────────────

function Standings({ teams, holes, enabledGames, bbbByHole }) {
  const holeCount = holes.length;
  const { strokePlay, skins, matchPlay } = computeLiveStandings(teams, holeCount, enabledGames);

  // BBB totals from bbbByHole
  const bbbTotals = {};
  teams.forEach(t => { bbbTotals[t.id] = 0; });
  if (enabledGames.includes('bingo')) {
    Object.values(bbbByHole).forEach(hole => {
      ['bingo', 'bango', 'bongo'].forEach(g => {
        if (hole[g] && bbbTotals[hole[g]] !== undefined) bbbTotals[hole[g]] += 1;
      });
    });
  }
  const bbbRows = teams
    .map(t => ({ team_id: t.id, team_name: t.team_name, points: bbbTotals[t.id] || 0 }))
    .sort((a, b) => b.points - a.points);

  const hasBBB = enabledGames.includes('bingo') && enabledGames.includes('bango') && enabledGames.includes('bongo');
  const hasStroke = enabledGames.includes('stroke_play');
  const hasNassau = enabledGames.includes('nassau');
  const hasNinePoints = enabledGames.includes('nine_points');

  // Nassau — compute front/back/overall inline (same logic as match play but segmented)
  let nassauFront = null, nassauBack = null, nassauOverall = null;
  if (hasNassau) {
    const minHcp = Math.min(...teams.map(t => toNum(t.handicap_strokes)));
    const front9End = Math.min(9, holeCount);
    const computeRange = (start, end) => {
      const pts = {};
      teams.forEach(t => { pts[t.id] = 0; });
      for (let h = start; h <= end; h++) {
        const hs = teams.map(t => {
          const s = t.scores[h];
          if (s == null) return null;
          const relHcp = toNum(t.handicap_strokes) - minHcp;
          return { team_id: t.id, team_name: t.team_name, net: s - relHcp / holeCount };
        }).filter(Boolean);
        if (hs.length < 2) continue;
        const best = Math.min(...hs.map(x => x.net));
        const winners = hs.filter(x => x.net === best);
        winners.forEach(w => { pts[w.team_id] += 1 / winners.length; });
      }
      return teams.map(t => ({ team_id: t.id, team_name: t.team_name, points: +pts[t.id].toFixed(2) }))
        .sort((a, b) => b.points - a.points);
    };
    nassauFront = computeRange(1, front9End);
    if (holeCount > 9) nassauBack = computeRange(10, holeCount);
    nassauOverall = computeRange(1, holeCount);
  }

  // Nine Points
  let ninePointsResults = null;
  if (hasNinePoints) {
    const minHcp = Math.min(...teams.map(t => toNum(t.handicap_strokes)));
    const pts = {};
    teams.forEach(t => { pts[t.id] = 0; });
    for (let h = 1; h <= holeCount; h++) {
      const hs = teams.map(t => {
        const s = t.scores[h];
        if (s == null) return null;
        return { team_id: t.id, net: s - (toNum(t.handicap_strokes) - minHcp) / holeCount };
      }).filter(Boolean);
      if (hs.length < 2) continue;
      hs.sort((a, b) => a.net - b.net);
      if (hs.length === 2) { pts[hs[0].team_id] += 6; pts[hs[1].team_id] += 3; }
      else if (hs.length === 3) {
        const allSame = hs[0].net === hs[2].net;
        if (allSame) hs.forEach(x => { pts[x.team_id] += 3; });
        else if (hs[0].net === hs[1].net) { hs.slice(0,2).forEach(x => { pts[x.team_id] += 4; }); pts[hs[2].team_id] += 1; }
        else if (hs[1].net === hs[2].net) { pts[hs[0].team_id] += 5; hs.slice(1).forEach(x => { pts[x.team_id] += 2; }); }
        else { pts[hs[0].team_id] += 5; pts[hs[1].team_id] += 3; pts[hs[2].team_id] += 1; }
      } else {
        const share = 9 / hs.length;
        hs.forEach(x => { pts[x.team_id] += share; });
      }
    }
    ninePointsResults = teams.map(t => ({ team_id: t.id, team_name: t.team_name, points: +pts[t.id].toFixed(1) }))
      .sort((a, b) => b.points - a.points);
  }

  const StandingBlock = ({ title, rows, valKey = 'points', suffix = 'pts' }) => (
    <div className="ms-standing-block">
      <div className="ms-standing-title">{title}</div>
      {rows.map((r, i) => (
        <div key={r.team_id} className="ms-standing-row">
          <span className="ms-standing-pos">{i + 1}</span>
          <span className="ms-standing-name">{r.team_name}</span>
          <span className="ms-standing-val even">{r[valKey]} {suffix}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="ms-standings">
      {hasStroke && (
        <div className="ms-standing-block">
          <div className="ms-standing-title">⛳ Stroke Play</div>
          {strokePlay.map((r, i) => (
            <div key={r.team_id} className="ms-standing-row">
              <span className="ms-standing-pos">{i + 1}</span>
              <span className="ms-standing-name">{r.team_name}</span>
              <span className={`ms-standing-val ${r.net < 0 ? 'under' : r.net > 0 ? 'over' : 'even'}`}>
                {r.holes > 0 ? formatToPar(r.net) : '—'}
              </span>
            </div>
          ))}
        </div>
      )}

      {matchPlay && <StandingBlock title="🥊 Match Play" rows={matchPlay} />}
      {skins && <StandingBlock title="🏆 Skins" rows={skins} valKey="skins" suffix="🏆" />}

      {hasNassau && nassauFront && (
        <div className="ms-standing-block">
          <div className="ms-standing-title">💰 Nassau</div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--slate-400)', marginBottom: '0.25rem' }}>FRONT 9</div>
          {nassauFront.map((r, i) => (
            <div key={r.team_id} className="ms-standing-row">
              <span className="ms-standing-pos">{i + 1}</span>
              <span className="ms-standing-name">{r.team_name}</span>
              <span className="ms-standing-val even">{r.points} pts</span>
            </div>
          ))}
          {nassauBack && (
            <>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--slate-400)', margin: '0.5rem 0 0.25rem' }}>BACK 9</div>
              {nassauBack.map((r, i) => (
                <div key={r.team_id} className="ms-standing-row">
                  <span className="ms-standing-pos">{i + 1}</span>
                  <span className="ms-standing-name">{r.team_name}</span>
                  <span className="ms-standing-val even">{r.points} pts</span>
                </div>
              ))}
            </>
          )}
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--slate-400)', margin: '0.5rem 0 0.25rem' }}>OVERALL</div>
          {nassauOverall.map((r, i) => (
            <div key={r.team_id} className="ms-standing-row">
              <span className="ms-standing-pos">{i + 1}</span>
              <span className="ms-standing-name">{r.team_name}</span>
              <span className="ms-standing-val even">{r.points} pts</span>
            </div>
          ))}
        </div>
      )}

      {ninePointsResults && <StandingBlock title="🎯 9 Points" rows={ninePointsResults} />}

      {hasBBB && <StandingBlock title="🎲 Bingo Bango Bongo" rows={bbbRows} />}
    </div>
  );
}

// ── BBB hole assigner ─────────────────────────────────────────────────────────

function BBBRow({ label, emoji, gameType, teams, holeNum, currentTeamId, onAssign, disabled }) {
  return (
    <div className="ms-bbb-row">
      <div className="ms-bbb-label">{emoji} {label}</div>
      <div className="ms-bbb-buttons">
        {teams.map(t => (
          <button
            key={t.id}
            className={`ms-bbb-btn ${currentTeamId === t.id ? 'ms-bbb-active' : ''}`}
            onClick={() => onAssign(gameType, currentTeamId === t.id ? null : t.id)}
            disabled={disabled}
          >
            {t.team_name}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MatchScorer() {
  const { scorerToken } = useParams();
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedHole, setSelectedHole] = useState(1);
  const [holeScores, setHoleScores] = useState({}); // { team_id: strokes_string }
  const [saving, setSaving] = useState(false);
  const [bbbSaving, setBbbSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [showStandings, setShowStandings] = useState(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const load = useCallback(async () => {
    try {
      const data = await api.getMatchContext(scorerToken);
      setCtx(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [scorerToken]);

  useEffect(() => { load(); }, [load]);

  // Populate hole score inputs when hole or ctx changes
  useEffect(() => {
    if (!ctx) return;
    const scores = {};
    ctx.teams.forEach(t => {
      const s = t.scores[selectedHole];
      scores[t.id] = s != null ? String(s) : '';
    });
    setHoleScores(scores);
  }, [selectedHole, ctx]);

  if (loading) return <div className="score-page"><div className="loading">Loading...</div></div>;
  if (error) return (
    <div className="score-page">
      <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⛳</div>
        <h2 style={{ color: 'var(--red-500)', marginBottom: '0.5rem' }}>Invalid Link</h2>
        <p style={{ color: 'var(--slate-500)' }}>This scorer link is not valid.</p>
      </div>
    </div>
  );
  if (!ctx) return null;

  const { event, holes, teams, bbb: bbbByHole, wolf_picks: wolfPicks = [], presses = [], bet_config: betConfig = {} } = ctx;
  const enabledGames = event.enabled_games || ['stroke_play'];
  const hasBBB = enabledGames.includes('bingo') && enabledGames.includes('bango') && enabledGames.includes('bongo');
  const hasWolf = enabledGames.includes('wolf');
  const hasNassau = enabledGames.includes('nassau');
  const isLocked = !!event.locked_at || event.status === 'completed';
  const isNotLive = event.status !== 'live' && event.status !== 'completed';
  const currentHolePar = holes.find(h => h.hole_number === selectedHole)?.par ?? 4;
  const currentBBB = bbbByHole[selectedHole] || {};

  // Wolf state
  const wolfPickMap = {};
  wolfPicks.forEach(wp => { wolfPickMap[wp.hole_number] = wp; });
  const currentWolf = wolfPickMap[selectedHole];
  const wolfOrder = teams.length > 0 ? teams[(selectedHole - 1) % teams.length] : null;

  const handleWolfPick = async (partnerId) => {
    try {
      await api.submitMatchWolf(scorerToken, {
        hole_number: selectedHole,
        wolf_team_id: wolfOrder.id,
        partner_team_id: partnerId,
      });
      showToast(partnerId ? `Wolf picked partner` : `🐺 LONE WOLF!`);
      await load();
    } catch (e) { showToast('Error: ' + e.message); }
  };

  // Press handler
  const handlePress = async (gameType) => {
    const pressTeam = teams[0]; // first team presses by default — could be expanded
    try {
      await api.submitMatchPress(scorerToken, {
        team_id: pressTeam.id,
        game_type: gameType,
        hole_number: selectedHole,
      });
      showToast(`🔥 PRESS on ${gameType.replace('_', ' ')}!`);
      await load();
    } catch (e) { showToast('Error: ' + e.message); }
  };

  // Count holes with all scores entered
  const holesComplete = holes.filter(h =>
    teams.every(t => t.scores[h.hole_number] != null)
  ).length;

  const handleSaveHole = async () => {
    const scores = teams.map(t => ({
      team_id: t.id,
      strokes: parseInt(holeScores[t.id]),
    })).filter(s => !isNaN(s.strokes) && s.strokes >= 1 && s.strokes <= 20);

    if (scores.length === 0) { showToast('Enter at least one score'); return; }
    setSaving(true);
    try {
      await api.submitMatchHole(scorerToken, { hole_number: selectedHole, scores });
      showToast(`Hole ${selectedHole} saved ✓`);
      await load();
      // Auto-advance to next incomplete hole
      for (let i = 1; i <= holes.length; i++) {
        const nextHole = ((selectedHole - 1 + i) % holes.length) + 1;
        const nextComplete = teams.every(t => {
          // Check the freshly loaded ctx
          return false; // always advance once after save
        });
        setSelectedHole(nextHole);
        break;
      }
    } catch (e) { showToast('Error: ' + e.message); }
    finally { setSaving(false); }
  };

  const handleBBBAssign = async (gameType, teamId) => {
    setBbbSaving(true);
    try {
      const update = {
        hole_number: selectedHole,
        bingo: currentBBB.bingo || null,
        bango: currentBBB.bango || null,
        bongo: currentBBB.bongo || null,
        [gameType]: teamId,
      };
      await api.submitMatchBBB(scorerToken, update);
      await load();
    } catch (e) { showToast('Error: ' + e.message); }
    finally { setBbbSaving(false); }
  };

  return (
    <div className="ms-page">
      {/* Header */}
      <div className="ms-header">
        <div className="ms-header-left">
          <div className="ms-event-name">{event.name}</div>
          <div className="ms-event-meta">
            {event.date && <span>{event.date}</span>}
            <span>{holesComplete}/{holes.length} holes complete</span>
            {event.status === 'live' && <span className="badge badge-live" style={{ fontSize: '0.65rem' }}>● LIVE</span>}
            {event.status === 'completed' && <span className="badge badge-completed">FINAL</span>}
          </div>
        </div>
        <button
          className={`ms-standings-toggle ${showStandings ? 'active' : ''}`}
          onClick={() => setShowStandings(s => !s)}
        >
          {showStandings ? '✕ Close' : '📊 Standings'}
        </button>
      </div>

      {/* Standings panel */}
      {showStandings && (
        <Standings
          teams={teams}
          holes={holes}
          enabledGames={enabledGames}
          bbbByHole={bbbByHole}
        />
      )}

      {/* Status banners */}
      {isLocked && (
        <div className="locked-banner">🔒 Round complete — scores are final</div>
      )}
      {isNotLive && (
        <div className="locked-banner" style={{ background: 'var(--slate-100)', borderColor: 'var(--slate-200)' }}>
          Round hasn't started yet. Check back soon!
        </div>
      )}

      {/* Hole selector */}
      <div className="hole-selector">
        {holes.map(h => {
          const complete = teams.every(t => t.scores[h.hole_number] != null);
          return (
            <button
              key={h.hole_number}
              className={`hole-btn ${selectedHole === h.hole_number ? 'active' : ''} ${complete ? 'has-score' : ''}`}
              onClick={() => setSelectedHole(h.hole_number)}
            >
              {h.hole_number}
            </button>
          );
        })}
      </div>

      {/* Score entry card */}
      {!isLocked && !isNotLive && (
        <div className="ms-score-card">
          <div className="ms-hole-header">
            <span className="ms-hole-label">Hole {selectedHole}</span>
            <span className="ms-par-label">Par {currentHolePar}</span>
          </div>

          <div className="ms-score-grid">
            {teams.map(t => {
              const val = holeScores[t.id] ?? '';
              const strokes = parseInt(val);
              const diff = !isNaN(strokes) && strokes > 0 ? strokes - currentHolePar : null;
              return (
                <div key={t.id} className="ms-score-row">
                  <div className="ms-player-name">{t.team_name}</div>
                  {t.handicap_strokes > 0 && (
                    <div className="ms-hcp-badge">HCP {t.handicap_strokes}</div>
                  )}
                  <div className="ms-input-wrap">
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={val}
                      onChange={e => setHoleScores(prev => ({ ...prev, [t.id]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && handleSaveHole()}
                      className="ms-score-input"
                      placeholder="—"
                    />
                    {diff !== null && (
                      <span className={`ms-score-diff ${diff < 0 ? 'under' : diff > 0 ? 'over' : 'even'}`}>
                        {diff === 0 ? 'E' : diff > 0 ? `+${diff}` : diff}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.75rem', padding: '0.7rem', fontSize: '1rem' }}
            onClick={handleSaveHole}
            disabled={saving}
          >
            {saving ? 'Saving...' : `Save Hole ${selectedHole}`}
          </button>
        </div>
      )}

      {/* Locked view — show entered scores read-only */}
      {(isLocked || isNotLive) && (
        <div className="ms-score-card">
          <div className="ms-hole-header">
            <span className="ms-hole-label">Hole {selectedHole}</span>
            <span className="ms-par-label">Par {currentHolePar}</span>
          </div>
          <div className="ms-score-grid">
            {teams.map(t => {
              const s = t.scores[selectedHole];
              const diff = s != null ? s - currentHolePar : null;
              return (
                <div key={t.id} className="ms-score-row">
                  <div className="ms-player-name">{t.team_name}</div>
                  <div className="ms-input-wrap">
                    <span className="ms-score-readonly">{s ?? '—'}</span>
                    {diff !== null && (
                      <span className={`ms-score-diff ${diff < 0 ? 'under' : diff > 0 ? 'over' : 'even'}`}>
                        {diff === 0 ? 'E' : diff > 0 ? `+${diff}` : diff}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* BBB assignment */}
      {hasBBB && !isLocked && !isNotLive && (
        <div className="ms-bbb-card">
          <div className="ms-bbb-header">Hole {selectedHole} · Bingo Bango Bongo</div>
          <BBBRow
            label="Bingo" emoji="🟢" gameType="bingo"
            teams={teams} holeNum={selectedHole}
            currentTeamId={currentBBB.bingo || null}
            onAssign={handleBBBAssign} disabled={bbbSaving}
          />
          <BBBRow
            label="Bango" emoji="🎯" gameType="bango"
            teams={teams} holeNum={selectedHole}
            currentTeamId={currentBBB.bango || null}
            onAssign={handleBBBAssign} disabled={bbbSaving}
          />
          <BBBRow
            label="Bongo" emoji="🏌️" gameType="bongo"
            teams={teams} holeNum={selectedHole}
            currentTeamId={currentBBB.bongo || null}
            onAssign={handleBBBAssign} disabled={bbbSaving}
          />
        </div>
      )}

      {/* Wolf Picker */}
      {hasWolf && !isLocked && !isNotLive && (
        <div className="ms-bbb-card" style={{ borderLeft: '3px solid #f59e0b' }}>
          <div className="ms-bbb-header">🐺 Hole {selectedHole} · Wolf</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--slate-500)', marginBottom: '0.75rem' }}>
            Wolf: <strong>{wolfOrder?.team_name || '—'}</strong>
            {currentWolf && (
              <span> → {currentWolf.partner_team_id
                ? teams.find(t => t.id === currentWolf.partner_team_id)?.team_name || '?'
                : '🐺 LONE WOLF'
              }</span>
            )}
          </div>
          {wolfOrder && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {teams.filter(t => t.id !== wolfOrder.id).map(t => (
                <button
                  key={t.id}
                  className={`ms-bbb-btn ${currentWolf?.partner_team_id === t.id ? 'ms-bbb-active' : ''}`}
                  onClick={() => handleWolfPick(t.id)}
                >
                  {t.team_name}
                </button>
              ))}
              <button
                className={`ms-bbb-btn ${currentWolf && !currentWolf.partner_team_id ? 'ms-bbb-active' : ''}`}
                style={{ background: currentWolf && !currentWolf.partner_team_id ? '#f59e0b' : undefined,
                         color: currentWolf && !currentWolf.partner_team_id ? 'white' : undefined,
                         fontWeight: 700 }}
                onClick={() => handleWolfPick(null)}
              >
                🐺 LONE WOLF
              </button>
            </div>
          )}
        </div>
      )}

      {/* Press Buttons */}
      {!isLocked && !isNotLive && (hasNassau || enabledGames.includes('match_play') || enabledGames.includes('skins')) && (
        <div className="ms-bbb-card" style={{ borderLeft: '3px solid #ef4444' }}>
          <div className="ms-bbb-header">🔥 Press</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--slate-500)', marginBottom: '0.75rem' }}>
            Double down from hole {selectedHole} forward. No take-backs.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {hasNassau && (
              <>
                <button className="btn btn-sm" style={{ background: '#dc2626', color: 'white', border: 'none' }}
                  onClick={() => handlePress('nassau_front')}>
                  Press Front 9
                </button>
                {holes.length > 9 && (
                  <button className="btn btn-sm" style={{ background: '#dc2626', color: 'white', border: 'none' }}
                    onClick={() => handlePress('nassau_back')}>
                    Press Back 9
                  </button>
                )}
                <button className="btn btn-sm" style={{ background: '#dc2626', color: 'white', border: 'none' }}
                  onClick={() => handlePress('nassau_overall')}>
                  Press Overall
                </button>
              </>
            )}
            {enabledGames.includes('match_play') && (
              <button className="btn btn-sm" style={{ background: '#dc2626', color: 'white', border: 'none' }}
                onClick={() => handlePress('match_play')}>
                Press Match Play
              </button>
            )}
            {enabledGames.includes('skins') && (
              <button className="btn btn-sm" style={{ background: '#dc2626', color: 'white', border: 'none' }}
                onClick={() => handlePress('skins')}>
                Press Skins
              </button>
            )}
          </div>
          {presses.length > 0 && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--slate-500)' }}>
              <strong>Active presses:</strong>
              {presses.map((p, i) => (
                <div key={i}>🔥 {teams.find(t => t.id === p.team_id)?.team_name || '?'} pressed {p.game_type.replace(/_/g, ' ')} from hole {p.hole_number}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Scorecard summary */}
      <div className="ms-summary-card">
        <div className="ms-summary-title">Scorecard</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="ms-scorecard-table">
            <thead>
              <tr>
                <th>Hole</th>
                {holes.map(h => (
                  <th
                    key={h.hole_number}
                    className={selectedHole === h.hole_number ? 'ms-sc-active-hole' : ''}
                    onClick={() => setSelectedHole(h.hole_number)}
                    style={{ cursor: 'pointer' }}
                  >
                    {h.hole_number}
                  </th>
                ))}
                <th>TOT</th>
              </tr>
              <tr className="ms-sc-par-row">
                <td>Par</td>
                {holes.map(h => <td key={h.hole_number}>{h.par}</td>)}
                <td>{holes.reduce((s, h) => s + h.par, 0)}</td>
              </tr>
            </thead>
            <tbody>
              {teams.map(t => {
                const gross = Object.values(t.scores).reduce((a, b) => a + b, 0);
                const net = gross - toNum(t.handicap_strokes);
                return (
                  <tr key={t.id}>
                    <td className="ms-sc-player">{t.team_name}</td>
                    {holes.map(h => {
                      const s = t.scores[h.hole_number];
                      const diff = s != null ? s - h.par : null;
                      return (
                        <td
                          key={h.hole_number}
                          className={`ms-sc-cell ${selectedHole === h.hole_number ? 'ms-sc-active-hole' : ''} ${diff !== null ? (diff < 0 ? 'birdie' : diff > 0 ? 'bogey' : '') : ''}`}
                          onClick={() => setSelectedHole(h.hole_number)}
                          style={{ cursor: 'pointer' }}
                        >
                          {s ?? '—'}
                        </td>
                      );
                    })}
                    <td className="ms-sc-total">
                      {gross > 0 ? (
                        <>
                          <span>{gross}</span>
                          {t.handicap_strokes > 0 && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--slate-400)', display: 'block' }}>
                              net {net}
                            </span>
                          )}
                        </>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
