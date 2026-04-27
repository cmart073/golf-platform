-- Migration 0010: audit_log table for V2 trust + event-day operations.
-- Run with: wrangler d1 execute golf-db --remote --file=migrations/0010_audit_log.sql
--
-- Records every score edit, admin override, team unlock, status change,
-- and configuration change so organizers can answer "who changed what,
-- when, and why?" without opening a database client.
--
-- Columns:
--   id           — newId('aud_')
--   event_id     — scoping for the read endpoint and cleanup
--   entity_type  — 'score' | 'team' | 'event' | 'wolf_pick' | 'game_point'
--                  | 'sponsor' | 'mulligan' | 'your_hole'
--   entity_id    — primary key of the affected row (team_id for scores)
--   action       — 'create' | 'update' | 'delete' | 'override' | 'unlock'
--                  | 'set_status' | 'set_visibility' | 'regen_token' | …
--   actor        — 'admin' | 'team' | 'match_scorer' | 'system'
--   actor_label  — optional free-form (e.g. team name, IP, future user id)
--   before_json  — snapshot of relevant state before the change (nullable)
--   after_json   — snapshot of relevant state after the change (nullable)
--   reason       — optional free-form rationale
--   created_at   — ISO 8601

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  actor_label TEXT,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log(event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
