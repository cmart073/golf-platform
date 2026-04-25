function newToken(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join('');
}
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }

const VALID_GAMES = ['stroke_play', 'match_play', 'skins', 'bingo', 'bango', 'bongo', 'nassau', 'wolf', 'nine_points', 'jeff_martin'];
function normalizeGames(inputGames) {
  const raw = Array.isArray(inputGames) ? inputGames.filter((g) => VALID_GAMES.includes(g)) : ['stroke_play'];
  if (raw.includes('stroke_play') && raw.includes('match_play')) {
    return { error: 'Choose either stroke_play or match_play, not both' };
  }
  const hasAnyBbb = raw.includes('bingo') || raw.includes('bango') || raw.includes('bongo');
  if (hasAnyBbb) raw.push('bingo', 'bango', 'bongo');
  const deduped = Array.from(new Set(raw));
  return { games: deduped.length > 0 ? deduped : ['stroke_play'] };
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;
  const body = await context.request.json();
  const { event_type, enabled_games, jm_show_mulligans } = body;

  const safeType = event_type === 'weekly_match' ? 'weekly_match' : 'tournament';
  const normalized = normalizeGames(enabled_games);
  if (normalized.error) return err(normalized.error);

  const event = await db.prepare('SELECT id, scorer_token FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return err('Event not found', 404);

  const enabledGamesJson = JSON.stringify(normalized.games);

  // Generate scorer_token if switching to weekly_match and one doesn't exist yet
  let scorerToken = event.scorer_token;
  if (safeType === 'weekly_match' && !scorerToken) {
    scorerToken = newToken(32);
  }
  // Clear scorer_token if switching back to tournament
  if (safeType === 'tournament') {
    scorerToken = null;
  }

  // Coerce jm_show_mulligans to 0/1; default 1 (visible) when undefined
  const showMulligans = jm_show_mulligans === false || jm_show_mulligans === 0 ? 0 : 1;

  await db.prepare(
    'UPDATE events SET event_type = ?, enabled_games_json = ?, scorer_token = ?, jm_show_mulligans = ? WHERE id = ?'
  ).bind(safeType, enabledGamesJson, scorerToken, showMulligans, eventId).run();

  return json({
    success: true,
    event_type: safeType,
    enabled_games: JSON.parse(enabledGamesJson),
    scorer_token: scorerToken,
    jm_show_mulligans: !!showMulligans,
  });
}
