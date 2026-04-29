import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import SetupStep from './wizard/SetupStep';
import FormatStep from './wizard/FormatStep';
import RosterStep, { parseTeamCsv } from './wizard/RosterStep';

// V2.1 wizard. Single scrolling page (no Back/Next), three sections that
// each report a "ready" flag. The sticky launch bar at the bottom turns
// active once Setup + Format are ready (Roster is optional). Cmd/Ctrl+
// Enter from anywhere triggers launch.

function nextSaturdayISO() {
  const d = new Date();
  const dow = d.getDay();
  const add = (6 - dow + 7) % 7 || 7;
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
}

export default function EventWizard() {
  const [params] = useSearchParams();
  const initialOrgId = params.get('org') || '';
  const navigate = useNavigate();

  const [orgs, setOrgs] = useState([]);
  const [data, setData] = useState({
    orgId: initialOrgId,
    orgName: '',
    courseId: '',
    courseName: '',
    name: '',
    slug: '',
    date: nextSaturdayISO(),
    holes: 18,
    leaderboard_visible: true,
    enabled_games: ['stroke_play'],
    scoring_mode: 'distributed',
    teamsRaw: '',
  });
  const [setupReady, setSetupReady] = useState(false);
  const [formatReady, setFormatReady] = useState(false);
  // RosterStep always reports ready=true (empty roster is allowed); kept
  // here for symmetry / future required-roster guard.
  const [, setRosterReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.getOrgs().then((rows) => {
      setOrgs(rows);
      if (!data.orgId && rows.length === 1) {
        setData((d) => ({ ...d, orgId: rows[0].id, orgName: rows[0].name }));
      } else if (data.orgId) {
        const found = rows.find((o) => o.id === data.orgId);
        if (found) setData((d) => ({ ...d, orgName: found.name }));
      }
    }).catch(console.error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const teamsCount = useMemo(() => parseTeamCsv(data.teamsRaw).length, [data.teamsRaw]);
  const canLaunch = setupReady && formatReady && !busy;

  const handleLaunch = async () => {
    if (!canLaunch) return;
    setBusy(true);
    setError('');
    try {
      const event = await api.createEvent(data.orgId, {
        name: data.name,
        slug: data.slug,
        date: data.date || undefined,
        holes: data.holes,
        course_id: data.courseId,
        leaderboard_visible: data.leaderboard_visible,
        enabled_games: data.enabled_games,
        scoring_mode: data.scoring_mode,
      });
      let importedCount = 0;
      const teamsRaw = data.teamsRaw.trim();
      if (teamsRaw.length > 0) {
        const bulk = await api.bulkImport(event.id, teamsRaw);
        importedCount = bulk.count;
      }
      setResult({ event, teamsCount: importedCount });
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  };

  // Cmd/Ctrl+Enter from anywhere on the page.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canLaunch) {
        e.preventDefault();
        handleLaunch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canLaunch]); // eslint-disable-line react-hooks/exhaustive-deps

  if (result) {
    const { event, teamsCount: imported } = result;
    return (
      <div className="page-shell wiz-shell">
        <div className="wiz-success">
          <div className="wiz-success-emoji">🎉</div>
          <h1>{event.name} is live</h1>
          <p className="wiz-success-meta">
            {imported} team{imported !== 1 ? 's' : ''} imported · status: draft.
            Flip to Live from the event page when you're ready to score.
          </p>
          <div className="wiz-success-actions">
            <Link to={`/admin/event/${event.id}`} className="btn btn-primary">Open event dashboard →</Link>
            <Link to={`/admin/event/${event.id}/qr-pack`} className="btn btn-secondary">🖨 QR pack</Link>
            {event.scorer_token && (
              <a className="btn btn-secondary" href={`/match/${event.scorer_token}`} target="_blank" rel="noopener">📱 Match scorer link</a>
            )}
            <button className="btn btn-secondary" onClick={() => navigate(`/admin/org/${data.orgId}`)}>← Back to organization</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell wiz-shell">
      <div className="breadcrumb">
        <Link to="/admin">Admin</Link>
        {data.orgId && <> / <Link to={`/admin/org/${data.orgId}`}>{data.orgName || 'Organization'}</Link></>}
        {' / New event'}
      </div>
      <h1 className="wiz-title">Create an event</h1>
      <p className="wiz-subtitle">Three sections — fill what you know, launch when you're ready.</p>

      <div className="wiz-progress" aria-hidden>
        <div className={`wiz-progress-fill ${setupReady ? 'on' : ''} ${formatReady ? 'two' : ''}`} />
      </div>

      <SetupStep data={data} setData={setData} orgs={orgs} onComplete={setSetupReady} />
      <FormatStep data={data} setData={setData} onComplete={setFormatReady} />
      <RosterStep data={data} setData={setData} onComplete={setRosterReady} />

      <div className="wiz-launch-bar" role="region" aria-label="Launch event">
        <div className="wiz-launch-summary">
          <div><strong>{data.name || 'Untitled event'}</strong> {data.date && <span className="muted">· {data.date}</span>}</div>
          <div className="muted">
            {data.courseName || 'No course'} · {data.enabled_games.join(', ') || 'no formats'} · {data.scoring_mode} · {teamsCount} team{teamsCount !== 1 ? 's' : ''}
          </div>
        </div>
        <button className="wiz-launch-btn" onClick={handleLaunch} disabled={!canLaunch}>
          {busy ? 'Creating…' : '🚀 Launch event'}
          <span className="wiz-kbd">⌘↵</span>
        </button>
      </div>

      {error && <div className="wiz-hint warn" style={{ marginTop: '0.75rem' }}>{error}</div>}
    </div>
  );
}
