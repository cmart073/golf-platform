// DELETE /api/admin/events/:eventId/teams/:teamId
// Removes a team and all associated scores, game points, and mulligan data.

function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }

export async function onRequestDelete(context) {
  const db = context.env.DB;
  const { eventId, teamId } = context.params;

  const team = await db.prepare(
    'SELECT id, team_name FROM teams WHERE id = ? AND event_id = ?'
  ).bind(teamId, eventId).first();
  if (!team) return err('Team not found', 404);

  // Delete all associated data then the team itself
  await db.batch([
    db.prepare('DELETE FROM hole_scores WHERE team_id = ?').bind(teamId),
    db.prepare('DELETE FROM game_points WHERE team_id = ? AND event_id = ?').bind(teamId, eventId),
    db.prepare('DELETE FROM hole_your_holes WHERE team_id = ?').bind(teamId),
    db.prepare('DELETE FROM team_mulligans WHERE team_id = ?').bind(teamId),
    db.prepare('DELETE FROM teams WHERE id = ?').bind(teamId),
  ]);

  return json({ success: true, deleted_team: team.team_name });
}
