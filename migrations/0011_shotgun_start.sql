-- Migration 0011: Shotgun start support
-- starting_hole already exists in the schema (0001) but was never populated.
-- This migration adds shotgun_start flag to events and ensures the column is indexed.
-- Run with: wrangler d1 execute golf-db --remote --file=migrations/0011_shotgun_start.sql

-- Flag an event as a shotgun start so the UI and scoring logic
-- know to apply wrap-around hole ordering.
ALTER TABLE events ADD COLUMN shotgun_start INTEGER NOT NULL DEFAULT 0;

-- Index starting_hole for quick team lookups by hole assignment
CREATE INDEX IF NOT EXISTS idx_teams_starting_hole ON teams(event_id, starting_hole);
