-- Migration 0008: per-event toggle for showing the mulligan tracker on scorecard pages
-- Run with: wrangler d1 execute golf-db --remote --file=migrations/0008_jm_show_mulligans.sql
--
-- Defaults to 1 (visible) so existing Jeff Martin events keep their current behavior.
-- Stored as INTEGER per D1's boolean convention.

ALTER TABLE events ADD COLUMN jm_show_mulligans INTEGER NOT NULL DEFAULT 1;
