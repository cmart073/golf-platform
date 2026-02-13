function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' },
  });
}
function err(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestGet(context) {
  const db = context.env.DB;
  const { orgSlug, eventSlug } = context.params;

  const org = await db.prepare('SELECT id FROM organizations WHERE slug = ?').bind(orgSlug).first();
  if (!org) return err('Organization not found', 404);

  const event = await db.prepare(
    'SELECT id FROM events WHERE org_id = ? AND slug = ?'
  ).bind(org.id, eventSlug).first();
  if (!event) return err('Event not found', 404);

  const { results: sponsors } = await db.prepare(
    'SELECT id, logo_url, display_order, link_url FROM sponsors WHERE event_id = ? ORDER BY display_order ASC'
  ).bind(event.id).all();

  return json(sponsors);
}
