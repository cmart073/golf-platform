import { computeGameResults, safeJsonObj, getHoleOrder } from '../../../../_game_scoring.js';

function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }

export async function onRequestGet(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;

  const event = await db.prepare(
    'SELECT id, holes, event_type, enabled_games_json, bet_config_json, shotgun_start FROM events WHERE id = ?'
  ).bind(eventId).first();
  if (!event) return err('Event not found', 404);

  const { results: teams } = await db.prepare(
    'SELECT id, team_name, handicap_strokes, starting_hole FROM teams WHERE event_id = ? ORDER BY created_at'
  ).bind(eventId).all();

  const { results: scores } = await db.prepare(
    'SELECT team_id, hole_number, strokes FROM hole_scores WHERE team_id IN (SELECT id FROM teams WHERE event_id = ?)'
  ).bind(eventId).all();

  const { results: manualPoints } = await db.prepare(
    'SELECT team_id, hole_number, game_type, points FROM game_points WHERE event_id = ?'
  ).bind(eventId).all();

  let presses = [];
  try {
    const { results } = await db.prepare(
      "SELECT team_id, game_type, hole_number, value FROM event_bets WHERE event_id = ? AND bet_type = 'press'"
    ).bind(eventId).all();
    presses = results || [];
  } catch { /* table may not exist yet */ }

  let wolfPicks = [];
  try {
    const { results } = await db.prepare(
      'SELECT hole_number, wolf_team_id, partner_team_id FROM wolf_picks WHERE event_id = ? ORDER BY hole_number'
    ).bind(eventId).all();
    wolfPicks = results || [];
  } catch { /* table may not exist yet */ }

  let yourHoles = [];
  try {
    const { results } = await db.prepare(
      'SELECT team_id, hole_number, player_index FROM hole_your_holes WHERE team_id IN (SELECT id FROM teams WHERE event_id = ?)'
    ).bind(eventId).all();
    yourHoles = results || [];
  } catch { /* table may not exist yet */ }

  const { results: eventHoles } = await db.prepare(
    'SELECT hole_number, par FROM event_holes WHERE event_id = ? ORDER BY hole_number'
  ).bind(eventId).all();
  const parByHole = {};
  (eventHoles || []).forEach(h => { parByHole[h.hole_number] = h.par; });

  const betConfig = safeJsonObj(event.bet_config_json, {});
  const multipliers = betConfig.multipliers || {};

  // For shotgun events, derive a single canonical hole order from whichever
  // team has the lowest starting_hole assignment. If no teams have a
  // starting hole set yet, fall back to normal 1-→N order.
  //
  // In a gross-skins scramble every team plays all 18 holes, just in
  // different order. Skins are settled globally across all teams, so
  // we resolve them in the order the field as a whole plays — starting
  // from the lowest assigned hole (hole 1 when a full shotgun is set up,
  // or the lowest assigned hole if assignments are partial).
  let holeOrder = null;
  const isShotgun = event.shotgun_start === 1 || event.shotgun_start === true;
  if (isShotgun) {
    const assignedHoles = teams
      .map(t => t.starting_hole)
      .filter(h => h != null && h >= 1 && h <= 18);
    if (assignedHoles.length > 0) {
      const canonicalStart = Math.min(...assignedHoles);
      holeOrder = getHoleOrder(canonicalStart, event.holes || 18);
    }
  }

  const results = computeGameResults({
    event, teams, scores, manualPoints, presses, wolfPicks, multipliers, yourHoles, parByHole,
    holeOrder,
  });

  return json({ event_type: event.event_type || 'tournament', results, bet_config: betConfig });
}
