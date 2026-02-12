import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api';

export default function QRPack() {
  const { eventId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => {
    api.getEvent(eventId)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [eventId]);

  if (loading) return <div className="page-shell"><div className="loading">Loading...</div></div>;
  if (!data) return <div className="page-shell"><div className="card">Event not found</div></div>;

  const { event, teams } = data;

  return (
    <div className="page-shell">
      <div className="no-print" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="breadcrumb">
            <Link to="/admin">Admin</Link> / <Link to={`/admin/event/${eventId}`}>{event.name}</Link> / QR Pack
          </div>
          <h1 style={{ fontSize: '1.5rem', color: 'var(--green-900)' }}>QR Pack — {event.name}</h1>
          <p style={{ color: 'var(--slate-500)', fontSize: '0.9rem' }}>{teams.length} team cards</p>
        </div>
        <button className="btn btn-primary" onClick={() => window.print()}>
          🖨 Print
        </button>
      </div>

      {teams.length === 0 ? (
        <div className="card empty-state">No teams to print. <Link to={`/admin/event/${eventId}`}>Add teams first.</Link></div>
      ) : (
        <div className="qr-pack">
          {teams.map((team) => {
            const scoreUrl = `${origin}/score/${team.access_token}`;
            const shortCode = team.access_token.slice(0, 8);
            return (
              <div key={team.id} className="qr-card">
                <div className="event-name">{event.name}</div>
                <div className="team-name">{team.team_name}</div>
                <div className="qr-image">
                  <QRCodeSVG value={scoreUrl} size={180} level="M" includeMargin />
                </div>
                <div className="fallback-code">{shortCode}</div>
                <div className="full-url">{scoreUrl}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
