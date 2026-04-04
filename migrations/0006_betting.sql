-- Migration 0006: Betting features — presses, multipliers, wolf picks
-- Run with: wrangler d1 execute golf-db --remote --file=migrations/0006_betting.sql

-- Track presses and point multipliers per event
CREATE TABLE IF NOT EXISTS event_bets (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  bet_type TEXT NOT NULL,          -- 'press', 'multiplier'
  game_type TEXT NOT NULL,         -- which game: 'nassau_front', 'nassau_back', 'nassau_overall', 'skins', etc.
  team_id TEXT REFERENCES teams(id) ON DELETE CASCADE, -- who pressed (null for multiplier)
  hole_number INTEGER,             -- hole when press was made
  value REAL NOT NULL DEFAULT 1,   -- multiplier value or press count
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_event_bets_event ON event_bets(event_id);

-- Wolf picks per hole: who the wolf is, who they picked as partner (null = lone wolf)
CREATE TABLE IF NOT EXISTS wolf_picks (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL CHECK(hole_number >= 1 AND hole_number <= 18),
  wolf_team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  partner_team_id TEXT REFERENCES teams(id) ON DELETE CASCADE, -- null = lone wolf
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(event_id, hole_number)
);

CREATE INDEX IF NOT EXISTS idx_wolf_picks_event ON wolf_picks(event_id);

-- Point value per unit for each game (e.g. $2 nassau, $1 skins)
ALTER TABLE events ADD COLUMN bet_config_json TEXT NOT NULL DEFAULT '{}';
