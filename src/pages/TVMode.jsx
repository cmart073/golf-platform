import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useLivePoll } from '../hooks/useLivePoll';

function formatToPar(val) {
  if (val === 0) return 'E';
  return val > 0 ? `+${val}` : `${val}`;
}

export default function TVMode() {
  const { orgSlug, eventSlug } = useParams();
  const [activeSponsor, setActiveSponsor] = useState(0);
  const [recentlyUpdated, setRecentlyUpdated] = useState(new Set());
  const prevTeamsRef = useRef(null);

  const fetcher = useCallback(async () => {
    const [lb, sp] = await Promise.all([
      api.getLeaderboard(orgSlug, eventSlug),
      api.getPublicSponsors(orgSlug, eventSlug).catch(() => []),
    ]);
    if (prevTeamsRef.current) {
      const prevMap = {};
      prevTeamsRef.current.forEach(t => { prevMap[t.id] = t; });
      const updated = new Set();
      lb.teams.forEach(t => {
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
    prevTeamsRef.current = lb.teams;
    return { lb, sponsors: sp };
  }, [orgSlug, eventSlug]);

  const { data: bundle, loading, isStale, isOffline } = useLivePoll(fetcher);
  const data = bundle?.lb;
  const sponsors = bundle?.sponsors || [];

  // Sponsor rotation
  useEffect(() => {
    if (sponsors.length <= 1) return;
    const interval = setInterval(() => {
      setActiveSponsor(prev => (prev + 1) % sponsors.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [sponsors.length]);

  if (loading) {
    return (
      <div className="tv-container">
        <div style={{ color: '#64748b', fontSize: '1.5rem' }}>Loading...</div>
      </div>
    );
  }

  if (!data) return null;
  const { event, teams, totals, hidden, org, branding } = data;
  const isLive = event.status === 'live';
  const isCompleted = event.status === 'completed';
  const brandColor = branding?.brand_color || null;
  const brandLogo = branding?.logo_url || null;

  return (
    <div className="tv-container" style={brandColor ? { '--brand-color': brandColor } : undefined}>
      {/* Header */}
      <div className="tv-header">
        <div className="tv-header-left" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {brandLogo && <img src={brandLogo} alt="" style={{ height: 64 }} />}
          <div>
            <div className="tv-event-name" style={brandColor ? { color: brandColor } : undefined}>{event.name}</div>
            <div className="tv-event-meta">
              {org && <span>{org.name}</span>}
              {event.date && <span>{event.date}</span>}
              <span>Par {totals.total_par}</span>
            </div>
          </div>
        </div>
        <div className="tv-header-right">
          {isLive && <div className="tv-live-badge">● LIVE</div>}
          {isCompleted && <div className="tv-final-badge">FINAL RESULTS</div>}
        </div>
      </div>

      {/* Leaderboard */}
      {hidden ? (
        <div className="tv-hidden">
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏌️</div>
          <div>Leaderboard will be revealed soon</div>
        </div>
      ) : (
        <div className="tv-board">
          <table className="tv-table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>POS</th>
                <th>TEAM</th>
                <th style={{ width: 140, textAlign: 'center' }}>TO PAR</th>
                <th style={{ width: 100, textAlign: 'center' }}>THRU</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team, i) => {
                const rank = i + 1;
                const isUpdated = recentlyUpdated.has(team.id);
                return (
                  <tr key={team.id} className={`tv-row ${isUpdated ? 'tv-row-updated' : ''} ${rank <= 3 ? 'tv-row-top' : ''}`}>
                    <td className="tv-rank">
                      {rank <= 3 ? (
                        <span className={`tv-rank-medal tv-rank-${rank}`}>{rank}</span>
                      ) : rank}
                    </td>
                    <td className="tv-team">{team.team_name}</td>
                    <td className={`tv-topar ${team.to_par < 0 ? 'under' : team.to_par > 0 ? 'over' : 'even'}`}>
                      {formatToPar(team.to_par)}
                    </td>
                    <td className="tv-thru">
                      {team.holes_completed === event.holes ? 'F' : team.holes_completed}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Sponsor Banner */}
      {sponsors.length > 0 && (
        <div className="tv-sponsors">
          {sponsors.map((sp, i) => (
            <div key={sp.id}
              className={`tv-sponsor ${i === activeSponsor ? 'tv-sponsor-active' : ''}`}
            >
              <img src={sp.logo_url} alt="Sponsor" />
            </div>
          ))}
        </div>
      )}

      {/* Clock + connection status */}
      <div className="tv-clock">
        {new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        {isOffline && <span style={{ marginLeft: 16, color: '#fb7185', fontSize: '0.7em' }}>● OFFLINE</span>}
        {!isOffline && isStale && <span style={{ marginLeft: 16, color: '#fbbf24', fontSize: '0.7em' }}>● STALE</span>}
      </div>
    </div>
  );
}
