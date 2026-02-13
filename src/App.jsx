import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import AdminHome from './pages/AdminHome';
import OrgDetail from './pages/OrgDetail';
import EventDetail from './pages/EventDetail';
import QRPack from './pages/QRPack';
import ScoreEntry from './pages/ScoreEntry';
import Leaderboard from './pages/Leaderboard';
import TVMode from './pages/TVMode';

function PublicBar() {
  return (
    <div className="top-bar no-print">
      <span className="logo-text">⛳ Fairway Live</span>
    </div>
  );
}

function AdminBar() {
  return (
    <div className="top-bar top-bar-admin no-print">
      <Link to="/admin" style={{ color: 'white', textDecoration: 'none' }}>
        <span className="logo-text">⛳ Fairway Live</span>
      </Link>
      <span className="admin-badge-nav">GOD MODE</span>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* TV mode — no chrome at all */}
        <Route path="/o/:orgSlug/e/:eventSlug/tv" element={<TVMode />} />

        {/* Admin routes — admin nav */}
        <Route path="/admin" element={<><AdminBar /><AdminHome /></>} />
        <Route path="/admin/org/:orgId" element={<><AdminBar /><OrgDetail /></>} />
        <Route path="/admin/event/:eventId" element={<><AdminBar /><EventDetail /></>} />
        <Route path="/admin/event/:eventId/qr-pack" element={<><AdminBar /><QRPack /></>} />

        {/* Public routes — clean public nav, NO admin links */}
        <Route path="/score/:accessToken" element={<><PublicBar /><ScoreEntry /></>} />
        <Route path="/o/:orgSlug/e/:eventSlug" element={<><PublicBar /><Leaderboard /></>} />
        <Route path="/o/:orgSlug/e/:eventSlug/leaderboard" element={<><PublicBar /><Leaderboard /></>} />

        {/* Fallback */}
        <Route path="*" element={
          <><PublicBar />
            <div className="page-shell" style={{ textAlign: 'center', paddingTop: '4rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⛳</div>
              <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--green-900)' }}>Fairway Live</h1>
              <p style={{ marginTop: '0.75rem', color: 'var(--slate-500)' }}>Live golf event scoring platform.</p>
            </div>
          </>
        } />
      </Routes>
    </BrowserRouter>
  );
}
