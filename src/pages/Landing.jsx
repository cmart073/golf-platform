import React from 'react';
import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="landing">
      {/* ═══ NAV ═══ */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <Link to="/" className="lp-brand">
            <img src="/logo.svg" alt="Fairways Live" />
          </Link>
          <div className="lp-nav-links">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#games">Games</a>
            <Link to="/admin" className="lp-nav-cta">Admin</Link>
          </div>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <header className="lp-hero">
        <div className="lp-hero-grid-bg" aria-hidden="true"></div>
        <div className="lp-hero-inner">
          <div className="lp-hero-copy">
            <div className="lp-eyebrow">
              <span className="lp-dot"></span> Tournament platform · est. 2025
            </div>
            <h1 className="lp-h1">
              Live scoring,<br />
              <em>beautifully</em> done.
            </h1>
            <p className="lp-lede">
              Fairways Live is a boutique scoring platform for the events that deserve more than a paper scorecard. Real-time leaderboards, custom games, and course-branded everything — from the QR code on the cart to the screen in the clubhouse.
            </p>
            <div className="lp-cta-row">
              <Link to="/admin" className="lp-btn lp-btn-primary">
                Open the clubhouse
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
              </Link>
              <a href="#features" className="lp-btn lp-btn-ghost">See how it works</a>
            </div>
            <div className="lp-trust">
              <div className="lp-trust-item"><strong>18</strong><span>holes, hole-by-hole</span></div>
              <div className="lp-trust-divider"></div>
              <div className="lp-trust-item"><strong>Live</strong><span>updates, no refresh</span></div>
              <div className="lp-trust-divider"></div>
              <div className="lp-trust-item"><strong>QR</strong><span>one tap to score</span></div>
            </div>
          </div>

          {/* ═══ Leaderboard preview card ═══ */}
          <div className="lp-hero-visual">
            <div className="lp-preview-window">
              <div className="lp-preview-chrome">
                <span></span><span></span><span></span>
                <div className="lp-preview-url">fairways.live / oak-hills / spring-invite</div>
              </div>
              <div className="lp-preview-body">
                <div className="lp-preview-header">
                  <div>
                    <div className="lp-preview-eyebrow">LIVE · THRU 12</div>
                    <div className="lp-preview-title">Spring Invitational</div>
                  </div>
                  <div className="lp-preview-pill"><span className="lp-pulse"></span> Updating</div>
                </div>
                <div className="lp-lb">
                  {[
                    { pos: '1', name: 'Team Magnolia', score: '−9', thru: '12' },
                    { pos: '2', name: 'Team Cypress', score: '−7', thru: '12' },
                    { pos: 'T3', name: 'Team Redbud', score: '−5', thru: '11' },
                    { pos: 'T3', name: 'Team Dogwood', score: '−5', thru: '13' },
                    { pos: '5', name: 'Team Hickory', score: '−2', thru: '12' },
                  ].map((r, i) => (
                    <div className={`lp-lb-row ${i === 0 ? 'lp-lb-lead' : ''}`} key={i} style={{ animationDelay: `${0.15 + i * 0.08}s` }}>
                      <span className="lp-lb-pos">{r.pos}</span>
                      <span className="lp-lb-name">{r.name}</span>
                      <span className="lp-lb-thru">thru {r.thru}</span>
                      <span className="lp-lb-score">{r.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="lp-preview-decor lp-preview-decor-1" aria-hidden="true">
              <div className="lp-mini-card">
                <div className="lp-mini-label">Skins · Hole 7</div>
                <div className="lp-mini-value">Magnolia</div>
                <div className="lp-mini-sub">carries $40</div>
              </div>
            </div>
            <div className="lp-preview-decor lp-preview-decor-2" aria-hidden="true">
              <div className="lp-mini-card">
                <div className="lp-mini-label">Closest to pin · 14</div>
                <div className="lp-mini-value">J. Marten</div>
                <div className="lp-mini-sub">4′ 2″</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ═══ FEATURES ═══ */}
      <section id="features" className="lp-section">
        <div className="lp-section-inner">
          <div className="lp-section-head">
            <div className="lp-eyebrow lp-eyebrow-dark"><span className="lp-dot"></span> What's on the card</div>
            <h2 className="lp-h2">Everything an event needs.<br /><em>Nothing it doesn't.</em></h2>
          </div>

          <div className="lp-feature-grid">
            <div className="lp-feature lp-feature-lg">
              <div className="lp-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 21V5l9-2 9 2v16"/>
                  <path d="M3 21h18M8 9h.01M12 9h.01M16 9h.01M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01"/>
                </svg>
              </div>
              <h3>Live leaderboards</h3>
              <p>Hole-by-hole scores push to the board the moment they're entered. Big-screen TV mode for the clubhouse, a mobile view for every golfer in the field.</p>
              <ul className="lp-feat-list">
                <li>Gross, net, and team scoring</li>
                <li>Ties broken by matching cards</li>
                <li>TV mode for bar-side viewing</li>
              </ul>
            </div>

            <div className="lp-feature">
              <div className="lp-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="7" height="7" rx="1"/>
                  <rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/>
                  <path d="M14 14h3v3h-3zM18 14h3M14 18h3M18 18v3"/>
                </svg>
              </div>
              <h3>QR scorecards</h3>
              <p>Print a pack, hand them out at the first tee. One scan, one tap per hole. No app, no account.</p>
            </div>

            <div className="lp-feature">
              <div className="lp-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 2l2.5 6.5L21 9l-5 4.5L17.5 21 12 17.5 6.5 21 8 13.5 3 9l6.5-.5z"/>
                </svg>
              </div>
              <h3>Custom games</h3>
              <p>Skins, Wolf, match play, Nassau, side bets, closest-to-the-pin — run them alongside the main event without a spreadsheet in sight.</p>
            </div>

            <div className="lp-feature">
              <div className="lp-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="9"/>
                  <path d="M12 3a15 15 0 010 18M3 12h18"/>
                </svg>
              </div>
              <h3>Course branded</h3>
              <p>Your logo, your colors, your course name — on the leaderboard, the scorecard, the shareable link. Boutique by default.</p>
            </div>

            <div className="lp-feature">
              <div className="lp-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="4" width="18" height="16" rx="2"/>
                  <path d="M3 10h18M8 14h4"/>
                </svg>
              </div>
              <h3>Admin god-mode</h3>
              <p>Override a locked card, fix a fat-fingered score, reopen a hole at the turn. The pro shop has every key on the ring.</p>
            </div>

            <div className="lp-feature">
              <div className="lp-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15a4 4 0 01-4 4H7l-4 4V6a4 4 0 014-4h10a4 4 0 014 4v9z"/>
                </svg>
              </div>
              <h3>Locks &amp; attestation</h3>
              <p>Golfers lock their own card when it's signed. Cards stay immutable until an admin says otherwise — just like a real rules committee.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section id="how" className="lp-section lp-section-dark">
        <div className="lp-section-inner">
          <div className="lp-section-head lp-section-head-center">
            <div className="lp-eyebrow lp-eyebrow-light"><span className="lp-dot"></span> From first tee to final putt</div>
            <h2 className="lp-h2 lp-h2-light">Three steps. <em>That's the round.</em></h2>
          </div>
          <div className="lp-steps">
            <div className="lp-step">
              <div className="lp-step-num">01</div>
              <h3>Build the event</h3>
              <p>Drop in your course, bulk-import teams, wire up the games. Ten minutes, tops.</p>
            </div>
            <div className="lp-step-conn" aria-hidden="true"></div>
            <div className="lp-step">
              <div className="lp-step-num">02</div>
              <h3>Print the QR pack</h3>
              <p>One card per team. Hand them out at registration and head for the starter.</p>
            </div>
            <div className="lp-step-conn" aria-hidden="true"></div>
            <div className="lp-step">
              <div className="lp-step-num">03</div>
              <h3>Watch it unfold</h3>
              <p>Scores stream to the leaderboard. The TV in the grill is already showing the lead change.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ GAMES ═══ */}
      <section id="games" className="lp-section">
        <div className="lp-section-inner">
          <div className="lp-games-split">
            <div className="lp-games-copy">
              <div className="lp-eyebrow lp-eyebrow-dark"><span className="lp-dot"></span> Games &amp; side action</div>
              <h2 className="lp-h2">However you like to <em>play it.</em></h2>
              <p className="lp-lede lp-lede-sm">
                Stroke play is just the headline. Run skins on the side, a two-man best-ball in Flight A, a ryder-cup format for the member-guest — all in one event, all scored live.
              </p>
              <div className="lp-chips">
                {['Stroke play', 'Match play', 'Nassau', 'Skins', 'Wolf', 'Best ball', 'Scramble', 'Chapman', 'Closest to pin', 'Long drive', 'Flights', 'Net & gross'].map(g => (
                  <span className="lp-chip" key={g}>{g}</span>
                ))}
              </div>
            </div>
            <div className="lp-games-visual">
              <div className="lp-game-card lp-game-card-1">
                <div className="lp-game-card-head"><span className="lp-game-tag">SKINS</span><span className="lp-game-hole">Hole 9 · Par 4</span></div>
                <div className="lp-game-winner">
                  <div className="lp-game-name">Cypress</div>
                  <div className="lp-game-score">3 <span>(−1)</span></div>
                </div>
                <div className="lp-game-pot">Pot: $80 · carried from 8</div>
              </div>
              <div className="lp-game-card lp-game-card-2">
                <div className="lp-game-card-head"><span className="lp-game-tag lp-game-tag-alt">MATCH</span><span className="lp-game-hole">Redbud v. Hickory</span></div>
                <div className="lp-game-match">
                  <div><span>Redbud</span><strong>2 UP</strong></div>
                  <div className="lp-game-thru">thru 11</div>
                </div>
              </div>
              <div className="lp-game-card lp-game-card-3">
                <div className="lp-game-card-head"><span className="lp-game-tag lp-game-tag-gold">CTP</span><span className="lp-game-hole">Hole 14 · Par 3</span></div>
                <div className="lp-game-winner">
                  <div className="lp-game-name">J. Marten</div>
                  <div className="lp-game-score">4′ 2″</div>
                </div>
                <div className="lp-game-pot">1st to post · 6 groups remaining</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="lp-cta-section">
        <div className="lp-cta-inner">
          <h2 className="lp-h2">Your next event <em>deserves this.</em></h2>
          <p>Member-guests, charity outings, Saturday skins games — if there's a scorecard, there's a case for doing it live.</p>
          <div className="lp-cta-row lp-cta-row-center">
            <Link to="/admin" className="lp-btn lp-btn-primary">Open the clubhouse</Link>
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <img src="/logo.svg" alt="Fairways Live" className="lp-footer-logo" />
          <div className="lp-footer-meta">
            <span>© {new Date().getFullYear()} Fairways Live</span>
            <span className="lp-footer-dot">·</span>
            <span>Built for the pro shop, the starter, and everyone in between.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
