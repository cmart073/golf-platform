function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }

const VALID_GAMES = ['stroke_play', 'match_play', 'skins', 'bingo', 'bango', 'bongo'];

export async function onRequestPost(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;
  const body = await context.request.json();
  const { event_type, enabled_games } = body;

  const safeType = event_type === 'weekly_match' ? 'weekly_match' : 'tournament';
  const games = Array.isArray(enabled_games)
    ? enabled_games.filter((g) => VALID_GAMES.includes(g))
    : ['stroke_play'];

  const event = await db.prepare('SELECT id FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return err('Event not found', 404);

  const enabledGamesJson = JSON.stringify(games.length > 0 ? games : ['stroke_play']);
  await db.prepare(
    'UPDATE events SET event_type = ?, enabled_games_json = ? WHERE id = ?'
  ).bind(safeType, enabledGamesJson, eventId).run();

  return json({ success: true, event_type: safeType, enabled_games: JSON.parse(enabledGamesJson) });
}
