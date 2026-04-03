-- Migration 0005: Add scorer_token to events for match scorer links
-- This column may already exist if it was added ad-hoc.
-- Run with: wrangler d1 execute golf-db --remote --file=migrations/0005_scorer_token.sql

ALTER TABLE events ADD COLUMN scorer_token TEXT;
CREATE INDEX IF NOT EXISTS idx_events_scorer_token ON events(scorer_token);
