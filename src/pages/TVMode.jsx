import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';

function formatToPar(val) {
  if (val === 0) return 'E';
  return val > 0 ? `+${val}` : `${val}`;
}

export default function TVMode() {
  const { orgSlug, eventSlug } = useParams();
  const [data, setData] = useState(null);
  const [sponsors, setSponsors] = useState([]);
  const [activeSponsor, setActiveSponsor] = useState(0);
  const [loading, setLoading] = useState(true);
  const [recentlyUpdated, setRecentlyUpdated] = useState(new Set());
  const prevTeamsRef = useRef(null);

  const fetchData = async () => {
    try {
      const [lb, sp] = await Promise.all([
        api.getLeaderboard(orgSlug, eventSlug),
        api.getPublicSponsors(orgSlug, eventSlug).catch(() => []),
      ]);

      // Track changes
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

      setData(lb);
      setSponsors(sp);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [orgSlug, eventSlug]);

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
  const { event, teams, totals, hidden, org } = data;
  const isLive = event.status === 'live';
  const isCompleted = event.status === 'completed';

  return (
    <div className="tv-container">
      {/* Header */}
      <div className="tv-header">
        <div className="tv-header-left">
          <div className="tv-event-name">{event.name}</div>
          <div className="tv-event-meta">
            {org && <span>{org.name}</span>}
            {event.date && <span>{event.date}</span>}
            <span>Par {totals.total_par}</span>
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

      {/* Clock */}
      <div className="tv-clock">
        {new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
      </div>
    </div>
  );
}
