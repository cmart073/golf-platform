function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }

export async function onRequestPost(context) {
  const db = context.env.DB;
  const { eventId, teamId } = context.params;

  const team = await db.prepare(
    'SELECT id FROM teams WHERE id = ? AND event_id = ?'
  ).bind(teamId, eventId).first();
  if (!team) return err('Team not found in this event', 404);

  await db.prepare(
    'UPDATE teams SET locked_at = NULL WHERE id = ?'
  ).bind(teamId).run();

  return json({ success: true, unlocked: teamId });
}
