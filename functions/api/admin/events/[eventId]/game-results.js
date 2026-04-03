import { computeGameResults } from '../../../../_game_scoring.js';

function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }

export async function onRequestGet(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;

  const event = await db.prepare(
    'SELECT id, holes, event_type, enabled_games_json FROM events WHERE id = ?'
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

  const results = computeGameResults({ event, teams, scores, manualPoints });
  return json({ event_type: event.event_type || 'tournament', results });
}
