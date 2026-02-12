import { json, err } from '../../../../_shared.js';

export async function onRequestGet(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;

  const event = await db.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return err('Event not found', 404);

  const { results: eventHoles } = await db.prepare(
    'SELECT hole_number, par FROM event_holes WHERE event_id = ? ORDER BY hole_number'
  ).bind(eventId).all();

  const { results: teams } = await db.prepare(
    'SELECT id, team_name, players_json, access_token, starting_hole, created_at FROM teams WHERE event_id = ? ORDER BY created_at'
  ).bind(eventId).all();

  // Get scores for all teams
  const teamIds = teams.map(t => t.id);
  let allScores = [];
  if (teamIds.length > 0) {
    const placeholders = teamIds.map(() => '?').join(',');
    const { results } = await db.prepare(
      `SELECT team_id, hole_number, strokes FROM hole_scores WHERE team_id IN (${placeholders})`
    ).bind(...teamIds).all();
    allScores = results;
  }

  // Attach scores to teams
  const teamsWithScores = teams.map(t => ({
    ...t,
    players: t.players_json ? JSON.parse(t.players_json) : [],
    scores: allScores
      .filter(s => s.team_id === t.id)
      .reduce((acc, s) => { acc[s.hole_number] = s.strokes; return acc; }, {}),
  }));

  return json({
    event,
    holes: eventHoles,
    teams: teamsWithScores,
  });
}
