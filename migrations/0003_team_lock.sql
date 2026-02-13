-- Migration 0003: Add per-team locking (golfer submits final scores)
-- Run with: wrangler d1 execute golf-db --remote --file=migrations/0003_team_lock.sql

ALTER TABLE teams ADD COLUMN locked_at TEXT;
