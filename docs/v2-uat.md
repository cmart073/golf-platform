# V2 UAT Checklist

End-to-end scenario tests for everything shipped under the V2 plan.
Run these against a deployment with migrations 0001–0010 applied.

## Pre-flight

- [ ] `npm install`
- [ ] `npm run migrate:remote` (or `:local` for the local D1) — confirms the
      runner picks up `0009_v2_event_config.sql` and `0010_audit_log.sql`.
- [ ] `npm run build` exits clean.
- [ ] Open `/admin` and confirm the **+ New Event (Wizard)** button is visible.

## 1. Wizard — single-scorer weekly game (golden path)

- [ ] Click **+ New Event (Wizard)**.
- [ ] Step 1: pick an existing org (or create a new one).
- [ ] Step 2: pick or create a course.
- [ ] Step 3: name the event, confirm slug auto-fills, pick a date and 18 holes.
- [ ] Step 4: tick **Match Play** + **Skins**. Confirm the panel suggests
      `single` and disables the **Distributed** radio.
- [ ] Step 5: paste 4 teams using tabs/commas. Confirm the preview table
      lists them and any duplicate name surfaces in red.
- [ ] Step 6: confirm the review summary shows scoring_mode = single, then
      launch. Verify the resulting event opens with a `scorer_token`.
- [ ] Open the **Match Scorer** link, enter scores for hole 1 across all
      teams, save. Confirm the leaderboard shows the new totals within ~5s.

## 2. Wizard — distributed tournament with Jeff Martin

- [ ] Run the wizard again.
- [ ] Step 4: pick **Stroke Play** + **Jeff Martin**. Confirm Distributed
      stays selected (suggested) and Single is also available.
- [ ] Step 5: import 4 teams from a `.csv` file using the upload button
      (Phase 2.1). Confirm the preview matches.
- [ ] Step 6: launch.
- [ ] Open one team's `/score/<token>` link. Confirm:
      • the JM your-hole picker appears,
      • the mulligan tracker is visible (assuming default jm_show_mulligans).

## 3. Clone an event

- [ ] On the org page, click **Clone** next to the event from §1.
- [ ] Set a fresh slug + date, leave **Also copy sponsors** ticked.
- [ ] Confirm the new event lands at status=draft, with the same enabled
      games, scoring_mode, and sponsors copied.
- [ ] Confirm the cloned event has `template_source_event_id` set (visible
      via API or audit log).

## 4. Branding

- [ ] On the org page, edit the **🎨 Branding** card: paste a logo URL,
      pick a brand color, save.
- [ ] Open the public leaderboard (`/o/:orgSlug/e/:eventSlug`) — confirm
      the logo and brand color appear in the title and org line.
- [ ] Open TV mode (`/o/:orgSlug/e/:eventSlug/tv`) — confirm the logo
      sits next to the event name and the title uses the brand color.
- [ ] On the event page, set per-event branding overrides (via API for
      now, until a UI control lands) and confirm the public views
      reflect the override.

## 5. Polling + stale data

- [ ] On the leaderboard page, throttle the network in devtools to
      offline. Confirm the footer flips to "offline — paused" within
      a few seconds.
- [ ] Re-enable the network. Confirm the footer says "auto-refreshing"
      and the timestamp updates.
- [ ] Stop the API (or break the route in devtools). Confirm the footer
      eventually shows "data may be stale".

## 6. Audit log

- [ ] As a team, submit a hole score. Confirm `/admin/event/:id/audit`
      shows a `score · created` entry with the team actor.
- [ ] Edit the same hole. Confirm a second entry with `before → after`.
- [ ] As admin, override the score (+ optional reason). Confirm an
      `override` entry with actor=admin and the reason populated.
- [ ] Filter by entity=score and actor=admin to confirm filters work.

## 7. Token lifecycle

- [ ] On a team's row, click **↻ New link**. Confirm a new access token
      issues, the audit log records `regen_token`, and the old `/score/<old>`
      URL returns 404.
- [ ] On a single-scorer event, click **↻ New** next to the scorer link.
      Confirm a new scorer_token, audit entry, and old link 404.
- [ ] Set the event's `token_policy` to `on_complete` (via API). Move the
      event to `completed`. Confirm `token_expires_at` is stamped to now
      and any team-token submission returns HTTP 410 with a clear message.

## 8. Offline scoring

- [ ] As a scorer, open `/score/<token>` (or `/match/<token>`).
- [ ] Throttle network to offline.
- [ ] Enter strokes for hole 3 and tap save. Confirm the toast says
      "Saved locally — will sync when online" and the score appears
      with a pending state.
- [ ] Edit hole 3 again — confirm only one queued entry exists
      (coalescing by hole works).
- [ ] Re-enable the network. Confirm the SyncStatusPill flips through
      "Syncing N…" → "✓ All synced", and a fresh fetch shows the score.
- [ ] Send a deliberately bad request (e.g. via DevTools alter the
      payload to strokes=999). Confirm the entry moves to "failed" and
      tapping the pill clears it.

## 9. CSV export

- [ ] On a completed event, click **⬇ Export CSV**.
- [ ] Open in Excel / Google Sheets — confirm the header row, per-team
      rows with hole columns, gross/net columns, and side-game columns
      populate. Confirm the BOM keeps non-ASCII team names intact.

## 10. Print / PDF

- [ ] Click **🖨 Print / PDF**. Confirm the layout renders with stroke
      play summary, per-team scorecards, and side-game tables.
- [ ] Use the browser's **Save as PDF** option. Confirm the action
      buttons disappear in print mode and the page break before each
      scorecard works.

## 11. Single-scorer affordance for every format

For each enabled format, confirm:
- [ ] **Stroke play** — single scorer can enter strokes for every team.
- [ ] **Match play** — single scorer can enter strokes for every team.
- [ ] **Skins** — same; computed automatically from hole strokes.
- [ ] **Bingo / Bango / Bongo** — BBB picker per hole works.
- [ ] **Nassau** — front/back/overall computed; presses can be created.
- [ ] **Wolf** — wolf picks can be set per hole.
- [ ] **Nine points** — strokes feed the points table automatically.
- [ ] **Jeff Martin** — your-hole picker per team and mulligan +/−
      both work from the match-scorer page.

## 12. Distributed affordance

For each format that supports distributed:
- [ ] **Stroke play** — each team's `/score/<token>` accepts strokes.
- [ ] **Skins** — same as stroke play.
- [ ] **Jeff Martin** — team scorecard supports your-hole + mulligans
      (existing V1 flow).
- [ ] Confirm formats that *don't* support distributed (wolf, BBB,
      nassau, match_play, nine_points) actually disable the radio in
      the wizard and EventDetail.

## 13. Regression smoke

- [ ] V1 events created before migration 0009 still load on the leaderboard.
- [ ] Legacy `event_type` stays in sync with `scoring_mode` after edits.
- [ ] QR pack still renders.
- [ ] God-mode admin scorecard still works (overrides, unlock, handicap).
