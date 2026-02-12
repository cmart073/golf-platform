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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleNameChange = (val) => {
    setName(val);
    setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
  };

  const handleSave = async () => {
    if (!name.trim() || !slug.trim() || !courseId) { setError('Name, slug, and course are required'); return; }
    setSaving(true);
    setError('');
    try {
      const event = await api.createEvent(orgId, { name, slug, date: date || undefined, holes, course_id: courseId });
      onCreated(event);
      setName(''); setSlug(''); setDate(''); setHoles(18); setCourseId('');
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
      <button className="btn btn-primary" onClick={handleSave} disabled={saving || courses.length === 0}>
        {saving ? 'Creating...' : 'Create Event'}
      </button>
    </div>
  );
}

export default function OrgDetail() {
  const { orgId } = useParams();
  const [courses, setCourses] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCourseModal, setShowCourseModal] = useState(false);

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

  useEffect(() => { load(); }, [orgId]);

  if (loading) return <div className="page-shell"><div className="loading">Loading...</div></div>;

  return (
    <div className="page-shell">
      <div className="breadcrumb"><Link to="/admin">Admin</Link> / Organization</div>
      <div className="page-header">
        <h1>Organization</h1>
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
          <h2>&#127942; Events</h2>
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
                      <td><Link to={`/admin/event/${e.id}`} className="btn btn-secondary btn-sm">Manage</Link></td>
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
    </div>
  );
}
