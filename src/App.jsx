import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import AdminHome from './pages/AdminHome';
import OrgDetail from './pages/OrgDetail';
import EventDetail from './pages/EventDetail';
import QRPack from './pages/QRPack';
import ScoreEntry from './pages/ScoreEntry';

function TopBar() {
  return (
    <div className="top-bar no-print">
      <span className="logo-text">&#9971; Fairway Live</span>
      <Link to="/admin">Admin</Link>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <TopBar />
      <Routes>
        <Route path="/admin" element={<AdminHome />} />
        <Route path="/admin/org/:orgId" element={<OrgDetail />} />
        <Route path="/admin/event/:eventId" element={<EventDetail />} />
        <Route path="/admin/event/:eventId/qr-pack" element={<QRPack />} />
        <Route path="/score/:accessToken" element={<ScoreEntry />} />
        <Route path="*" element={
          <div className="page-shell">
            <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--green-900)' }}>&#9971; Fairway Live</h1>
            <p style={{ marginTop: '1rem', color: 'var(--slate-500)' }}>
              Live golf event scoring platform. <Link to="/admin">Go to Admin &rarr;</Link>
            </p>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  );
}
