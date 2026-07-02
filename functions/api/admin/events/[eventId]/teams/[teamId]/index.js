// PATCH /api/admin/events/:eventId/teams/:teamId
// Updates team_name and/or players_json on a team.
// Body: { team_name?: string, players?: string[] }

function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }

export async function onRequestPatch(context) {
  const db = context.env.DB;
  const { eventId, teamId } = context.params;
  const body = await context.request.json().catch(() => ({}));

  const team = await db.prepare(
    'SELECT id, team_name, players_json FROM teams WHERE id = ? AND event_id = ?'
  ).bind(teamId, eventId).first();
  if (!team) return err('Team not found', 404);

  const teamName = body.team_name != null ? String(body.team_name).trim() : null;
  if (teamName !== null && teamName.length === 0) return err('team_name cannot be empty');

  const players = body.players != null
    ? (Array.isArray(body.players) ? body.players : []).map(p => String(p).trim()).filter(Boolean)
    : null;

  const newName = teamName ?? team.team_name;
  const newPlayers = players !== null ? JSON.stringify(players) : team.players_json;

  await db.prepare(
    'UPDATE teams SET team_name = ?, players_json = ? WHERE id = ?'
  ).bind(newName, newPlayers, teamId).run();

  return json({
    success: true,
    team_id: teamId,
    team_name: newName,
    players: newPlayers ? JSON.parse(newPlayers) : [],
  });
}
