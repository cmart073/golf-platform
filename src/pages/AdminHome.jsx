import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function AdminHome() {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getOrgs().then(setOrgs).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleNameChange = (val) => {
    setOrgName(val);
    setOrgSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
  };

  const handleCreate = async () => {
    if (!orgName.trim() || !orgSlug.trim()) { setError('Name and slug are required'); return; }
    setSaving(true);
    setError('');
    try {
      const org = await api.createOrg({ name: orgName, slug: orgSlug });
      setOrgs(prev => [org, ...prev]);
      setOrgName('');
      setOrgSlug('');
      setShowForm(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="page-shell"><div className="loading">Loading...</div></div>;

  return (
    <div className="page-shell">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Organizations</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link to="/admin/wizard" className="btn btn-primary btn-sm">+ New Event (Wizard)</Link>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(f => !f)}>
            {showForm ? 'Cancel' : '+ New Org'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--slate-700)' }}>New Organization</h3>
          {error && <div style={{ color: 'var(--red-500)', marginBottom: '0.75rem', fontSize: '0.9rem' }}>{error}</div>}
          <div className="form-row">
            <div className="form-group">
              <label>Name *</label>
              <input value={orgName} onChange={(e) => handleNameChange(e.target.value)} placeholder="My Golf League" />
            </div>
            <div className="form-group">
              <label>Slug *</label>
              <input value={orgSlug} onChange={(e) => setOrgSlug(e.target.value)} placeholder="my-golf-league" />
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
            {saving ? 'Creating...' : 'Create Organization'}
          </button>
        </div>
      )}

      {orgs.length === 0 && !showForm ? (
        <div className="card empty-state">No organizations found. Click "+ New Org" to create one.</div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {orgs.map((org) => (
            <Link key={org.id} to={`/admin/org/${org.id}`} style={{ textDecoration: 'none' }}>
              <div className="card" style={{ cursor: 'pointer', transition: 'box-shadow 0.15s' }}>
                <h2 style={{ fontSize: '1.25rem', color: 'var(--green-800)', margin: 0 }}>{org.name}</h2>
                <div style={{ fontSize: '0.85rem', color: 'var(--slate-500)', marginTop: '0.25rem' }}>
                  /{org.slug}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
