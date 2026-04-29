import React, { useEffect, useMemo, useState } from 'react';

// Roster step: paste/upload teams, live preview with duplicate flagging.
// Empty roster is allowed — the organizer can add teams later.

export function parseTeamCsv(raw) {
  const lines = (raw || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const [first, ...rest] = lines;
  const looksLikeHeader = first && /^team|^team\s*name/i.test(first);
  const dataLines = looksLikeHeader ? rest : lines;
  return dataLines.map((line) => {
    const parts = line.split(/[,\t]/).map((p) => p.trim()).filter(Boolean);
    return { team_name: parts[0] || '', players: parts.slice(1) };
  }).filter((r) => r.team_name);
}

export default function RosterStep({ data, setData, onComplete }) {
  const [dragOver, setDragOver] = useState(false);
  const parsed = useMemo(() => parseTeamCsv(data.teamsRaw), [data.teamsRaw]);
  const dupes = useMemo(() => {
    const seen = new Set(); const list = [];
    for (const r of parsed) {
      const k = r.team_name.toLowerCase();
      if (seen.has(k)) list.push(r.team_name);
      seen.add(k);
    }
    return list;
  }, [parsed]);

  // Roster is "ready" even when empty (organizer can add later).
  useEffect(() => { onComplete?.(true); }, [onComplete]);

  const handleFile = async (file) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('File over 2MB — trim it.'); return; }
    const text = await file.text();
    setData({ ...data, teamsRaw: text });
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <section className="wiz-section">
      <header className="wiz-section-head">
        <div className="wiz-step-num">3</div>
        <h2>Teams</h2>
        <span className="wiz-section-aside">{parsed.length === 0 ? 'optional — add later if you prefer' : `${parsed.length} team${parsed.length !== 1 ? 's' : ''}`}</span>
      </header>

      <div
        className={`wiz-drop ${dragOver ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <textarea
          value={data.teamsRaw}
          onChange={(e) => setData({ ...data, teamsRaw: e.target.value })}
          placeholder={"Paste from Sheets/Excel, type rows, or drop a .csv\n\nTeam Name, Player 1, Player 2, Player 3, Player 4\nThe Hookers, Ana, Beth, Carol, Dee\nGimme Three, Ed, Fred, Greg"}
          rows={6}
        />
        <div className="wiz-drop-actions">
          <label className="wiz-link">
            ⬆ Upload CSV
            <input type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
          </label>
          {data.teamsRaw && (
            <button type="button" className="wiz-link" onClick={() => setData({ ...data, teamsRaw: '' })}>Clear</button>
          )}
        </div>
      </div>

      {parsed.length > 0 && (
        <div className="wiz-preview">
          {dupes.length > 0 && (
            <div className="wiz-hint warn">⚠ Duplicate team names: {dupes.join(', ')}</div>
          )}
          <table className="wiz-preview-table">
            <thead><tr><th>Team</th><th>Players</th></tr></thead>
            <tbody>
              {parsed.slice(0, 25).map((r, i) => (
                <tr key={i}>
                  <td>{r.team_name}</td>
                  <td className="muted">{r.players.join(', ') || '—'}</td>
                </tr>
              ))}
              {parsed.length > 25 && <tr><td colSpan={2} className="muted">… and {parsed.length - 25} more</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
