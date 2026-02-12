import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api';

function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

function TeamRow({ team, origin }) {
  const [copied, setCopied] = useState(false);
  const scoreUrl = `${origin}/score/${team.access_token}`;

  const copyUrl = () => {
    navigator.clipboard.writeText(scoreUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <tr>
      <td style={{ fontWeight: 500 }}>{team.team_name}</td>
      <td style={{ color: 'var(--slate-500)', fontSize: '0.85rem' }}>
        {team.players && team.players.length > 0 ? team.players.join(', ') : '—'}
      </td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <code style={{ fontSize: '0.7rem', color: 'var(--slate-500)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {scoreUrl}
          </code>
          <button className="copy-btn" onClick={copyUrl}>{copied ? '✓' : 'Copy'}</button>
        </div>
      </td>
      <td>
        <QRCodeSVG value={scoreUrl} size={48} level="M" />
      </td>
      <td style={{ fontSize: '0.8rem', color: 'var(--slate-400)' }}>
        {Object.keys(team.scores || {}).length} holes
      </td>
    </tr>
  );
}

export default function EventDetail() {
  const { eventId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add team form
  const [teamName, setTeamName] = useState('');
  const [players, setPlayers] = useState('');
  const [addingTeam, setAddingTeam] = useState(false);

  // Bulk import
  const [bulkText, setBulkText] = useState('');
  const [importing, setImporting] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  // Toast
  const [toast, setToast] = useState('');

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const load = useCallback(async () => {
    try {
      const d = await api.getEvent(eventId);
      setData(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const handleAddTeam = async () => {
    if (!teamName.trim()) return;
    setAddingTeam(true);
    try {
      const playerList = players.split(',').map(p => p.trim()).filter(Boolean);
      await api.addTeam(eventId, { team_name: teamName.trim(), players: playerList.length > 0 ? playerList : undefined });
      setTeamName('');
      setPlayers('');
      showToast('Team added');
      load();
    } catch (e) {
      showToast('Error: ' + e.message);
    } finally {
      setAddingTeam(false);
    }
  };

  const handleBulkImport = async () => {
    if (!bulkText.trim()) return;
    setImporting(true);
    try {
      const result = await api.bulkImport(eventId, bulkText);
      setBulkText('');
      setShowBulk(false);
      showToast(`Imported ${result.count} teams`);
      load();
    } catch (e) {
      showToast('Error: ' + e.message);
    } finally {
      setImporting(false);
    }
  };

  const handleStatusChange = async (status) => {
    try {
      await api.updateStatus(eventId, status);
      showToast(`Event status: ${status}`);
      load();
    } catch (e) {
      showToast('Error: ' + e.message);
    }
  };

  if (loading) return <div className="page-shell"><div className="loading">Loading...</div></div>;
  if (error) return <div className="page-shell"><div className="card" style={{ color: 'var(--red-500)' }}>{error}</div></div>;
  if (!data) return null;

  const { event, holes, teams } = data;
  const totalPar = holes.reduce((sum, h) => sum + h.par, 0);

  return (
    <div className="page-shell">
      <div className="breadcrumb">
        <Link to="/admin">Admin</Link> / <Link to={`/admin/org/${event.org_id}`}>Organization</Link> / Event
      </div>

      {/* Event Header */}
      <div className="page-header">
        <div>
          <h1>{event.name}</h1>
          <div style={{ color: 'var(--slate-500)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            {event.holes} holes · Par {totalPar} {event.date && `· ${event.date}`}
          </div>
        </div>
        <div className="status-controls">
          <StatusBadge status={event.status} />
          {event.status === 'draft' && (
            <button className="btn btn-primary btn-sm" onClick={() => handleStatusChange('live')}>Go Live</button>
          )}
          {event.status === 'live' && (
            <button className="btn btn-secondary btn-sm" onClick={() => handleStatusChange('completed')}>Complete</button>
          )}
          {event.status === 'completed' && (
            <button className="btn btn-secondary btn-sm" onClick={() => handleStatusChange('live')}>Reopen</button>
          )}
        </div>
      </div>

      {/* Par Summary */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Hole Pars</h2>
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          {holes.map((h) => (
            <div key={h.hole_number} style={{
              width: 44, textAlign: 'center', padding: '0.35rem 0',
              background: 'var(--green-50)', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--green-100)'
            }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--slate-500)', fontWeight: 600 }}>{h.hole_number}</div>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--green-800)' }}>{h.par}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Teams */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>Teams ({teams.length})</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowBulk(!showBulk)}>
              {showBulk ? 'Hide Bulk' : 'Bulk Import'}
            </button>
            <Link to={`/admin/event/${eventId}/qr-pack`} className="btn btn-secondary btn-sm">
              🖨 QR Pack
            </Link>
          </div>
        </div>

        {/* Add single team */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <input
            placeholder="Team name"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            style={{ flex: '1 1 200px', padding: '0.5rem 0.75rem', border: '1px solid var(--slate-300)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-body)' }}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTeam()}
          />
          <input
            placeholder="Players (comma separated, optional)"
            value={players}
            onChange={(e) => setPlayers(e.target.value)}
            style={{ flex: '2 1 300px', padding: '0.5rem 0.75rem', border: '1px solid var(--slate-300)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-body)' }}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTeam()}
          />
          <button className="btn btn-primary" onClick={handleAddTeam} disabled={addingTeam || !teamName.trim()}>
            {addingTeam ? 'Adding...' : '+ Add'}
          </button>
        </div>

        {/* Bulk import */}
        {showBulk && (
          <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--slate-50)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--slate-500)', marginBottom: '0.5rem' }}>
              One team per line: <code>Team Name, Player1, Player2, Player3, Player4</code>
            </div>
            <textarea
              rows={6}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"Eagles, John Smith, Jane Doe, Bob Wilson, Alice Brown\nBirdies, Tom Jones, Sarah Lee\nBogeys"}
              style={{ width: '100%', padding: '0.5rem', fontFamily: 'monospace', fontSize: '0.85rem', border: '1px solid var(--slate-300)', borderRadius: 'var(--radius-sm)', resize: 'vertical' }}
            />
            <button className="btn btn-primary btn-sm" onClick={handleBulkImport} disabled={importing || !bulkText.trim()} style={{ marginTop: '0.5rem' }}>
              {importing ? 'Importing...' : 'Import Teams'}
            </button>
          </div>
        )}

        {/* Teams table */}
        {teams.length === 0 ? (
          <div className="empty-state">No teams yet. Add teams above or use bulk import.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Team</th><th>Players</th><th>Score URL</th><th>QR</th><th>Progress</th></tr>
              </thead>
              <tbody>
                {teams.map((t) => <TeamRow key={t.id} team={t} origin={origin} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
