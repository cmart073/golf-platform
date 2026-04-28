-- Migration 0009: V2 canonical event configuration columns.
-- Run with: wrangler d1 execute golf-db --remote --file=migrations/0009_v2_event_config.sql
--
-- Adds the explicit V2 fields the organizer wizard / clone flow / branding
-- propagation rely on. All columns are nullable or have defaults so
-- pre-V2 events continue to work unchanged.
--
--   scoring_mode             — 'distributed' (per-team scorecard) or 'single'
--                              (one scorer for the whole group). Backfilled
--                              from event_type so behavior is unchanged.
--   token_expires_at         — ISO timestamp after which scorer/team tokens
--                              stop working. NULL = no expiry (V1 behavior).
--   token_policy             — 'never' | 'on_complete' | 'fixed'. Drives how
--                              token_expires_at is recomputed when status
--                              changes; 'never' is the V1 default.
--   branding_overrides_json  — Optional JSON: { logo_url, brand_color, ... }
--                              applied per-event on public views; NULL means
--                              fall back to the org's branding.
--   template_source_event_id — When this event was cloned, the id of the
--                              event it was cloned from. Audit / lineage only.

ALTER TABLE events ADD COLUMN scoring_mode TEXT NOT NULL DEFAULT 'distributed';
ALTER TABLE events ADD COLUMN token_expires_at TEXT;
ALTER TABLE events ADD COLUMN token_policy TEXT NOT NULL DEFAULT 'never';
ALTER TABLE events ADD COLUMN branding_overrides_json TEXT;
ALTER TABLE events ADD COLUMN template_source_event_id TEXT;

-- Backfill scoring_mode from existing event_type so legacy rows keep their
-- exact runtime behavior (weekly_match → single scorer; tournament → team
-- cards). event_type stays around for backward compat with read paths until
-- they are migrated to scoring_mode.
UPDATE events SET scoring_mode = 'single'      WHERE event_type = 'weekly_match';
UPDATE events SET scoring_mode = 'distributed' WHERE event_type IS NULL OR event_type = 'tournament';
