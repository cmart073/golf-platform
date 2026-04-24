-- Migration 0007: Jeff Martin game (Modified Stableford scramble)
-- Run with: wrangler d1 execute golf-db --remote --file=migrations/0007_jeff_martin.sql

-- Per-team per-hole: which player on the team "owned" the hole
-- (drove, approached, and putted without help from teammates).
-- player_index refers to the 0-based index into teams.players_json.
-- NULL player_index is allowed (row absent = no "your hole" on that hole).
CREATE TABLE IF NOT EXISTS hole_your_holes (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL CHECK(hole_number >= 1 AND hole_number <= 18),
  player_index INTEGER NOT NULL CHECK(player_index >= 0 AND player_index <= 7),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(team_id, hole_number)
);

CREATE INDEX IF NOT EXISTS idx_hole_your_holes_team ON hole_your_holes(team_id);

-- Per-team per-player mulligan counter.
-- Jeff Martin rules: 2 mulligans per person per 6 holes (6 total over 18).
-- This table tracks usage; the engine enforces the cap at read time.
CREATE TABLE IF NOT EXISTS team_mulligans (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_index INTEGER NOT NULL CHECK(player_index >= 0 AND player_index <= 7),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK(used_count >= 0),
  -- holes_used_json stores the list of hole numbers each mulligan was used on
  -- (optional display detail; engine relies on used_count).
  holes_used_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(team_id, player_index)
);

CREATE INDEX IF NOT EXISTS idx_team_mulligans_team ON team_mulligans(team_id);
