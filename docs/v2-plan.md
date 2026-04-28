# V2 Plan (Organizer-First)

## Scope and guardrails
- Primary user for V2: **event organizers**.
- Stack: **Cloudflare-only** (Pages/Workers/D1 plus Cloudflare-native capabilities).
- Cost rule: **no new paid third-party services** without explicit approval.
- Access model in V2: **link/token based** (accounts/roles deferred; Cloudflare Access is a future direction).
- Product goals: improve organizer self-serve setup, support tournaments + weekly games, and keep golfer/scorer UX simple.

## 1) Feature roadmap (V2)

### A. Organizer self-serve setup (highest priority)
- **Organizer onboarding wizard** that walks through:
  1. Create/select organization
  2. Create event
  3. Choose tournament/game formats
  4. Add/import teams/players
  5. Configure scoring mode and permissions
  6. Generate links/QR and go live
- **Event cloning/templates** to duplicate previous events (formats, structure, and defaults).
- **CSV / Google Sheets-friendly import** for tee sheets, teams, and player rosters.

### B. Scoring model and score entry
- **Format-driven auto configuration**: scoring input model is selected automatically by game format.
- **Single scorecard support always available**: one scorer can enter all required values for the entire group.
- **Optional distributed scoring mode**: allow team/player-level distributed entry when organizer enables it.
- **Fast polling live updates** target (acceptable delay): ~3-5 seconds.

### C. Games support and reliability
- Expand and harden support for tournament + side-game workflows used by weekly friend groups.
- Ensure game engines are resilient to edge cases and format-specific constraints.
- Keep payout money handling manual in V2 (results/points tracked in app).

### D. Trust, controls, and event-day operations
- **Score edit audit trail** in admin:
  - who changed a score
  - what changed
  - when it changed
  - optional reason
- **Token lifecycle controls**:
  - token expiration after event completion
  - one-click token regeneration for organizers
- **Offline / poor-signal scoring**:
  - local save while offline
  - auto-sync when connection returns
  - visible sync status for scorers

### E. Branding and outputs
- **Organization white-labeling**:
  - logo/colors
  - branded links/scorecards/leaderboards
  - domain/subdomain support where feasible on Cloudflare stack
- **Post-round export/reporting**:
  - downloadable leaderboard + side-game results as CSV/PDF

### F. Deferred to V2.1 (explicit)
- Automated SMS/email communications for invitations, links, and results.
- Full account/role auth model (beyond token/link access).

## 2) Concrete implementation sequence (delivery order)

### Phase 0 — Product scaffolding and defaults
- Define canonical event configuration schema (formats, scoring mode, token policy, branding flags).
- Add per-format metadata to drive auto score-entry model selection.
- Establish reusable "event template" payload shape for cloning.

### Phase 1 — Organizer onboarding foundation
- Build onboarding wizard UI flow and progressive validation.
- Implement event create/edit APIs to accept full structured config.
- Add clone-event endpoint and UI action from organizer dashboard.

### Phase 2 — Import and setup acceleration
- Add CSV upload + validation for teams/players/tee-sheet data.
- Add paste-from-sheet parsing path (Google Sheets-compatible tabular input).
- Provide import preview + conflict resolution before commit.

### Phase 3 — Scoring engine and input modes
- Implement format-driven scorecard renderer selection (team vs per-player/mixed).
- Keep a guaranteed "single scorer enters all required scores" flow for every format.
- Add organizer toggle for distributed scoring mode by event.

### Phase 4 — Live operations hardening
- Add audit-log persistence for score edits and admin overrides.
- Add token expiry + regeneration controls and token-state UI.
- Improve polling loop behavior and stale-data handling for leaderboard/TV mode.

### Phase 5 — Offline-first behavior
- Add client-side offline queue for score submissions.
- Add deterministic sync/retry conflict handling when reconnecting.
- Add explicit sync indicators and recovery UX on scorer screens.

### Phase 6 — Branding + outputs
- Add org-level branding settings and propagate to public event views.
- Add export generation for final results (CSV first, PDF second).
- Validate end-to-end organizer runbook from create → live scoring → final export.

### Phase 7 — Release readiness
- Run scenario-based UAT for:
  - single-scorer weekly games
  - distributed team tournament mode
  - poor-signal/offline round completion
  - score edits + audit review
- Ship with V2.1 backlog already captured (automated comms + auth evolution).
