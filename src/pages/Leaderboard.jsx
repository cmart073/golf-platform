import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';

function formatToPar(val) {
  if (val === 0) return 'E';
  return val > 0 ? `+${val}` : `${val}`;
}

function gameLabel(key) {
  const labels = {
    stroke_play: 'Stroke Play',
    match_play: 'Match Play',
    skins: 'Skins',
    bingo_bango_bongo: 'Bingo Bango Bongo',
    jeff_martin: '🎖️ Jeff Martin',
  };
  return labels[key] ?? key.replaceAll('_', ' ');
}

function gameStat(game, row) {
  if (game === 'stroke_play') {
    const net = row.net_strokes;
    const gross = row.gross_strokes;
    if (net === 0) return 'E (net)';
    const netStr = net > 0 ? `+${net}` : `${net}`;
    return `${netStr} (gross: ${gross})`;
  }
  if (game === 'match_play') return `${row.points} pts`;
  if (game === 'skins') return `${row.skins_won} skin${row.skins_won !== 1 ? 's' : ''}`;
  if (game === 'bingo_bango_bongo') return `${row.points} pts`;
  if (game === 'jeff_martin') return `${row.points} pts`;
  return row.net_strokes ?? row.points ?? row.skins_won;
}

function RankBadge({ rank }) {
  const colors = {
    1: { bg: '#fef3c7', color: '#92400e', border: '#fbbf24' },
    2: { bg: '#f1f5f9', color: '#475569', border: '#94a3b8' },
    3: { bg: '#fff7ed', color: '#9a3412', border: '#fb923c' },
  };
  const style = colors[rank] || { bg: 'transparent', color: 'var(--slate-600)', border: 'transparent' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 32, height: 32, borderRadius: '50%', fontSize: '0.85rem', fontWeight: 700,
      background: style.bg, color: style.color, border: `2px solid ${style.border}`,
    }}>{rank}</span>
  );
}

