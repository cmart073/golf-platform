-- Migration 0002: Seed demo organization
-- Run with: wrangler d1 execute golf-db --remote --file=migrations/0002_seed.sql

INSERT OR IGNORE INTO organizations (id, slug, name, created_at)
VALUES ('org_demo_00000001', 'demo-course', 'Demo Course', datetime('now'));
