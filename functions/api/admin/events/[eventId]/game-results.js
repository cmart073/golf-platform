import { computeGameResults, safeJsonObj } from '../../../../_game_scoring.js';

function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }

export async function onRequestGet(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;

  const event = await db.prepare(
    'SELECT id, holes, event_type, enabled_games_json, bet_config_json FROM events WHERE id = ?'
  ).bind(eventId).first();
  if (!event) return err('Event not found', 404);

  const { results: teams } = await db.prepare(
    'SELECT id, team_name, handicap_strokes FROM teams WHERE event_id = ? ORDER BY created_at'
  ).bind(eventId).all();

  const { results: scores } = await db.prepare(
    'SELECT team_id, hole_number, strokes FROM hole_scores WHERE team_id IN (SELECT id FROM teams WHERE event_id = ?)'
  ).bind(eventId).all();

  const { results: manualPoints } = await db.prepare(
    'SELECT team_id, hole_number, game_type, points FROM game_points WHERE event_id = ?'
  ).bind(eventId).all();

  // Fetch presses
  let presses = [];
  try {
    const { results } = await db.prepare(
      "SELECT team_id, game_type, hole_number, value FROM event_bets WHERE event_id = ? AND bet_type = 'press'"
    ).bind(eventId).all();
    presses = results || [];
  } catch { /* table may not exist yet */ }

  // Fetch wolf picks
  let wolfPicks = [];
  try {
    const { results } = await db.prepare(
      'SELECT hole_number, wolf_team_id, partner_team_id FROM wolf_picks WHERE event_id = ? ORDER BY hole_number'
    ).bind(eventId).all();
    wolfPicks = results || [];
  } catch { /* table may not exist yet */ }

  // Fetch Jeff Martin your-hole selections
  let yourHoles = [];
  try {
    const { results } = await db.prepare(
      'SELECT team_id, hole_number, player_index FROM hole_your_holes WHERE team_id IN (SELECT id FROM teams WHERE event_id = ?)'
    ).bind(eventId).all();
    yourHoles = results || [];
  } catch { /* table may not exist yet */ }

  // Fetch par by hole for Jeff Martin / Stableford math
  const { results: eventHoles } = await db.prepare(
    'SELECT hole_number, par FROM event_holes WHERE event_id = ? ORDER BY hole_number'
  ).bind(eventId).all();
  const parByHole = {};
  (eventHoles || []).forEach(h => { parByHole[h.hole_number] = h.par; });

  // Fetch multipliers from bet_config_json
  const betConfig = safeJsonObj(event.bet_config_json, {});
  const multipliers = betConfig.multipliers || {};

  const results = computeGameResults({ event, teams, scores, manualPoints, presses, wolfPicks, multipliers, yourHoles, parByHole });
  return json({ event_type: event.event_type || 'tournament', results, bet_config: betConfig });
}
