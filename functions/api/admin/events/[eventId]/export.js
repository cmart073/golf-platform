// GET /api/admin/events/:eventId/export.csv (or ?format=csv)
//
// Renders a final-results CSV: one row per team with their players, HCP,
// per-hole strokes, totals, and a summary column for each enabled side
// game. Designed to be opened directly in Excel / Google Sheets — uses
// CRLF line endings, RFC-4180 quoting, and a UTF-8 BOM so Excel detects
// the encoding.

import { computeGameResults, safeJsonArray, safeJsonObj } from '../../../../_game_scoring.js';

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowToLine(cells) {
  return cells.map(escapeCsv).join(',');
}

function err(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestGet(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;
  const url = new URL(context.request.url);
  const requestedFormat = (url.searchParams.get('format') || 'csv').toLowerCase();
  if (requestedFormat !== 'csv') return err('Only ?format=csv is supported in V2 (PDF is on the roadmap).');

  const event = await db.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return err('Event not found', 404);

  const org = await db.prepare('SELECT name, slug FROM organizations WHERE id = ?').bind(event.org_id).first();

  const { results: eventHoles } = await db.prepare(
    'SELECT hole_number, par FROM event_holes WHERE event_id = ? ORDER BY hole_number',
  ).bind(eventId).all();

  const { results: teams } = await db.prepare(
    'SELECT id, team_name, players_json, handicap_strokes, locked_at FROM teams WHERE event_id = ? ORDER BY team_name',
  ).bind(eventId).all();

  let scores = [];
  if (teams.length > 0) {
    const ids = teams.map((t) => t.id);
    const ph = ids.map(() => '?').join(',');
    const r = await db.prepare(
      `SELECT team_id, hole_number, strokes FROM hole_scores WHERE team_id IN (${ph})`,
    ).bind(...ids).all();
    scores = r.results || [];
  }

  // Side-game inputs (best-effort — tables may not exist on older DBs).
  let presses = [];
  let wolfPicks = [];
  let yourHoles = [];
  let manualPoints = [];
  try { const r = await db.prepare("SELECT id, team_id, game_type, hole_number, value FROM event_bets WHERE event_id = ? AND bet_type = 'press'").bind(eventId).all(); presses = r.results || []; } catch {}
  try { const r = await db.prepare('SELECT hole_number, wolf_team_id, partner_team_id FROM wolf_picks WHERE event_id = ?').bind(eventId).all(); wolfPicks = r.results || []; } catch {}
  try { if (teams.length > 0) {
    const ids = teams.map((t) => t.id); const ph = ids.map(() => '?').join(',');
    const r = await db.prepare(`SELECT team_id, hole_number, player_index FROM hole_your_holes WHERE team_id IN (${ph})`).bind(...ids).all();
    yourHoles = r.results || [];
  } } catch {}
  try { const r = await db.prepare('SELECT team_id, hole_number, game_type, points FROM game_points WHERE event_id = ?').bind(eventId).all(); manualPoints = r.results || []; } catch {}

  const enabled = safeJsonArray(event.enabled_games_json, ['stroke_play']);
  const multipliers = safeJsonObj(event.bet_config_json, {}).multipliers || {};

  const gameResults = computeGameResults({
    teams,
    scores,
    holeCount: event.holes,
    enabled,
    parByHole: eventHoles.reduce((a, h) => { a[h.hole_number] = h.par; return a; }, {}),
    yourHolesByTeam: yourHoles,
    manualPoints,
    presses,
    wolfPicks,
    multipliers,
  });

  // Build a quick lookup: team_id → game summary string.
  const summaryByTeam = {};
  function set(tid, key, val) {
    if (val == null) return;
    summaryByTeam[tid] = summaryByTeam[tid] || {};
    summaryByTeam[tid][key] = val;
  }
  if (gameResults.stroke_play) gameResults.stroke_play.forEach((r) => {
    set(r.team_id, 'gross', r.gross_strokes);
    set(r.team_id, 'net',   r.net_strokes);
  });
  if (gameResults.match_play) gameResults.match_play.forEach((r) => set(r.team_id, 'match_play_pts', r.points));
  if (gameResults.skins)      gameResults.skins.forEach((r)      => set(r.team_id, 'skins',          r.skins_won));
  if (gameResults.bingo_bango_bongo) gameResults.bingo_bango_bongo.forEach((r) => set(r.team_id, 'bbb_pts', r.points));
  if (gameResults.nine_points) gameResults.nine_points.forEach((r) => set(r.team_id, 'nine_points',  r.points));
  if (gameResults.jeff_martin) gameResults.jeff_martin.forEach((r) => set(r.team_id, 'jeff_martin',  r.points));
  if (gameResults.nassau?.overall) gameResults.nassau.overall.forEach((r) => set(r.team_id, 'nassau_overall', r.points));

  // CSV ----------------------------------------------------------------
  const lines = [];
  lines.push(rowToLine([`Event`, event.name]));
  if (org) lines.push(rowToLine([`Organization`, org.name]));
  if (event.date) lines.push(rowToLine([`Date`, event.date]));
  lines.push(rowToLine([`Holes`, event.holes]));
  lines.push(rowToLine([`Status`, event.status]));
  lines.push(rowToLine([`Exported`, new Date().toISOString()]));
  lines.push('');

  // Header row
  const holeHeaders = eventHoles.map((h) => `H${h.hole_number} (par ${h.par})`);
  const summaryCols = ['gross', 'net', 'match_play_pts', 'skins', 'bbb_pts', 'nine_points', 'nassau_overall', 'jeff_martin']
    .filter((k) => Object.values(summaryByTeam).some((row) => row[k] != null));
  const header = ['Team', 'Players', 'HCP', 'Submitted', ...holeHeaders, 'Total Strokes', ...summaryCols];
  lines.push(rowToLine(header));

  for (const t of teams) {
    const players = (() => { try { return JSON.parse(t.players_json || '[]'); } catch { return []; } })();
    const teamScores = scores.filter((s) => s.team_id === t.id);
    const byHole = {};
    teamScores.forEach((s) => { byHole[s.hole_number] = s.strokes; });
    const total = eventHoles.reduce((sum, h) => sum + (byHole[h.hole_number] || 0), 0);
    const row = [
      t.team_name,
      players.join(' | '),
      t.handicap_strokes ?? 0,
      t.locked_at ? 'yes' : 'no',
      ...eventHoles.map((h) => byHole[h.hole_number] ?? ''),
      total,
      ...summaryCols.map((k) => summaryByTeam[t.id]?.[k] ?? ''),
    ];
    lines.push(rowToLine(row));
  }

  const body = '﻿' + lines.join('\r\n') + '\r\n';
  const filename = `${(org?.slug || 'event')}-${event.slug || event.id}.csv`;
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
