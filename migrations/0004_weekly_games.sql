-- Migration 0004: Weekly match game settings + handicaps + manual side-game points
-- Run with: wrangler d1 execute golf-db --remote --file=migrations/0004_weekly_games.sql

ALTER TABLE events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'tournament';
ALTER TABLE events ADD COLUMN enabled_games_json TEXT NOT NULL DEFAULT '["stroke_play"]';
ALTER TABLE teams ADD COLUMN handicap_strokes INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS game_points (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL CHECK(hole_number >= 1 AND hole_number <= 18),
  game_type TEXT NOT NULL,
  points REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(event_id, team_id, hole_number, game_type)
);

CREATE INDEX IF NOT EXISTS idx_game_points_event ON game_points(event_id);
CREATE INDEX IF NOT EXISTS idx_game_points_team ON game_points(team_id);
