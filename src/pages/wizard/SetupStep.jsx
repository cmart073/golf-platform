import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { useGeolocation } from '../../hooks/useGeolocation';

// Setup step: org + course + event basics in one flowing panel.
// Course picker has three modes shown as inline chips:
//   📍 Near me  → useGeolocation → /api/admin/courses/search → list
//   ⭐ Saved    → org's existing courses
//   ✨ New     → minimal create flow (defaults all pars to 4)

function slugify(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function nextSaturdayISO() {
  const d = new Date();
  const dow = d.getDay(); // 0 Sun … 6 Sat
  const add = (6 - dow + 7) % 7 || 7; // always future Saturday
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
}

function formatDistance(km) {
  if (km == null) return '';
  const mi = km * 0.621371;
  if (mi < 0.1) return 'here';
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
}

export default function SetupStep({ data, setData, orgs, onComplete }) {
  const [courseMode, setCourseMode] = useState(data.courseId ? 'saved' : 'near');
  const [savedCourses, setSavedCourses] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchedAt, setSearchedAt] = useState(null);
  const [newCourseName, setNewCourseName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const geo = useGeolocation();

  const handleNameChange = (val) => setData({ ...data, name: val, slug: slugify(val) });
  const ensureDate = () => { if (!data.date) setData({ ...data, date: nextSaturdayISO() }); };

  // Load saved courses for the chosen org.
  useEffect(() => {
    if (!data.orgId) { setSavedCourses([]); return; }
    api.getCourses(data.orgId).then((rows) => {
      // Endpoint returns courses for ALL orgs; keep just this org's.
      setSavedCourses(rows.filter((c) => c.org_id === data.orgId));
    }).catch(() => setSavedCourses([]));
  }, [data.orgId]);

  const findNearMe = async () => {
    setError('');
    const coords = await geo.request();
    if (!coords) { setError(geo.error || 'Could not get your location'); return; }
    setSearching(true);
    try {
      const res = await api.searchCourses({ lat: coords.lat, lng: coords.lng, radiusKm: 25 });
      setSearchResults(res.results || []);
      setSearchedAt(new Date());
    } catch (e) {
      setError(e.message);
    } finally { setSearching(false); }
  };

  const pickOSM = async (osm) => {
    if (!data.orgId) { setError('Pick an organization first'); return; }
    setBusy(true);
    setError('');
    try {
      const c = await api.createCourse(data.orgId, {
        name: osm.name,
        city: osm.city,
        state: osm.state,
        holes: osm.holes_hint === 9 ? 9 : 18,
        // pars omitted → defaults to par 4 per V2.1 affordance
      });
      setData({ ...data, courseId: c.id, courseName: c.name });
      setCourseMode('saved');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const createBlank = async () => {
    if (!newCourseName.trim()) { setError('Course name required'); return; }
    if (!data.orgId) { setError('Pick an organization first'); return; }
    setBusy(true);
    setError('');
    try {
      const c = await api.createCourse(data.orgId, { name: newCourseName.trim(), holes: data.holes });
      setData({ ...data, courseId: c.id, courseName: c.name });
      setNewCourseName('');
      setCourseMode('saved');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const orgChooserNeeded = orgs.length !== 1 && !data.orgId;

  const ready = data.orgId && data.courseId && data.name.trim() && data.slug.trim();
  useEffect(() => { onComplete?.(ready); }, [ready, onComplete]);

  return (
    <section className="wiz-section">
      <header className="wiz-section-head">
        <div className="wiz-step-num">1</div>
        <h2>What &amp; where</h2>
      </header>

      {orgChooserNeeded && (
        <div className="wiz-row">
          <label className="wiz-field">
            <span>Organization</span>
            <select value={data.orgId} onChange={(e) => {
              const o = orgs.find((x) => x.id === e.target.value);
              setData({ ...data, orgId: o?.id || '', orgName: o?.name || '' });
            }}>
              <option value="">Choose…</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
        </div>
      )}

      <div className="wiz-row">
        <label className="wiz-field flex-2">
          <span>Event name</span>
          <input
            value={data.name}
            onChange={(e) => handleNameChange(e.target.value)}
            onFocus={ensureDate}
            placeholder="Spring Scramble 2026"
            autoFocus
          />
        </label>
        <label className="wiz-field">
          <span>Date</span>
          <input type="date" value={data.date} onChange={(e) => setData({ ...data, date: e.target.value })} />
        </label>
        <label className="wiz-field">
          <span>Holes</span>
          <select value={data.holes} onChange={(e) => setData({ ...data, holes: parseInt(e.target.value) })}>
            <option value={9}>9</option>
            <option value={18}>18</option>
          </select>
        </label>
      </div>

      <div className="wiz-course-block">
        <div className="wiz-course-tabs">
          <button type="button" className={`wiz-chip ${courseMode === 'near' ? 'on' : ''}`} onClick={() => setCourseMode('near')}>📍 Near me</button>
          <button type="button" className={`wiz-chip ${courseMode === 'saved' ? 'on' : ''}`} onClick={() => setCourseMode('saved')}>⭐ Saved</button>
          <button type="button" className={`wiz-chip ${courseMode === 'new' ? 'on' : ''}`} onClick={() => setCourseMode('new')}>✨ Add new</button>
          {data.courseName && (
            <span className="wiz-course-pill">✓ {data.courseName}</span>
          )}
        </div>

        {courseMode === 'near' && (
          <div className="wiz-course-pane">
            {!geo.coords && (
              <button type="button" className="wiz-cta" onClick={findNearMe} disabled={geo.status === 'requesting'}>
                {geo.status === 'requesting' ? 'Locating…' : '📍 Find courses near me'}
              </button>
            )}
            {geo.status === 'denied' && (
              <div className="wiz-hint warn">{geo.error || 'Location denied. Switch to Saved or Add new.'}</div>
            )}
            {geo.coords && (
              <>
                <div className="wiz-hint">Within 25 mi of you · {searching ? 'searching…' : (searchedAt ? `${searchResults.length} found` : '')} <button type="button" className="wiz-link" onClick={findNearMe}>↻ refresh</button></div>
                <div className="wiz-course-list">
                  {searchResults.map((c) => (
                    <button key={c.osm_id} type="button" className="wiz-course-row" onClick={() => pickOSM(c)} disabled={busy}>
                      <span className="wiz-course-name">{c.name}</span>
                      <span className="wiz-course-meta">{[c.city, c.state].filter(Boolean).join(', ')}</span>
                      <span className="wiz-course-dist">{formatDistance(c.distance_km)}</span>
                    </button>
                  ))}
                  {!searching && searchResults.length === 0 && searchedAt && (
                    <div className="wiz-hint">No courses found nearby. Try Saved or Add new.</div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {courseMode === 'saved' && (
          <div className="wiz-course-pane">
            {!data.orgId ? <div className="wiz-hint">Pick an organization first.</div>
            : savedCourses.length === 0 ? <div className="wiz-hint">No saved courses yet — try 📍 Near me or ✨ Add new.</div>
            : (
              <div className="wiz-course-list">
                {savedCourses.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`wiz-course-row ${data.courseId === c.id ? 'on' : ''}`}
                    onClick={() => setData({ ...data, courseId: c.id, courseName: c.name })}
                  >
                    <span className="wiz-course-name">{c.name}</span>
                    <span className="wiz-course-meta">{[c.city, c.state].filter(Boolean).join(', ') || '—'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {courseMode === 'new' && (
          <div className="wiz-course-pane">
            <div className="wiz-row">
              <label className="wiz-field flex-2">
                <span>Course name</span>
                <input value={newCourseName} onChange={(e) => setNewCourseName(e.target.value)} placeholder="Pine Valley GC" onKeyDown={(e) => e.key === 'Enter' && createBlank()} />
              </label>
              <button type="button" className="wiz-cta" onClick={createBlank} disabled={busy}>
                {busy ? 'Creating…' : 'Add'}
              </button>
            </div>
            <div className="wiz-hint">Pars default to 4 — adjust later from the course detail.</div>
          </div>
        )}
      </div>

      {error && <div className="wiz-hint warn">{error}</div>}
    </section>
  );
}
