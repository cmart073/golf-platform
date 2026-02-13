function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }
function now() { return new Date().toISOString(); }

export async function onRequestPost(context) {
  const db = context.env.DB;
  const accessToken = context.params.accessToken;

  const team = await db.prepare(
    'SELECT id, event_id, locked_at FROM teams WHERE access_token = ?'
  ).bind(accessToken).first();
  if (!team) return err('Invalid access token', 404);

  if (team.locked_at) {
    return err('Scores already submitted', 400);
  }

  const event = await db.prepare(
    'SELECT id, holes, status FROM events WHERE id = ?'
  ).bind(team.event_id).first();
  if (!event) return err('Event not found', 404);

  // Verify all holes are entered
  const { results: scores } = await db.prepare(
    'SELECT hole_number FROM hole_scores WHERE team_id = ?'
  ).bind(team.id).all();

  if (scores.length < event.holes) {
    return err(`Only ${scores.length} of ${event.holes} holes entered. Complete all holes before submitting.`, 400);
  }

  // Lock the team
  const timestamp = now();
  await db.prepare(
    'UPDATE teams SET locked_at = ? WHERE id = ?'
  ).bind(timestamp, team.id).run();

  return json({ success: true, locked_at: timestamp });
}
