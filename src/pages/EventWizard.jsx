import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';

// V2 organizer onboarding wizard. Walks an organizer end-to-end:
//   1. Org      → create or pick
//   2. Course   → create or pick
//   3. Event    → name / slug / date / holes
//   4. Formats  → pick games + scoring mode (single/distributed)
//   5. Teams    → paste/upload roster, preview
//   6. Review   → create event, bulk-import teams, surface scorer links

const STEPS = [
  { id: 1, label: 'Organization' },
  { id: 2, label: 'Course' },
  { id: 3, label: 'Event basics' },
  { id: 4, label: 'Formats & scoring' },
  { id: 5, label: 'Teams' },
  { id: 6, label: 'Review & launch' },
];

function slugify(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function StepHeader({ step }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
      {STEPS.map((s) => (
        <div
          key={s.id}
          style={{
            padding: '0.35rem 0.75rem',
            borderRadius: '999px',
            background: s.id === step ? 'var(--green-800, #14532d)' : s.id < step ? 'var(--slate-200, #e2e8f0)' : 'var(--slate-100, #f1f5f9)',
            color: s.id === step ? 'white' : s.id < step ? 'var(--slate-700)' : 'var(--slate-500)',
            fontSize: '0.8rem',
            fontWeight: s.id === step ? 600 : 400,
          }}
        >
          {s.id}. {s.label}
        </div>
      ))}
    </div>
  );
}

function NavButtons({ onBack, onNext, nextLabel = 'Next →', nextDisabled = false, busy = false, hideBack = false }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem' }}>
      {hideBack ? <span /> : (
        <button className="btn btn-secondary" onClick={onBack} disabled={busy}>← Back</button>
      )}
      <button className="btn btn-primary" onClick={onNext} disabled={nextDisabled || busy}>
        {busy ? 'Working…' : nextLabel}
      </button>
    </div>
  );
}

