function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }

export async function onRequestDelete(context) {
  const db = context.env.DB;
  const { eventId, sponsorId } = context.params;

  const sponsor = await db.prepare(
    'SELECT id FROM sponsors WHERE id = ? AND event_id = ?'
  ).bind(sponsorId, eventId).first();
  if (!sponsor) return err('Sponsor not found', 404);

  await db.prepare('DELETE FROM sponsors WHERE id = ?').bind(sponsorId).run();
  return json({ success: true, deleted: sponsorId });
}
