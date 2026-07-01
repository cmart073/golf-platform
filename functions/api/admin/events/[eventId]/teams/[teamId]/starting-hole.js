// PATCH /api/admin/events/:eventId/teams/:teamId/starting-hole
// Sets or clears a team's starting hole for shotgun-start events.
// Body: { starting_hole: 7 }  — integer 1–18, or null to clear.

function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }

export async function onRequestPatch(context) {
  const db = context.env.DB;
  const { eventId, teamId } = context.params;
  const body = await context.request.json().catch(() => ({}));

  const team = await db.prepare(
    'SELECT id, team_name FROM teams WHERE id = ? AND event_id = ?'
  ).bind(teamId, eventId).first();
  if (!team) return err('Team not found', 404);

  const { starting_hole } = body;

  let hole = null;
  if (starting_hole != null) {
    const n = parseInt(starting_hole);
    if (isNaN(n) || n < 1 || n > 18) return err('starting_hole must be 1–18');
    hole = n;
  }

  await db.prepare(
    'UPDATE teams SET starting_hole = ? WHERE id = ?'
  ).bind(hole, teamId).run();

  return json({ success: true, team_id: teamId, starting_hole: hole });
}
