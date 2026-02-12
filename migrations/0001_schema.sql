-- Migration 0001: Full schema for Golf Event Platform
-- Run with: wrangler d1 execute golf-db --remote --file=migrations/0001_schema.sql

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  logo_url TEXT,
  brand_color TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  city TEXT,
  state TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(org_id, name)
);

CREATE TABLE IF NOT EXISTS course_holes (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL CHECK(hole_number >= 1 AND hole_number <= 18),
  par INTEGER NOT NULL CHECK(par >= 3 AND par <= 6),
  UNIQUE(course_id, hole_number)
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  course_id TEXT REFERENCES courses(id),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  date TEXT,
  holes INTEGER NOT NULL CHECK(holes IN (9, 18)),
  leaderboard_visible INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  locked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(org_id, slug)
);

CREATE TABLE IF NOT EXISTS event_holes (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL CHECK(hole_number >= 1 AND hole_number <= 18),
  par INTEGER NOT NULL CHECK(par >= 3 AND par <= 6),
  UNIQUE(event_id, hole_number)
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  team_name TEXT NOT NULL,
  players_json TEXT,
  access_token TEXT NOT NULL UNIQUE,
  starting_hole INTEGER CHECK(starting_hole >= 1 AND starting_hole <= 18),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hole_scores (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL CHECK(hole_number >= 1 AND hole_number <= 18),
  strokes INTEGER NOT NULL CHECK(strokes >= 1 AND strokes <= 20),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  UNIQUE(team_id, hole_number)
);

CREATE TABLE IF NOT EXISTS sponsors (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  logo_url TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  link_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_courses_org ON courses(org_id);
CREATE INDEX IF NOT EXISTS idx_events_org ON events(org_id);
CREATE INDEX IF NOT EXISTS idx_teams_event ON teams(event_id);
CREATE INDEX IF NOT EXISTS idx_teams_token ON teams(access_token);
CREATE INDEX IF NOT EXISTS idx_hole_scores_team ON hole_scores(team_id);
CREATE INDEX IF NOT EXISTS idx_event_holes_event ON event_holes(event_id);
