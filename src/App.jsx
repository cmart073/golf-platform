import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import AdminHome from './pages/AdminHome';
import OrgDetail from './pages/OrgDetail';
import EventDetail from './pages/EventDetail';
import EventWizard from './pages/EventWizard';
import AuditLog from './pages/AuditLog';
import QRPack from './pages/QRPack';
import ScoreEntry from './pages/ScoreEntry';
import MatchScorer from './pages/MatchScorer';
import Leaderboard from './pages/Leaderboard';
import TVMode from './pages/TVMode';
import Landing from './pages/Landing';

function PublicBar() {
  return (
    <div className="top-bar no-print">
      <img src="/logo.svg" alt="FairwaysLive" style={{ height: '56px', objectFit: 'contain' }} />
    </div>
  );
}

function AdminBar() {
  return (
    <div className="top-bar top-bar-admin no-print">
      <Link to="/admin" style={{ display: 'flex', alignItems: 'center' }}>
        <img src="/logo.svg" alt="FairwaysLive" style={{ height: '56px', objectFit: 'contain' }} />
      </Link>
      <span className="admin-badge-nav">GOD MODE</span>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Marketing landing page — no shared chrome */}
        <Route path="/" element={<Landing />} />

        {/* TV mode — no chrome at all */}
        <Route path="/o/:orgSlug/e/:eventSlug/tv" element={<TVMode />} />

        {/* Admin routes — admin nav */}
        <Route path="/admin" element={<><AdminBar /><AdminHome /></>} />
        <Route path="/admin/org/:orgId" element={<><AdminBar /><OrgDetail /></>} />
        <Route path="/admin/wizard" element={<><AdminBar /><EventWizard /></>} />
        <Route path="/admin/event/:eventId" element={<><AdminBar /><EventDetail /></>} />
        <Route path="/admin/event/:eventId/qr-pack" element={<><AdminBar /><QRPack /></>} />
        <Route path="/admin/event/:eventId/audit" element={<><AdminBar /><AuditLog /></>} />

        {/* Public routes — clean public nav */}
        <Route path="/score/:accessToken" element={<><PublicBar /><ScoreEntry /></>} />
        <Route path="/match/:scorerToken" element={<><PublicBar /><MatchScorer /></>} />
        <Route path="/o/:orgSlug/e/:eventSlug" element={<><PublicBar /><Leaderboard /></>} />
        <Route path="/o/:orgSlug/e/:eventSlug/leaderboard" element={<><PublicBar /><Leaderboard /></>} />

        {/* Fallback → landing */}
        <Route path="*" element={<Landing />} />
      </Routes>
    </BrowserRouter>
  );
}
