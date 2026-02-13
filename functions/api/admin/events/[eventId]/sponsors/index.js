function newId(prefix = '') { return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }
function now() { return new Date().toISOString(); }

export async function onRequestGet(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;
  const { results } = await db.prepare(
    'SELECT * FROM sponsors WHERE event_id = ? ORDER BY display_order ASC'
  ).bind(eventId).all();
  return json(results);
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;
  const body = await context.request.json();
  const { logo_url, display_order, link_url } = body;

  if (!logo_url) return err('logo_url required');

  const event = await db.prepare('SELECT id FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return err('Event not found', 404);

  const id = newId('sp_');
  await db.prepare(
    'INSERT INTO sponsors (id, event_id, logo_url, display_order, link_url, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, eventId, logo_url, display_order || 0, link_url || null, now()).run();

  return json({ id, logo_url, display_order: display_order || 0, link_url }, 201);
}
