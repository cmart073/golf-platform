import React from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import AdminHome from './pages/AdminHome';
import OrgDetail from './pages/OrgDetail';
import EventDetail from './pages/EventDetail';
import QRPack from './pages/QRPack';
import ScoreEntry from './pages/ScoreEntry';
import Leaderboard from './pages/Leaderboard';
import TVMode from './pages/TVMode';

function TopBar() {
  return (
    <div className="top-bar no-print">
      <Link to="/" style={{ color: 'white', textDecoration: 'none' }}>
        <span className="logo-text">⛳ Fairway Live</span>
      </Link>
      <Link to="/admin">Admin</Link>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* TV mode — no top bar */}
        <Route path="/o/:orgSlug/e/:eventSlug/tv" element={<TVMode />} />

        {/* Everything else gets the top bar */}
        <Route path="*" element={
          <>
            <TopBar />
            <Routes>
              <Route path="/admin" element={<AdminHome />} />
              <Route path="/admin/org/:orgId" element={<OrgDetail />} />
              <Route path="/admin/event/:eventId" element={<EventDetail />} />
              <Route path="/admin/event/:eventId/qr-pack" element={<QRPack />} />
              <Route path="/score/:accessToken" element={<ScoreEntry />} />
              <Route path="/o/:orgSlug/e/:eventSlug" element={<Leaderboard />} />
              <Route path="/o/:orgSlug/e/:eventSlug/leaderboard" element={<Leaderboard />} />
              <Route path="*" element={
                <div className="page-shell">
                  <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--green-900)' }}>⛳ Fairway Live</h1>
                  <p style={{ marginTop: '1rem', color: 'var(--slate-500)' }}>
                    Live golf event scoring platform. <Link to="/admin">Go to Admin →</Link>
                  </p>
                </div>
              } />
            </Routes>
          </>
        } />
      </Routes>
    </BrowserRouter>
  );
}
