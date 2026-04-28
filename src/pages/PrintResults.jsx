import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';

// Print-friendly final-results view at /admin/event/:eventId/print.
// Renders cleanly on letter / A4 with @media print rules; the user
// hits Cmd/Ctrl-P or the on-screen "Print / Save as PDF" button to
// produce a PDF via the browser's built-in PDF printer. This avoids
// shipping a binary PDF library inside the Worker (which is the
// constraint for V2 — no new paid third-party services and CSV
// first per the V2 plan).

function fmtToPar(v) {
  if (v == null) return '—';
  if (v === 0) return 'E';
  return v > 0 ? `+${v}` : `${v}`;
}

export default function PrintResults() {
  const { eventId } = useParams();
  const [event, setEvent] = useState(null);
  const [holes, setHoles] = useState([]);
  const [teams, setTeams] = useState([]);
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.getEvent(eventId), api.getGameResults(eventId)]).then(([d, g]) => {
      setEvent(d.event);
      setHoles(d.holes);
      setTeams(d.teams);
      setResults(g.results || {});
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [eventId]);

  if (loading) return <div className="page-shell"><div className="loading">Loading…</div></div>;
  if (error) return <div className="page-shell"><div className="card" style={{ color: 'var(--red-500)' }}>{error}</div></div>;
  if (!event) return null;

  const enabledGames = (() => {
    try { return JSON.parse(event.enabled_games_json || '[]'); } catch { return []; }
  })();

  const sp = results.stroke_play || [];
  const spByTeam = Object.fromEntries(sp.map((r) => [r.team_id, r]));

  return (
    <div className="print-page">
      <style>{`
        .print-page { padding: 24px; max-width: 8.5in; margin: 0 auto; font-size: 12pt; color: #111; background: white; }
        .print-page h1 { font-size: 22pt; margin: 0 0 4px; }
        .print-page h2 { font-size: 14pt; margin: 16px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
        .print-page table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10pt; }
        .print-page th, .print-page td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
        .print-page th { background: #f1f5f9; }
        .print-page .num { text-align: right; font-variant-numeric: tabular-nums; }
        .print-actions { display: flex; gap: 8px; margin-bottom: 16px; }
        @media print {
          .print-actions { display: none; }
          .print-page { padding: 0; }
          @page { margin: 0.4in; }
          .page-break { page-break-before: always; }
        }
      `}</style>
      <div className="print-actions no-print">
        <button className="btn btn-primary" onClick={() => window.print()}>🖨 Print / Save as PDF</button>
        <a className="btn btn-secondary" href={`/api/admin/events/${eventId}/export?format=csv`}>⬇ Download CSV</a>
      </div>
      <h1>{event.name}</h1>
      <div style={{ color: '#475569' }}>
        {event.date && <span>{event.date} · </span>}
        {event.holes} holes · status: {event.status}
        {event.locked_at && <> · locked {new Date(event.locked_at).toLocaleString()}</>}
      </div>

      {sp.length > 0 && (
        <>
          <h2>Stroke Play</h2>
          <table>
            <thead>
              <tr>
                <th>Pos</th><th>Team</th><th>HCP</th>
                <th className="num">Gross</th><th className="num">Net</th>
              </tr>
            </thead>
            <tbody>
              {sp.map((r, i) => (
                <tr key={r.team_id}>
                  <td>{i + 1}</td>
                  <td>{r.team_name}</td>
                  <td className="num">{r.handicap_strokes}</td>
                  <td className="num">{r.gross_strokes}</td>
                  <td className="num">{r.net_strokes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Per-team detailed scorecard */}
      <h2>Scorecards</h2>
      {teams.map((t) => {
        const scoreByHole = {};
        Object.entries(t.scores || {}).forEach(([h, v]) => { scoreByHole[h] = v?.strokes ?? v; });
        const total = holes.reduce((s, h) => s + (scoreByHole[h.hole_number] || 0), 0);
        const spRow = spByTeam[t.id];
        return (
          <div key={t.id} style={{ marginBottom: '12pt', breakInside: 'avoid' }}>
            <div style={{ fontWeight: 700, fontSize: '11pt' }}>
              {t.team_name}
              {t.players?.length > 0 && <span style={{ fontWeight: 400, color: '#475569', marginLeft: 8 }}>· {t.players.join(', ')}</span>}
            </div>
            <table>
              <thead>
                <tr>
                  <th>Hole</th>
                  {holes.map((h) => <th key={h.hole_number} className="num">{h.hole_number}</th>)}
                  <th className="num">Tot</th>
                </tr>
                <tr>
                  <th>Par</th>
                  {holes.map((h) => <th key={h.hole_number} className="num">{h.par}</th>)}
                  <th className="num">{holes.reduce((s, h) => s + h.par, 0)}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Strokes</td>
                  {holes.map((h) => <td key={h.hole_number} className="num">{scoreByHole[h.hole_number] ?? '—'}</td>)}
                  <td className="num"><strong>{total}</strong></td>
                </tr>
              </tbody>
            </table>
            {spRow && (
              <div style={{ fontSize: '10pt', color: '#475569' }}>
                Gross {spRow.gross_strokes} · Net {spRow.net_strokes} · vs par {fmtToPar(spRow.gross_strokes - holes.reduce((s, h) => s + h.par, 0))}
              </div>
            )}
          </div>
        );
      })}

      {/* Side games */}
      {enabledGames.includes('skins') && results.skins && (
        <>
          <h2>Skins</h2>
          <table>
            <thead><tr><th>Team</th><th className="num">Skins won</th></tr></thead>
            <tbody>
              {results.skins.map((r) => <tr key={r.team_id}><td>{r.team_name}</td><td className="num">{r.skins_won}</td></tr>)}
            </tbody>
          </table>
        </>
      )}
      {enabledGames.includes('match_play') && results.match_play && (
        <>
          <h2>Match Play</h2>
          <table>
            <thead><tr><th>Team</th><th className="num">Points</th></tr></thead>
            <tbody>
              {results.match_play.map((r) => <tr key={r.team_id}><td>{r.team_name}</td><td className="num">{r.points}</td></tr>)}
            </tbody>
          </table>
        </>
      )}
      {enabledGames.includes('jeff_martin') && results.jeff_martin && (
        <>
          <h2>Jeff Martin (Stableford)</h2>
          <table>
            <thead><tr><th>Team</th><th className="num">Points</th></tr></thead>
            <tbody>
              {results.jeff_martin.map((r) => <tr key={r.team_id}><td>{r.team_name}</td><td className="num">{r.points}</td></tr>)}
            </tbody>
          </table>
        </>
      )}

      <div style={{ marginTop: 24, fontSize: '9pt', color: '#94a3b8' }}>
        Generated {new Date().toLocaleString()} · Fairways Live
      </div>
    </div>
  );
}
