function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }

export async function onRequestDelete(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;

  const event = await db.prepare('SELECT id, name FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return err('Event not found', 404);

  // Get all team IDs for this event so we can cascade delete their scores
  const { results: teams } = await db.prepare('SELECT id FROM teams WHERE event_id = ?').bind(eventId).all();
  const teamIds = teams.map(t => t.id);

  const stmts = [];

  // Delete hole_scores for all teams
  if (teamIds.length > 0) {
    const ph = teamIds.map(() => '?').join(',');
    stmts.push(db.prepare(`DELETE FROM hole_scores WHERE team_id IN (${ph})`).bind(...teamIds));
  }

  // Delete game_points, sponsors, event_holes, teams, then the event itself
  stmts.push(db.prepare('DELETE FROM game_points WHERE event_id = ?').bind(eventId));
  stmts.push(db.prepare('DELETE FROM sponsors WHERE event_id = ?').bind(eventId));
  stmts.push(db.prepare('DELETE FROM event_holes WHERE event_id = ?').bind(eventId));
  stmts.push(db.prepare('DELETE FROM teams WHERE event_id = ?').bind(eventId));
  stmts.push(db.prepare('DELETE FROM events WHERE id = ?').bind(eventId));

  await db.batch(stmts);

  return json({ success: true, deleted: event.name });
}

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
    'SELECT id, team_name, players_json, access_token, starting_hole, handicap_strokes, locked_at, created_at FROM teams WHERE event_id = ? ORDER BY created_at'
  ).bind(eventId).all();

  const { results: sponsors } = await db.prepare(
    'SELECT * FROM sponsors WHERE event_id = ? ORDER BY display_order ASC'
  ).bind(eventId).all();

  let allScores = [];
  let allYourHoles = [];
  if (teams.length > 0) {
    const placeholders = teams.map(() => '?').join(',');
    const { results } = await db.prepare(
      `SELECT team_id, hole_number, strokes, updated_at, updated_by FROM hole_scores WHERE team_id IN (${placeholders}) ORDER BY hole_number`
    ).bind(...teams.map(t => t.id)).all();
    allScores = results;

    // Jeff Martin your-hole selections (table may not exist on older DBs)
    try {
      const { results: yh } = await db.prepare(
        `SELECT team_id, hole_number, player_index FROM hole_your_holes WHERE team_id IN (${placeholders})`
      ).bind(...teams.map(t => t.id)).all();
      allYourHoles = yh || [];
    } catch { /* table missing */ }
  }

  const teamsWithScores = teams.map(t => ({
    ...t,
    players: t.players_json ? JSON.parse(t.players_json) : [],
    scores: allScores
      .filter(s => s.team_id === t.id)
      .reduce((acc, s) => {
        acc[s.hole_number] = { strokes: s.strokes, updated_at: s.updated_at, updated_by: s.updated_by };
        return acc;
      }, {}),
    your_holes: allYourHoles
      .filter(y => y.team_id === t.id)
      .reduce((acc, y) => { acc[y.hole_number] = y.player_index; return acc; }, {}),
  }));

  const { results: gamePoints } = await db.prepare(
    'SELECT team_id, hole_number, game_type, points FROM game_points WHERE event_id = ? ORDER BY hole_number'
  ).bind(eventId).all();

  return json({
    event,
    org: org ? { slug: org.slug, name: org.name } : null,
    holes: eventHoles,
    teams: teamsWithScores,
    sponsors,
    game_points: gamePoints,
  });
}
