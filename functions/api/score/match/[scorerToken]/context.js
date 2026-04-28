import { tokenStateSnapshot } from '../../../../_tokens.js';

function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }

function safeJsonArray(raw, fallback = []) {
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : fallback; }
  catch { return fallback; }
}

export async function onRequestGet(context) {
  const db = context.env.DB;
  const scorerToken = context.params.scorerToken;

  // Look up event by scorer_token. SELECT * so we pick up V2 columns
  // (token_expires_at, token_policy) when migration 0009 is in place.
  const event = await db.prepare(
    `SELECT * FROM events WHERE scorer_token = ?`
  ).bind(scorerToken).first();

  if (!event) return err('Invalid scorer token', 404);

  // Get holes (pars)
  const { results: eventHoles } = await db.prepare(
    'SELECT hole_number, par FROM event_holes WHERE event_id = ? ORDER BY hole_number'
  ).bind(event.id).all();

  // Get all teams for this event
  const { results: teams } = await db.prepare(
    'SELECT id, team_name, players_json, handicap_strokes FROM teams WHERE event_id = ? ORDER BY team_name'
  ).bind(event.id).all();

  // Get all scores for all teams in this event
  const teamIds = teams.map(t => t.id);
  let allScores = [];
  if (teamIds.length > 0) {
    // D1 doesn't support IN with bindings well for dynamic lists, so batch query
    const placeholders = teamIds.map(() => '?').join(',');
    const { results } = await db.prepare(
      `SELECT team_id, hole_number, strokes FROM hole_scores WHERE team_id IN (${placeholders}) ORDER BY hole_number`
    ).bind(...teamIds).all();
    allScores = results;
  }

  // Build score maps per team: { team_id: { hole_number: strokes } }
  const scoreMaps = {};
  teams.forEach(t => { scoreMaps[t.id] = {}; });
  allScores.forEach(s => {
    if (scoreMaps[s.team_id]) {
      scoreMaps[s.team_id][s.hole_number] = s.strokes;
    }
  });

  // Get BBB game_points for this event
  const { results: gamePoints } = await db.prepare(
    `SELECT team_id, hole_number, game_type, points FROM game_points
     WHERE event_id = ? AND game_type IN ('bingo','bango','bongo')
     ORDER BY hole_number`
  ).bind(event.id).all();

  // Build bbb map: { hole_number: { bingo: team_id, bango: team_id, bongo: team_id } }
  const bbb = {};
  gamePoints.forEach(gp => {
    if (!bbb[gp.hole_number]) bbb[gp.hole_number] = {};
    if (gp.points > 0) {
      bbb[gp.hole_number][gp.game_type] = gp.team_id;
    }
  });

  const enabledGames = safeJsonArray(event.enabled_games_json, ['stroke_play']);

  // Wolf picks
  let wolfPicks = [];
  try {
    const { results } = await db.prepare(
      'SELECT hole_number, wolf_team_id, partner_team_id FROM wolf_picks WHERE event_id = ? ORDER BY hole_number'
    ).bind(event.id).all();
    wolfPicks = results || [];
  } catch { /* table may not exist yet */ }

  // Presses
  let presses = [];
  try {
    const { results } = await db.prepare(
      "SELECT id, team_id, game_type, hole_number, value, created_at FROM event_bets WHERE event_id = ? AND bet_type = 'press' ORDER BY created_at"
    ).bind(event.id).all();
    presses = results || [];
  } catch { /* table may not exist yet */ }

  // Bet config
  let betConfig = {};
  try {
    const ev = await db.prepare('SELECT bet_config_json FROM events WHERE id = ?').bind(event.id).first();
    betConfig = JSON.parse(ev?.bet_config_json || '{}');
  } catch {}

  // Jeff Martin state (your_holes + mulligans), keyed by team_id, so a
  // single scorer can manage every team. Tables may be absent on legacy DBs.
  const yourHolesByTeam = {};
  const mulligansByTeam = {};
  if (enabledGames.includes('jeff_martin') && teamIds.length > 0) {
    const placeholders = teamIds.map(() => '?').join(',');
    try {
      const { results: yh } = await db.prepare(
        `SELECT team_id, hole_number, player_index FROM hole_your_holes WHERE team_id IN (${placeholders})`,
      ).bind(...teamIds).all();
      (yh || []).forEach((r) => {
        yourHolesByTeam[r.team_id] = yourHolesByTeam[r.team_id] || {};
        yourHolesByTeam[r.team_id][r.hole_number] = r.player_index;
      });
    } catch { /* table missing */ }
    try {
      const { results: muls } = await db.prepare(
        `SELECT team_id, player_index, used_count, holes_used_json FROM team_mulligans WHERE team_id IN (${placeholders})`,
      ).bind(...teamIds).all();
      (muls || []).forEach((r) => {
        let holes = [];
        try { holes = JSON.parse(r.holes_used_json || '[]'); } catch { holes = []; }
        mulligansByTeam[r.team_id] = mulligansByTeam[r.team_id] || {};
        mulligansByTeam[r.team_id][r.player_index] = { used_count: r.used_count, holes_used: holes };
      });
    } catch { /* table missing */ }
  }

  return json({
    event: {
      id: event.id,
      name: event.name,
      date: event.date,
      holes: event.holes,
      status: event.status,
      locked_at: event.locked_at,
      enabled_games: enabledGames,
      event_type: event.event_type,
      ...tokenStateSnapshot(event),
    },
    holes: eventHoles,
    teams: teams.map(t => ({
      id: t.id,
      team_name: t.team_name,
      players: t.players_json ? JSON.parse(t.players_json) : [],
      handicap_strokes: t.handicap_strokes || 0,
      scores: scoreMaps[t.id],
      your_holes: yourHolesByTeam[t.id] || {},
      mulligans: mulligansByTeam[t.id] || {},
    })),
    bbb,
    wolf_picks: wolfPicks,
    presses,
    bet_config: betConfig,
    jm_show_mulligans: event.jm_show_mulligans == null ? true : event.jm_show_mulligans !== 0,
  });
}
