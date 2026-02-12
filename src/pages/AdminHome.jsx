import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function AdminHome() {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getOrgs().then(setOrgs).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-shell"><div className="loading">Loading...</div></div>;

  return (
    <div className="page-shell">
      <div className="page-header">
        <h1>Organizations</h1>
      </div>

      {orgs.length === 0 ? (
        <div className="card empty-state">No organizations found. Run the seed migration to create the Demo org.</div>
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
