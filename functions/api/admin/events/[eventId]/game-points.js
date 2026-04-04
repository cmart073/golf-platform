function newId(prefix = '') { return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }
function now() { return new Date().toISOString(); }

const ALLOWED = ['bingo', 'bango', 'bongo', 'nassau_front', 'nassau_back', 'nassau_overall', 'wolf', 'nine_points'];

export async function onRequestPost(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;
  const body = await context.request.json();
  const { team_id, hole_number, game_type, points } = body;

  if (!team_id || !hole_number || !game_type) return err('team_id, hole_number and game_type required');
  if (!ALLOWED.includes(game_type)) return err(`game_type must be one of: ${ALLOWED.join(', ')}`);
  const hole = parseInt(hole_number);
  const pts = Number(points);
  if (!Number.isFinite(hole) || hole < 1 || hole > 18) return err('hole_number must be 1-18');
  if (!Number.isFinite(pts)) return err('points must be a number');

  const event = await db.prepare('SELECT id, holes FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return err('Event not found', 404);
  if (hole > event.holes) return err(`hole_number must be <= ${event.holes}`);

  const team = await db.prepare('SELECT id FROM teams WHERE id = ? AND event_id = ?').bind(team_id, eventId).first();
  if (!team) return err('Team not found in event', 404);

  const existing = await db.prepare(
    'SELECT id FROM game_points WHERE event_id = ? AND team_id = ? AND hole_number = ? AND game_type = ?'
  ).bind(eventId, team_id, hole, game_type).first();

  const ts = now();
  if (existing) {
    await db.prepare(
      'UPDATE game_points SET points = ?, updated_at = ? WHERE id = ?'
    ).bind(pts, ts, existing.id).run();
  } else {
    await db.prepare(
      'INSERT INTO game_points (id, event_id, team_id, hole_number, game_type, points, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(newId('gp_'), eventId, team_id, hole, game_type, pts, ts, ts).run();
  }

  return json({ success: true });
}
