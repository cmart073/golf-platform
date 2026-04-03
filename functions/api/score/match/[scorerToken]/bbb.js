function newId(prefix = '') { return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }
function now() { return new Date().toISOString(); }

export async function onRequestPost(context) {
  const db = context.env.DB;
  const scorerToken = context.params.scorerToken;
  const body = await context.request.json();
  const { hole_number, bingo, bango, bongo } = body;

  if (!hole_number) return err('hole_number required');
  const holeNum = parseInt(hole_number);
  if (isNaN(holeNum)) return err('Invalid hole number');

  // Validate event via scorer_token
  const event = await db.prepare(
    'SELECT id, holes, status, locked_at, enabled_games_json FROM events WHERE scorer_token = ?'
  ).bind(scorerToken).first();

  if (!event) return err('Invalid scorer token', 404);
  if (event.locked_at || event.status === 'completed') {
    return err('Event is locked — scores cannot be changed', 403);
  }
  if (event.status !== 'live') {
    return err('Event is not live yet', 403);
  }
  if (holeNum < 1 || holeNum > event.holes) {
    return err(`Hole must be between 1 and ${event.holes}`);
  }

  // Verify BBB is enabled
  let enabledGames = ['stroke_play'];
  try { enabledGames = JSON.parse(event.enabled_games_json); } catch {}
  const hasBBB = enabledGames.includes('bingo') && enabledGames.includes('bango') && enabledGames.includes('bongo');
  if (!hasBBB) return err('Bingo Bango Bongo is not enabled for this event');

  // Get valid team IDs
  const { results: teams } = await db.prepare(
    'SELECT id FROM teams WHERE event_id = ?'
  ).bind(event.id).all();
  const validTeamIds = new Set(teams.map(t => t.id));

  const timestamp = now();
  const stmts = [];

  // For each game type (bingo, bango, bongo), upsert the game_point record.
  // The match scorer assigns exactly 1 point to the winning team per hole per game type.
  // If teamId is null, we clear the assignment (set points to 0 for all teams on that hole+game).
  for (const [gameType, teamId] of [['bingo', bingo], ['bango', bango], ['bongo', bongo]]) {
    // First, clear all existing points for this hole+game_type by setting them to 0
    // (We delete them to keep the table clean)
    await db.prepare(
      'DELETE FROM game_points WHERE event_id = ? AND hole_number = ? AND game_type = ?'
    ).bind(event.id, holeNum, gameType).run();

    // If a team is assigned, insert a new point record
    if (teamId && validTeamIds.has(teamId)) {
      stmts.push(
        db.prepare(
          `INSERT INTO game_points (id, event_id, team_id, hole_number, game_type, points, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
        ).bind(newId('gp_'), event.id, teamId, holeNum, gameType, timestamp, timestamp)
      );
    }
  }

  if (stmts.length > 0) {
    await db.batch(stmts);
  }

  return json({ success: true, hole_number: holeNum });
}
