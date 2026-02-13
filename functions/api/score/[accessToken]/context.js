function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }

export async function onRequestGet(context) {
  const db = context.env.DB;
  const accessToken = context.params.accessToken;

  const team = await db.prepare(
    'SELECT id, event_id, team_name, players_json, access_token, locked_at FROM teams WHERE access_token = ?'
  ).bind(accessToken).first();

  if (!team) return err('Invalid access token', 404);

  const event = await db.prepare(
    'SELECT id, name, holes, status, locked_at, date FROM events WHERE id = ?'
  ).bind(team.event_id).first();

  if (!event) return err('Event not found', 404);

  const { results: eventHoles } = await db.prepare(
    'SELECT hole_number, par FROM event_holes WHERE event_id = ? ORDER BY hole_number'
  ).bind(event.id).all();

  const { results: scores } = await db.prepare(
    'SELECT hole_number, strokes, updated_at FROM hole_scores WHERE team_id = ? ORDER BY hole_number'
  ).bind(team.id).all();

  const scoresMap = {};
  scores.forEach(s => {
    scoresMap[s.hole_number] = { strokes: s.strokes, updated_at: s.updated_at };
  });

  return json({
    team: {
      id: team.id,
      team_name: team.team_name,
      players: team.players_json ? JSON.parse(team.players_json) : [],
      locked_at: team.locked_at,
    },
    event: {
      id: event.id,
      name: event.name,
      holes: event.holes,
      status: event.status,
      locked_at: event.locked_at,
      date: event.date,
    },
    pars: eventHoles.reduce((acc, h) => { acc[h.hole_number] = h.par; return acc; }, {}),
    scores: scoresMap,
  });
}
