function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }

function safeJsonArray(raw, fallback = []) {
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : fallback; }
  catch { return fallback; }
}

export async function onRequestGet(context) {
  const db = context.env.DB;
  const scorerToken = context.params.scorerToken;

  // Look up event by scorer_token
  const event = await db.prepare(
    `SELECT id, name, date, holes, status, locked_at, enabled_games_json, event_type
     FROM events WHERE scorer_token = ?`
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
    },
    holes: eventHoles,
    teams: teams.map(t => ({
      id: t.id,
      team_name: t.team_name,
      players: t.players_json ? JSON.parse(t.players_json) : [],
      handicap_strokes: t.handicap_strokes || 0,
      scores: scoreMaps[t.id],
    })),
    bbb,
  });
}
