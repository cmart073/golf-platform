function newId(prefix = '') { return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }
function now() { return new Date().toISOString(); }

export async function onRequestPost(context) {
  const db = context.env.DB;
  const scorerToken = context.params.scorerToken;
  const body = await context.request.json();
  const { team_id, game_type, hole_number } = body;

  if (!team_id || !game_type || !hole_number) return err('team_id, game_type, hole_number required');

  const event = await db.prepare(
    'SELECT id, holes, status, locked_at FROM events WHERE scorer_token = ?'
  ).bind(scorerToken).first();
  if (!event) return err('Invalid scorer token', 404);
  if (event.locked_at || event.status === 'completed') return err('Event is locked', 403);
  if (event.status !== 'live') return err('Event is not live yet', 403);

  const team = await db.prepare('SELECT id FROM teams WHERE id = ? AND event_id = ?').bind(team_id, event.id).first();
  if (!team) return err('Team not found in event', 404);

  const ts = now();
  await db.prepare(
    `INSERT INTO event_bets (id, event_id, bet_type, game_type, team_id, hole_number, value, created_at, updated_at)
     VALUES (?, ?, 'press', ?, ?, ?, 1, ?, ?)`
  ).bind(newId('bet_'), event.id, game_type, team_id, parseInt(hole_number), ts, ts).run();

  return json({ success: true, action: 'press', game_type, hole_number: parseInt(hole_number) });
}
