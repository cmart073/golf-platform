function newId(prefix = '') { return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
function newToken(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join('');
}
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }
function now() { return new Date().toISOString(); }

export async function onRequestGet(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;
  const { results } = await db.prepare(
    'SELECT * FROM teams WHERE event_id = ? ORDER BY created_at'
  ).bind(eventId).all();
  return json(results);
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;
  const body = await context.request.json();
  const { team_name, players } = body;

  if (!team_name) return err('team_name required');

  const event = await db.prepare('SELECT id FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return err('Event not found', 404);

  const id = newId('tm_');
  const access_token = newToken(32);
  const players_json = players && players.length > 0 ? JSON.stringify(players) : null;

  await db.prepare(
    'INSERT INTO teams (id, event_id, team_name, players_json, access_token, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, eventId, team_name, players_json, access_token, now()).run();

  return json({ id, team_name, players, access_token }, 201);
}
