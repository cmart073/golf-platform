function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }

export async function onRequestPost(context) {
  const db = context.env.DB;
  const { eventId, teamId } = context.params;
  const body = await context.request.json();
  const handicap = parseInt(body.handicap_strokes);
  if (!Number.isFinite(handicap)) return err('handicap_strokes must be a number');
  if (handicap < -36 || handicap > 72) return err('handicap_strokes out of allowed range (-36 to 72)');

  const team = await db.prepare('SELECT id FROM teams WHERE id = ? AND event_id = ?').bind(teamId, eventId).first();
  if (!team) return err('Team not found in this event', 404);

  await db.prepare(
    'UPDATE teams SET handicap_strokes = ? WHERE id = ?'
  ).bind(handicap, teamId).run();

  return json({ success: true, handicap_strokes: handicap });
}
