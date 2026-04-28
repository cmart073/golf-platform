import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';

function CreateCourseModal({ orgId, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pars, setPars] = useState(() => {
    const p = {};
    for (let i = 1; i <= 18; i++) p[i] = 4;
    return p;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!name.trim()) { setError('Course name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const course = await api.createCourse(orgId, { name, city, state, pars });
      onCreated(course);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Create Course</h2>
        {error && <div style={{ color: 'var(--red-500)', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</div>}
        <div className="form-group">
          <label>Course Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pine Valley Golf Club" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>City</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Pine Valley" />
          </div>
          <div className="form-group">
            <label>State</label>
            <input value={state} onChange={(e) => setState(e.target.value)} placeholder="NJ" />
          </div>
        </div>

        <div className="form-group">
          <label>Front 9 — Pars</label>
          <div className="pars-grid">
            {[1,2,3,4,5,6,7,8,9].map((h) => (
              <div className="hole-cell" key={h}>
                <label>{h}</label>
                <input type="number" min="3" max="6" value={pars[h]}
                  onChange={(e) => setPars({ ...pars, [h]: parseInt(e.target.value) || 4 })} />
              </div>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label>Back 9 — Pars</label>
          <div className="pars-grid">
            {[10,11,12,13,14,15,16,17,18].map((h) => (
              <div className="hole-cell" key={h}>
                <label>{h}</label>
                <input type="number" min="3" max="6" value={pars[h]}
                  onChange={(e) => setPars({ ...pars, [h]: parseInt(e.target.value) || 4 })} />
              </div>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Create Course'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateEventForm({ orgId, courses, onCreated }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [date, setDate] = useState('');
  const [holes, setHoles] = useState(18);
  const [courseId, setCourseId] = useState('');
  const [eventType, setEventType] = useState('tournament');
  const [enabledGames, setEnabledGames] = useState(['stroke_play']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleGame = (key, checked) => {
    setEnabledGames((prev) => {
      const current = new Set(prev);
      if (checked) current.add(key);
      else current.delete(key);

      if (key === 'stroke_play' && checked) current.delete('match_play');
      if (key === 'match_play' && checked) current.delete('stroke_play');

      if (key === 'bingo_bango_bongo') {
        if (checked) {
          current.add('bingo');
          current.add('bango');
          current.add('bongo');
        } else {
          current.delete('bingo');
          current.delete('bango');
          current.delete('bongo');
        }
      }

      return Array.from(current);
    });
  };

  const hasBBB = ['bingo', 'bango', 'bongo'].every((g) => enabledGames.includes(g));

  const handleNameChange = (val) => {
    setName(val);
    setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
  };

  const handleSave = async () => {
    if (!name.trim() || !slug.trim() || !courseId) { setError('Name, slug, and course are required'); return; }
    setSaving(true);
    setError('');
    try {
      const event = await api.createEvent(orgId, {
        name,
        slug,
        date: date || undefined,
        holes,
        course_id: courseId,
        event_type: eventType,
        enabled_games: enabledGames,
      });
      onCreated(event);
      setName(''); setSlug(''); setDate(''); setHoles(18); setCourseId('');
      setEventType('tournament'); setEnabledGames(['stroke_play']);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--slate-700)' }}>New Event</h3>
      {error && <div style={{ color: 'var(--red-500)', marginBottom: '0.75rem', fontSize: '0.9rem' }}>{error}</div>}
      <div className="form-row">
        <div className="form-group">
          <label>Event Name *</label>
          <input value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Spring Scramble 2025" />
        </div>
        <div className="form-group">
          <label>Slug *</label>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="spring-scramble-2025" />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Holes *</label>
          <select value={holes} onChange={(e) => setHoles(parseInt(e.target.value))}>
            <option value={9}>9 Holes</option>
            <option value={18}>18 Holes</option>
          </select>
        </div>
      </div>
      <div className="form-group">
        <label>Course *</label>
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          <option value="">Select a course...</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Event Type</label>
          <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
            <option value="tournament">Tournament</option>
            <option value="weekly_match">Weekly Match</option>
          </select>
        </div>
      </div>
      <div className="form-group">
        <label>Games to Track</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {[
            ['stroke_play', '⛳ Stroke Play'],
            ['match_play', '🥊 Match Play'],
            ['nassau', '💰 Nassau'],
            ['skins', '🏆 Skins'],
            ['wolf', '🐺 Wolf'],
            ['nine_points', '🎯 9 Points (Nines)'],
            ['bingo_bango_bongo', '🎲 Bingo Bango Bongo'],
            ['jeff_martin', '🎖️ Jeff Martin'],
          ].map(([key, label]) => (
            <label key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <input
                type="checkbox"
                checked={key === 'bingo_bango_bongo' ? hasBBB : enabledGames.includes(key)}
                onChange={(e) => toggleGame(key, e.target.checked)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <button className="btn btn-primary" onClick={handleSave} disabled={saving || courses.length === 0}>
        {saving ? 'Creating...' : 'Create Event'}
      </button>
    </div>
  );
}

function BrandingCard({ orgId }) {
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [brandColor, setBrandColor] = useState('');

  useEffect(() => {
    api.getOrg(orgId).then((o) => {
      setOrg(o);
      setName(o.name || '');
      setSlug(o.slug || '');
      setLogoUrl(o.logo_url || '');
      setBrandColor(o.brand_color || '');
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [orgId]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await api.patchOrg(orgId, {
        name, slug,
        logo_url: logoUrl || null,
        brand_color: brandColor || null,
      });
      setOrg(res.org);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="card"><div className="loading">Loading…</div></div>;

  return (
    <div className="card">
      <h2 style={{ margin: 0, marginBottom: '0.75rem' }}>🎨 Branding</h2>
      <p style={{ color: 'var(--slate-500)', fontSize: '0.85rem', marginTop: 0 }}>
        Logo and brand color appear on the public leaderboard, TV mode, and scorer pages.
        Per-event branding overrides can be set on the event itself.
      </p>
      {error && <div style={{ color: 'var(--red-500)', marginBottom: '0.5rem' }}>{error}</div>}
      <div className="form-row">
        <div className="form-group">
          <label>Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Slug *</label>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label>Logo URL</label>
        <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://example.com/logo.png" />
        {logoUrl && (
          <div style={{ marginTop: '0.5rem' }}>
            <img src={logoUrl} alt="Logo preview" style={{ maxHeight: 64, maxWidth: 240, border: '1px solid var(--slate-200)', padding: 4, borderRadius: 6, background: 'white' }} />
          </div>
        )}
      </div>
      <div className="form-group">
        <label>Brand color</label>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input type="color" value={brandColor || '#14532d'} onChange={(e) => setBrandColor(e.target.value)} style={{ width: 56, height: 36, padding: 0, border: '1px solid var(--slate-200)', borderRadius: 6 }} />
          <input value={brandColor} onChange={(e) => setBrandColor(e.target.value)} placeholder="#14532d" />
          {brandColor && <button className="btn btn-sm btn-secondary" onClick={() => setBrandColor('')}>Clear</button>}
        </div>
      </div>
      <button className="btn btn-primary" onClick={handleSave} disabled={saving || !name.trim() || !slug.trim()}>
        {saving ? 'Saving…' : 'Save branding'}
      </button>
    </div>
  );
}

function CloneEventModal({ source, onClose, onCloned }) {
  const todayPlus1 = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  const [name, setName] = useState(source.name);
  const [slug, setSlug] = useState((source.slug || '').replace(/-?\d{4}.*$/, '') + '-' + new Date().getFullYear());
  const [date, setDate] = useState(todayPlus1);
  const [copySponsors, setCopySponsors] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!slug.trim()) { setError('Slug is required'); return; }
    setSaving(true);
    setError('');
    try {
      const cloned = await api.cloneEvent(source.id, {
        name,
        slug,
        date: date || null,
        copy_sponsors: copySponsors,
      });
      onCloned(cloned);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Clone Event</h2>
        <p style={{ color: 'var(--slate-500)', fontSize: '0.9rem', marginTop: '-0.5rem' }}>
          Cloning <strong>{source.name}</strong>. Teams, scores, and tokens are not copied — only the configuration.
        </p>
        {error && <div style={{ color: 'var(--red-500)', marginBottom: '0.75rem', fontSize: '0.9rem' }}>{error}</div>}
        <div className="form-group">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Slug *</label>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', marginBottom: '1rem' }}>
          <input type="checkbox" checked={copySponsors} onChange={(e) => setCopySponsors(e.target.checked)} />
          Also copy sponsors
        </label>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Cloning...' : 'Clone Event'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OrgDetail() {
  const { orgId } = useParams();
  const [courses, setCourses] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [cloneSource, setCloneSource] = useState(null);

  const load = async () => {
    try {
      const [c, e] = await Promise.all([api.getCourses(orgId), api.getEvents(orgId)]);
      setCourses(c);
      setEvents(e);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEvent = async (eventId, eventName) => {
    if (!confirm(`Delete "${eventName}"? This will permanently remove all teams, scores, and game data. This cannot be undone.`)) return;
    setDeleting(eventId);
    try {
      await api.deleteEvent(eventId);
      setEvents(prev => prev.filter(e => e.id !== eventId));
    } catch (err) {
      alert('Delete failed: ' + err.message);
    } finally {
      setDeleting(null);
    }
  };

  useEffect(() => { load(); }, [orgId]);

  if (loading) return <div className="page-shell"><div className="loading">Loading...</div></div>;

  return (
    <div className="page-shell">
      <div className="breadcrumb"><Link to="/admin">Admin</Link> / Organization</div>
      <div className="page-header">
        <h1>Organization</h1>
      </div>

      {/* Branding */}
      <div className="card-section">
        <BrandingCard orgId={orgId} />
      </div>

      {/* Courses */}
      <div className="card-section">
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>&#9971; Courses</h2>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCourseModal(true)}>+ Add Course</button>
          </div>
          {courses.length === 0 ? (
            <div className="empty-state">No courses yet. Create one to get started.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Location</th></tr></thead>
                <tbody>
                  {courses.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 500 }}>{c.name}</td>
                      <td style={{ color: 'var(--slate-500)' }}>{[c.city, c.state].filter(Boolean).join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Events */}
      <div className="card-section">
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>&#127942; Events</h2>
            <Link to={`/admin/wizard?org=${orgId}`} className="btn btn-primary btn-sm">+ New Event (Wizard)</Link>
          </div>
          {events.length === 0 ? (
            <div className="empty-state">No events yet.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Date</th><th>Holes</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id}>
                      <td style={{ fontWeight: 500 }}>{e.name}</td>
                      <td style={{ color: 'var(--slate-500)' }}>{e.date || '—'}</td>
                      <td>{e.holes}</td>
                      <td><span className={`badge badge-${e.status}`}>{e.status}</span></td>
                      <td style={{ display: 'flex', gap: '0.5rem' }}>
                        <Link to={`/admin/event/${e.id}`} className="btn btn-secondary btn-sm">Manage</Link>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setCloneSource(e)}
                          title="Clone this event's configuration into a new draft"
                        >
                          Clone
                        </button>
                        <button
                          className="btn btn-sm"
                          style={{ background: 'var(--red-100, #fee2e2)', color: 'var(--red-600, #dc2626)', border: 'none' }}
                          onClick={() => handleDeleteEvent(e.id, e.name)}
                          disabled={deleting === e.id}
                        >
                          {deleting === e.id ? '...' : '🗑️'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <CreateEventForm orgId={orgId} courses={courses} onCreated={(e) => setEvents([e, ...events])} />
      </div>

      {showCourseModal && (
        <CreateCourseModal
          orgId={orgId}
          onClose={() => setShowCourseModal(false)}
          onCreated={(c) => setCourses([...courses, c])}
        />
      )}

      {cloneSource && (
        <CloneEventModal
          source={cloneSource}
          onClose={() => setCloneSource(null)}
          onCloned={(cloned) => setEvents([cloned, ...events])}
        />
      )}
    </div>
  );
}
