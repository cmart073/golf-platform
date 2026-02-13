function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }

export async function onRequestPost(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;
  const body = await context.request.json();
  const { visible } = body;

  if (typeof visible !== 'boolean') return err('visible (boolean) required');

  const event = await db.prepare('SELECT id FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return err('Event not found', 404);

  await db.prepare(
    'UPDATE events SET leaderboard_visible = ? WHERE id = ?'
  ).bind(visible ? 1 : 0, eventId).run();

  return json({ success: true, leaderboard_visible: visible });
}
