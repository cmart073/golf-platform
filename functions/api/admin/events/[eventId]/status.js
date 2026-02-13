function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }
function now() { return new Date().toISOString(); }

export async function onRequestPost(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;
  const body = await context.request.json();
  const { status } = body;

  const valid = ['draft', 'live', 'completed'];
  if (!valid.includes(status)) return err(`status must be one of: ${valid.join(', ')}`);

  const event = await db.prepare('SELECT id FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return err('Event not found', 404);

  const locked_at = status === 'completed' ? now() : null;

  await db.prepare(
    'UPDATE events SET status = ?, locked_at = ? WHERE id = ?'
  ).bind(status, locked_at, eventId).run();

  return json({ success: true, status, locked_at });
}
