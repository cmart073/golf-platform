// PATCH /api/admin/events/:eventId/holes/:holeNumber/tee
// Sets or clears the tee assignment for a single hole.
// Body: { tee: "red" | "white" | "blue" | null }

function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }

export async function onRequestPatch(context) {
  const db = context.env.DB;
  const { eventId, holeNumber } = context.params;
  const body = await context.request.json().catch(() => ({}));

  const hole = parseInt(holeNumber);
  if (isNaN(hole) || hole < 1 || hole > 18) return err('Invalid hole number');

  const { tee } = body;
  if (tee !== null && tee !== undefined && !['red', 'white', 'blue'].includes(tee)) {
    return err('tee must be red, white, blue, or null');
  }

  const eventHole = await db.prepare(
    'SELECT id FROM event_holes WHERE event_id = ? AND hole_number = ?'
  ).bind(eventId, hole).first();
  if (!eventHole) return err('Hole not found for this event', 404);

  await db.prepare(
    'UPDATE event_holes SET tee = ? WHERE event_id = ? AND hole_number = ?'
  ).bind(tee || null, eventId, hole).run();

  return json({ success: true, hole_number: hole, tee: tee || null });
}