function Step1Org({ data, setData, onNext }) {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState(data.orgId ? 'pick' : 'pick');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getOrgs().then((rows) => {
      setOrgs(rows);
      if (rows.length === 0) setMode('create');
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!name.trim() || !slug.trim()) { setError('Name and slug are required'); return; }
    setBusy(true);
    try {
      const org = await api.createOrg({ name, slug });
      setData({ ...data, orgId: org.id, orgName: org.name });
      onNext();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Pick or create an organization</h2>
      <p style={{ color: 'var(--slate-500)', marginTop: 0 }}>Your events live under an organization. Use an existing one or spin up a new one.</p>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <label style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
          <input type="radio" checked={mode === 'pick'} onChange={() => setMode('pick')} disabled={orgs.length === 0} />
          Use existing
        </label>
        <label style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
          <input type="radio" checked={mode === 'create'} onChange={() => setMode('create')} />
          Create new
        </label>
      </div>

      {mode === 'pick' && (
        <div className="form-group">
          <label>Organization</label>
          <select
            value={data.orgId || ''}
            onChange={(e) => {
              const o = orgs.find((x) => x.id === e.target.value);
              setData({ ...data, orgId: o?.id || '', orgName: o?.name || '' });
            }}
          >
            <option value="">Select an organization…</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      )}

      {mode === 'create' && (
        <>
          <div className="form-row">
            <div className="form-group">
              <label>Name *</label>
              <input value={name} onChange={(e) => { setName(e.target.value); setSlug(slugify(e.target.value)); }} placeholder="My Golf League" />
            </div>
            <div className="form-group">
              <label>Slug *</label>
              <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="my-golf-league" />
            </div>
          </div>
        </>
      )}

      {error && <div style={{ color: 'var(--red-500)', marginTop: '0.5rem' }}>{error}</div>}

      <NavButtons
        hideBack
        onNext={mode === 'create' ? handleCreate : onNext}
        nextDisabled={mode === 'pick' ? !data.orgId : !(name.trim() && slug.trim())}
        busy={busy}
      />
    </div>
  );
}

function Step2Course({ data, setData, onBack, onNext }) {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('pick');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pars, setPars] = useState(() => Object.fromEntries([...Array(18)].map((_, i) => [i + 1, 4])));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getCourses(data.orgId).then((rows) => {
      setCourses(rows);
      if (rows.length === 0) setMode('create');
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [data.orgId]);

  const handleCreate = async () => {
    if (!name.trim()) { setError('Course name required'); return; }
    setBusy(true);
    try {
      const c = await api.createCourse(data.orgId, { name, city, state, pars });
      setData({ ...data, courseId: c.id, courseName: c.name });
      onNext();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Pick or create a course</h2>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <label style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
          <input type="radio" checked={mode === 'pick'} onChange={() => setMode('pick')} disabled={courses.length === 0} />
          Use existing
        </label>
        <label style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
          <input type="radio" checked={mode === 'create'} onChange={() => setMode('create')} />
          Create new
        </label>
      </div>

      {mode === 'pick' && (
        <div className="form-group">
          <label>Course</label>
          <select
            value={data.courseId || ''}
            onChange={(e) => {
              const c = courses.find((x) => x.id === e.target.value);
              setData({ ...data, courseId: c?.id || '', courseName: c?.name || '' });
            }}
          >
            <option value="">Select a course…</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {mode === 'create' && (
        <>
          <div className="form-group">
            <label>Course Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pine Valley GC" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>City</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="form-group">
              <label>State</label>
              <input value={state} onChange={(e) => setState(e.target.value)} />
            </div>
          </div>
          {[[1,9,'Front 9'],[10,18,'Back 9']].map(([from, to, label]) => (
            <div className="form-group" key={label}>
              <label>{label} — Pars</label>
              <div className="pars-grid">
                {Array.from({ length: to - from + 1 }, (_, i) => from + i).map((h) => (
                  <div className="hole-cell" key={h}>
                    <label>{h}</label>
                    <input type="number" min="3" max="6" value={pars[h]} onChange={(e) => setPars({ ...pars, [h]: parseInt(e.target.value) || 4 })} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {error && <div style={{ color: 'var(--red-500)', marginTop: '0.5rem' }}>{error}</div>}

      <NavButtons
        onBack={onBack}
        onNext={mode === 'create' ? handleCreate : onNext}
        nextDisabled={mode === 'pick' ? !data.courseId : !name.trim()}
        busy={busy}
      />
    </div>
  );
}

function Step3Basics({ data, setData, onBack, onNext }) {
  const handleNameChange = (val) => setData({ ...data, name: val, slug: slugify(val) });
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Event basics</h2>
      <div className="form-row">
        <div className="form-group">
          <label>Event Name *</label>
          <input value={data.name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Spring Scramble 2026" />
        </div>
        <div className="form-group">
          <label>Slug *</label>
          <input value={data.slug} onChange={(e) => setData({ ...data, slug: e.target.value })} />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Date</label>
          <input type="date" value={data.date} onChange={(e) => setData({ ...data, date: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Holes *</label>
          <select value={data.holes} onChange={(e) => setData({ ...data, holes: parseInt(e.target.value) })}>
            <option value={9}>9 Holes</option>
            <option value={18}>18 Holes</option>
          </select>
        </div>
      </div>
      <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
        <input type="checkbox" checked={data.leaderboard_visible} onChange={(e) => setData({ ...data, leaderboard_visible: e.target.checked })} />
        Leaderboard visible at launch
      </label>
      <NavButtons onBack={onBack} onNext={onNext} nextDisabled={!data.name.trim() || !data.slug.trim()} />
    </div>
  );
}

function Step4Formats({ data, setData, onBack, onNext }) {
  const [formats, setFormats] = useState([]);
  const [meta, setMeta] = useState({ inferred_scoring_mode: 'distributed', can_use_distributed: true });
  const [loading, setLoading] = useState(true);

  // BBB toggle is presented as a single checkbox even though server-side it
  // expands to {bingo, bango, bongo}. We track it derived from the actual
  // selection.
  const games = data.enabled_games;
  const hasBBB = ['bingo', 'bango', 'bongo'].every((g) => games.includes(g));

  useEffect(() => {
    api.getFormats(games).then((res) => {
      setFormats(res.formats || []);
      setMeta({
        inferred_scoring_mode: res.inferred_scoring_mode || 'distributed',
        can_use_distributed: res.can_use_distributed !== false,
      });
    }).catch(console.error).finally(() => setLoading(false));
  }, [games.join(',')]);

  const toggleGame = (key, checked) => {
    const set = new Set(games);
    if (key === 'bingo_bango_bongo') {
      ['bingo', 'bango', 'bongo'].forEach((g) => checked ? set.add(g) : set.delete(g));
    } else {
      checked ? set.add(key) : set.delete(key);
      if (key === 'stroke_play' && checked) set.delete('match_play');
      if (key === 'match_play' && checked) set.delete('stroke_play');
    }
    setData({ ...data, enabled_games: Array.from(set) });
  };

  // When the server says we can't use distributed, snap to single.
  useEffect(() => {
    if (!meta.can_use_distributed && data.scoring_mode === 'distributed') {
      setData({ ...data, scoring_mode: 'single' });
    }
  }, [meta.can_use_distributed]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleFormats = formats.filter((f) => !['bango', 'bongo'].includes(f.id));

  if (loading) return <div className="loading">Loading formats…</div>;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Formats &amp; scoring</h2>
      <p style={{ color: 'var(--slate-500)', marginTop: 0 }}>Pick the games you want to track. Scoring mode is suggested automatically based on your picks.</p>

      <div className="form-group">
        <label>Games</label>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {visibleFormats.map((f) => {
            const isBBBProxy = f.id === 'bingo';
            const checked = isBBBProxy ? hasBBB : games.includes(f.id);
            const key = isBBBProxy ? 'bingo_bango_bongo' : f.id;
            const conflicted = f.conflicts_with.some((c) => games.includes(c));
            return (
              <label key={f.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                padding: '0.5rem', border: '1px solid var(--slate-200)', borderRadius: 6,
                opacity: conflicted ? 0.5 : 1,
              }}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={conflicted}
                  onChange={(e) => toggleGame(key, e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <div>
                  <div style={{ fontWeight: 500 }}>
                    {isBBBProxy ? 'Bingo Bango Bongo' : f.label}
                    {f.is_side_game && <span style={{ marginLeft: 8, fontSize: '0.7rem', background: 'var(--slate-200)', padding: '2px 6px', borderRadius: 4 }}>side game</span>}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--slate-500)' }}>{f.description}</div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="form-group">
        <label>Scoring mode</label>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <label style={{
            flex: '1 1 220px', padding: '0.75rem', border: '1px solid var(--slate-200)', borderRadius: 6,
            background: data.scoring_mode === 'single' ? 'var(--green-50, #f0fdf4)' : 'white',
            cursor: 'pointer',
          }}>
            <input type="radio" checked={data.scoring_mode === 'single'} onChange={() => setData({ ...data, scoring_mode: 'single' })} />
            <strong style={{ marginLeft: 6 }}>Single scorer</strong>
            <div style={{ fontSize: '0.85rem', color: 'var(--slate-500)' }}>One person enters every score for the whole group.</div>
          </label>
          <label style={{
            flex: '1 1 220px', padding: '0.75rem', border: '1px solid var(--slate-200)', borderRadius: 6,
            background: data.scoring_mode === 'distributed' ? 'var(--green-50, #f0fdf4)' : 'white',
            opacity: meta.can_use_distributed ? 1 : 0.5,
            cursor: meta.can_use_distributed ? 'pointer' : 'not-allowed',
          }}>
            <input
              type="radio"
              checked={data.scoring_mode === 'distributed'}
              disabled={!meta.can_use_distributed}
              onChange={() => setData({ ...data, scoring_mode: 'distributed' })}
            />
            <strong style={{ marginLeft: 6 }}>Distributed</strong>
            <div style={{ fontSize: '0.85rem', color: 'var(--slate-500)' }}>
              Each team enters their own scores via their own link.
              {!meta.can_use_distributed && <em> Not supported by your current games.</em>}
            </div>
          </label>
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--slate-500)', marginTop: '0.5rem' }}>
          Suggested for this format mix: <strong>{meta.inferred_scoring_mode}</strong>
        </div>
      </div>

      <NavButtons onBack={onBack} onNext={onNext} nextDisabled={games.length === 0} />
    </div>
  );
}

function parseTeamCsv(raw) {
  const lines = raw.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  // Skip a header row that starts with team / team name / etc.
  const [first, ...rest] = lines;
  const looksLikeHeader = first && /^team|^team\s*name/i.test(first);
  const dataLines = looksLikeHeader ? rest : lines;
  return dataLines.map((line) => {
    const parts = line.split(/[,\t]/).map((p) => p.trim()).filter(Boolean);
    return { team_name: parts[0] || '', players: parts.slice(1) };
  }).filter((r) => r.team_name);
}

function Step5Teams({ data, setData, onBack, onNext }) {
  const parsed = useMemo(() => parseTeamCsv(data.teamsRaw), [data.teamsRaw]);
  const dupes = useMemo(() => {
    const seen = new Set();
    return parsed.filter((r) => {
      const k = r.team_name.toLowerCase();
      if (seen.has(k)) return true;
      seen.add(k);
      return false;
    }).map((r) => r.team_name);
  }, [parsed]);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Teams</h2>
      <p style={{ color: 'var(--slate-500)', marginTop: 0 }}>
        Paste from Google Sheets / Excel, or type one team per line as <code>Team Name, Player 1, Player 2, …</code>. A header row is fine — it'll be skipped.
      </p>
      <textarea
        value={data.teamsRaw}
        onChange={(e) => setData({ ...data, teamsRaw: e.target.value })}
        placeholder={"Team Name, Player 1, Player 2, Player 3, Player 4\nThe Hookers, Ana, Beth, Carol, Dee\nGimme Three, Ed, Fred, Greg"}
        rows={8}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.9rem' }}
      />

      {parsed.length > 0 && (
        <div className="card" style={{ marginTop: '1rem', background: 'var(--slate-50, #f8fafc)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--slate-500)', marginBottom: '0.5rem' }}>
            Preview · {parsed.length} team{parsed.length !== 1 ? 's' : ''}{dupes.length > 0 && <> · <span style={{ color: 'var(--red-500)' }}>{dupes.length} duplicate name(s): {dupes.join(', ')}</span></>}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Team</th><th>Players</th></tr></thead>
              <tbody>
                {parsed.slice(0, 25).map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500 }}>{r.team_name}</td>
                    <td style={{ color: 'var(--slate-500)' }}>{r.players.join(', ') || <em>—</em>}</td>
                  </tr>
                ))}
                {parsed.length > 25 && <tr><td colSpan={2} style={{ color: 'var(--slate-500)' }}>… and {parsed.length - 25} more</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <NavButtons onBack={onBack} onNext={onNext} nextDisabled={false} />
      {parsed.length === 0 && (
        <div style={{ fontSize: '0.85rem', color: 'var(--slate-500)', marginTop: '0.5rem' }}>You can also skip and add teams later.</div>
      )}
    </div>
  );
}

function Step6Review({ data, onBack, onComplete }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const navigate = useNavigate();

  const handleLaunch = async () => {
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
      let teamsCount = 0;
      const teamsRaw = data.teamsRaw.trim();
      if (teamsRaw.length > 0) {
        const bulk = await api.bulkImport(event.id, teamsRaw);
        teamsCount = bulk.count;
      }
      setResult({ event, teamsCount });
      onComplete?.(event);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const { event, teamsCount } = result;
    return (
      <div>
        <h2 style={{ marginTop: 0 }}>Event created!</h2>
        <p style={{ color: 'var(--slate-500)' }}>
          <strong>{event.name}</strong> is in draft with {teamsCount} team{teamsCount !== 1 ? 's' : ''}.
          Switch to Live from the event page when you're ready to score.
        </p>
        <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
          <Link to={`/admin/event/${event.id}`} className="btn btn-primary">Open event dashboard →</Link>
          <Link to={`/admin/event/${event.id}/qr-pack`} className="btn btn-secondary">Print QR pack →</Link>
          {event.scorer_token && (
            <div style={{ background: 'var(--slate-50)', padding: '0.75rem', borderRadius: 6, fontSize: '0.85rem' }}>
              <strong>Single-scorer link:</strong>{' '}
              <code>/match/{event.scorer_token}</code>
            </div>
          )}
          <button className="btn btn-secondary" onClick={() => navigate(`/admin/org/${data.orgId}`)}>← Back to organization</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Review &amp; launch</h2>
      <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
        <div><strong>Organization:</strong> {data.orgName}</div>
        <div><strong>Course:</strong> {data.courseName}</div>
        <div><strong>Event:</strong> {data.name} <span style={{ color: 'var(--slate-500)' }}>({data.slug})</span></div>
        <div><strong>Date:</strong> {data.date || '—'}</div>
        <div><strong>Holes:</strong> {data.holes}</div>
        <div><strong>Games:</strong> {data.enabled_games.join(', ')}</div>
        <div><strong>Scoring mode:</strong> {data.scoring_mode}</div>
        <div><strong>Leaderboard at launch:</strong> {data.leaderboard_visible ? 'visible' : 'hidden'}</div>
        <div><strong>Teams to import:</strong> {parseTeamCsv(data.teamsRaw).length}</div>
      </div>

      {error && <div style={{ color: 'var(--red-500)', marginBottom: '0.5rem' }}>{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem' }}>
        <button className="btn btn-secondary" onClick={onBack} disabled={busy}>← Back</button>
        <button className="btn btn-primary" onClick={handleLaunch} disabled={busy}>
          {busy ? 'Creating event…' : 'Create event & import teams'}
        </button>
      </div>
    </div>
  );
}

export default function EventWizard() {
  const [params] = useSearchParams();
  const initialOrgId = params.get('org') || '';

  const [step, setStep] = useState(1);
  const [data, setData] = useState({
    orgId: initialOrgId,
    orgName: '',
    courseId: '',
    courseName: '',
    name: '',
    slug: '',
    date: '',
    holes: 18,
    leaderboard_visible: true,
    enabled_games: ['stroke_play'],
    scoring_mode: 'distributed',
    teamsRaw: '',
  });

  const next = () => setStep((s) => Math.min(STEPS.length, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  return (
    <div className="page-shell">
      <div className="breadcrumb">
        <Link to="/admin">Admin</Link>
        {data.orgId && <> / <Link to={`/admin/org/${data.orgId}`}>{data.orgName || 'Organization'}</Link></>}
        {' / New event'}
      </div>
      <h1>Create an event</h1>
      <StepHeader step={step} />
      <div className="card">
        {step === 1 && <Step1Org data={data} setData={setData} onNext={next} />}
        {step === 2 && <Step2Course data={data} setData={setData} onBack={back} onNext={next} />}
        {step === 3 && <Step3Basics data={data} setData={setData} onBack={back} onNext={next} />}
        {step === 4 && <Step4Formats data={data} setData={setData} onBack={back} onNext={next} />}
        {step === 5 && <Step5Teams data={data} setData={setData} onBack={back} onNext={next} />}
        {step === 6 && <Step6Review data={data} onBack={back} />}
      </div>
    </div>
  );
}