export default function Leaderboard() {
  const { orgSlug, eventSlug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastFetch, setLastFetch] = useState(null);
  const [recentlyUpdated, setRecentlyUpdated] = useState(new Set());
  const prevTeamsRef = useRef(null);

  const fetchData = async () => {
    try {
      const d = await api.getLeaderboard(orgSlug, eventSlug);
      if (prevTeamsRef.current) {
        const prevMap = {};
        prevTeamsRef.current.forEach(t => { prevMap[t.id] = t; });
        const updated = new Set();
        d.teams.forEach(t => {
          const prev = prevMap[t.id];
          if (prev && (prev.strokes_completed !== t.strokes_completed || prev.to_par !== t.to_par)) {
            updated.add(t.id);
          }
        });
        if (updated.size > 0) {
          setRecentlyUpdated(updated);
          setTimeout(() => setRecentlyUpdated(new Set()), 3000);
        }
      }
      prevTeamsRef.current = d.teams;
      setData(d);
      setLastFetch(new Date());
      setError('');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [orgSlug, eventSlug]);

  if (loading) return <div className="page-shell"><div className="loading">Loading leaderboard...</div></div>;
  if (error) return <div className="page-shell"><div className="card" style={{ color: 'var(--red-500)' }}>{error}</div></div>;
  if (!data) return null;

  const { event, teams, totals, hidden, org, game_results } = data;
  const isLive = event.status === 'live';
  const isCompleted = event.status === 'completed';
  const isWeeklyMatch = event.event_type === 'weekly_match';
  const enabledGames = event.enabled_games || [];
  const jmEnabled = enabledGames.includes('jeff_martin');
  const hasGameResults = game_results && Object.keys(game_results).length > 0;

  return (
    <div className="page-shell" style={{ maxWidth: 800 }}>
      <div className="lb-header">
        {org && <div className="lb-org">{org.name}</div>}
        <h1 className="lb-title">{event.name}</h1>
        <div className="lb-meta">
          {event.date && <span>{event.date}</span>}
          <span>Par {totals.total_par}</span>
          <span>{event.holes} holes</span>
          {isWeeklyMatch && <span className="badge badge-draft" style={{ fontSize: '0.7rem' }}>Weekly Match</span>}
          {isLive && <span className="badge badge-live" style={{ fontSize: '0.7rem' }}>● LIVE</span>}
          {isCompleted && <span className="badge badge-completed">FINAL RESULTS</span>}
        </div>
      </div>

      {hidden ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🏌️</div>
          <h2 style={{ color: 'var(--slate-600)', marginBottom: '0.5rem' }}>Leaderboard Hidden</h2>
          <p style={{ color: 'var(--slate-400)' }}>The leaderboard will be revealed soon. Stay tuned!</p>
        </div>
      ) : teams.length === 0 ? (
        <div className="card empty-state">No teams have entered scores yet.</div>
      ) : (
        <>
          {/* Stroke play / main leaderboard */}
          <div className="lb-table-wrap">
            {jmEnabled && (
              <div className="lb-mode-tag">🎖️ Ranked by Jeff Martin points (Modified Stableford)</div>
            )}
            <table className="lb-table">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>Pos</th>
                  <th>Team</th>
                  {jmEnabled && <th style={{ width: 70, textAlign: 'center' }}>Pts</th>}
                  <th style={{ width: 80, textAlign: 'center' }}>To Par</th>
                  <th style={{ width: 70, textAlign: 'center' }}>Thru</th>
                  <th style={{ width: 70, textAlign: 'center' }}>Proj</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team, i) => {
                  const rank = i + 1;
                  const isUpdated = recentlyUpdated.has(team.id);
                  return (
                    <tr key={team.id} className={`lb-row ${isUpdated ? 'lb-row-updated' : ''}`}>
                      <td><RankBadge rank={rank} /></td>
                      <td>
                        <div className="lb-team-name">
                          {team.team_name}
                          {team.submitted && <span className="lb-submitted-icon" title="Scores submitted">✓</span>}
                        </div>
                        {team.last_updated && (
                          <div className="lb-team-updated">
                            {new Date(team.last_updated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </div>
                        )}
                      </td>
                      {jmEnabled && (
                        <td className="lb-jm-pts">
                          <span className="lb-jm-pts-val">{team.jm_points ?? 0}</span>
                          {team.jm_your_hole_count > 0 && (
                            <span className="lb-jm-yh" title={`${team.jm_your_hole_count} your-hole bonus${team.jm_your_hole_count === 1 ? '' : 'es'}`}>
                              ●{team.jm_your_hole_count}
                            </span>
                          )}
                        </td>
                      )}
                      <td className="lb-to-par">
                        <span className={`lb-to-par-val ${team.to_par < 0 ? 'under' : team.to_par > 0 ? 'over' : 'even'}`}>
                          {formatToPar(team.to_par)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--slate-500)', fontSize: '0.9rem' }}>
                        {team.holes_completed === event.holes ? (
                          <span style={{ color: 'var(--green-700)', fontWeight: 600 }}>F</span>
                        ) : team.holes_completed}
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--slate-400)', fontSize: '0.85rem' }}>
                        {team.projected_total}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {lastFetch && (
            <div className="lb-footer">
              Last updated {lastFetch.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
              {isLive && ' · Refreshing every 10s'}
            </div>
          )}

          {/* Side game results — only shown for weekly match or when games beyond stroke play are active */}
          {hasGameResults && (
            <div style={{ marginTop: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--green-900)', marginBottom: '0.75rem', fontSize: '1.4rem' }}>
                🎮 Side Games
              </h2>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {Object.entries(game_results).map(([game, rows]) => (
                  <div className="card" key={game} style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.5rem', color: 'var(--green-800)', fontSize: '0.95rem' }}>
                      {gameLabel(game)}
                    </div>
                    {rows.map((r, i) => (
                      <div key={r.team_id} style={{
                        display: 'flex', justifyContent: 'space-between',
                        fontSize: '0.9rem', padding: '0.2rem 0',
                        borderBottom: i < rows.length - 1 ? '1px solid var(--slate-100)' : 'none',
                      }}>
                        <span>
                          <span style={{ fontWeight: 600, color: 'var(--slate-500)', marginRight: '0.5rem' }}>{i + 1}.</span>
                          {r.team_name}
                        </span>
                        <span style={{ fontWeight: 600, color: 'var(--green-800)' }}>{gameStat(game, r)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
