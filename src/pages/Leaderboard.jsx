import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';

function formatToPar(val) {
  if (val === 0) return 'E';
  return val > 0 ? `+${val}` : `${val}`;
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
    }}>
      {rank}
    </span>
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

      // Track recently updated teams
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
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [orgSlug, eventSlug]);

  if (loading) return <div className="page-shell"><div className="loading">Loading leaderboard...</div></div>;
  if (error) return <div className="page-shell"><div className="card" style={{ color: 'var(--red-500)' }}>{error}</div></div>;
  if (!data) return null;

  const { event, teams, totals, hidden, org } = data;
  const isLive = event.status === 'live';
  const isCompleted = event.status === 'completed';

  return (
    <div className="page-shell" style={{ maxWidth: 800 }}>
      {/* Header */}
      <div className="lb-header">
        {org && <div className="lb-org">{org.name}</div>}
        <h1 className="lb-title">{event.name}</h1>
        <div className="lb-meta">
          {event.date && <span>{event.date}</span>}
          <span>Par {totals.total_par}</span>
          <span>{event.holes} holes</span>
          {isLive && <span className="badge badge-live" style={{ fontSize: '0.7rem' }}>● LIVE</span>}
          {isCompleted && <span className="badge badge-completed">FINAL</span>}
        </div>
      </div>

      {/* Hidden state */}
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
          {/* Leaderboard table */}
          <div className="lb-table-wrap">
            <table className="lb-table">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>Pos</th>
                  <th>Team</th>
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
                    <tr key={team.id}
                      className={`lb-row ${isUpdated ? 'lb-row-updated' : ''}`}
                      style={{ transition: 'all 0.4s ease' }}
                    >
                      <td><RankBadge rank={rank} /></td>
                      <td>
                        <div className="lb-team-name">{team.team_name}</div>
                        {team.last_updated && (
                          <div className="lb-team-updated">
                            {new Date(team.last_updated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </div>
                        )}
                      </td>
                      <td className="lb-to-par">
                        <span className={`lb-to-par-val ${team.to_par < 0 ? 'under' : team.to_par > 0 ? 'over' : 'even'}`}>
                          {formatToPar(team.to_par)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--slate-500)', fontSize: '0.9rem' }}>
                        {team.holes_completed === event.holes ? (
                          <span style={{ color: 'var(--green-700)' }}>F</span>
                        ) : (
                          team.holes_completed
                        )}
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

          {/* Last updated */}
          {lastFetch && (
            <div className="lb-footer">
              Last updated {lastFetch.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
              {isLive && ' · Refreshing every 10s'}
            </div>
          )}
        </>
      )}
    </div>
  );
}
