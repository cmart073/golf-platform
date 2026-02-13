function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }

export async function onRequestGet(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;

  const event = await db.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return err('Event not found', 404);

  const org = await db.prepare('SELECT slug, name FROM organizations WHERE id = ?').bind(event.org_id).first();

  const { results: eventHoles } = await db.prepare(
    'SELECT hole_number, par FROM event_holes WHERE event_id = ? ORDER BY hole_number'
  ).bind(eventId).all();

  const { results: teams } = await db.prepare(
    'SELECT id, team_name, players_json, access_token, starting_hole, created_at FROM teams WHERE event_id = ? ORDER BY created_at'
  ).bind(eventId).all();

  const { results: sponsors } = await db.prepare(
    'SELECT * FROM sponsors WHERE event_id = ? ORDER BY display_order ASC'
  ).bind(eventId).all();

  let allScores = [];
  if (teams.length > 0) {
    const placeholders = teams.map(() => '?').join(',');
    const { results } = await db.prepare(
      `SELECT team_id, hole_number, strokes FROM hole_scores WHERE team_id IN (${placeholders})`
    ).bind(...teams.map(t => t.id)).all();
    allScores = results;
  }

  const teamsWithScores = teams.map(t => ({
    ...t,
    players: t.players_json ? JSON.parse(t.players_json) : [],
    scores: allScores
      .filter(s => s.team_id === t.id)
      .reduce((acc, s) => { acc[s.hole_number] = s.strokes; return acc; }, {}),
  }));

  return json({
    event,
    org: org ? { slug: org.slug, name: org.name } : null,
    holes: eventHoles,
    teams: teamsWithScores,
    sponsors,
  });
}
