import { isEventTokenExpired, tokenStateSnapshot } from '../../../_tokens.js';

function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }

export async function onRequestGet(context) {
  const db = context.env.DB;
  const accessToken = context.params.accessToken;

  const team = await db.prepare(
    'SELECT id, event_id, team_name, players_json, access_token, locked_at FROM teams WHERE access_token = ?'
  ).bind(accessToken).first();

  if (!team) return err('Invalid access token', 404);

  const event = await db.prepare(
    'SELECT * FROM events WHERE id = ?'
  ).bind(team.event_id).first();
  // SELECT * picks up scoring_mode/token_* whenever migration 0009 is in place.

  if (!event) return err('Event not found', 404);

  const { results: eventHoles } = await db.prepare(
    'SELECT hole_number, par FROM event_holes WHERE event_id = ? ORDER BY hole_number'
  ).bind(event.id).all();

  const { results: scores } = await db.prepare(
    'SELECT hole_number, strokes, updated_at FROM hole_scores WHERE team_id = ? ORDER BY hole_number'
  ).bind(team.id).all();

  const scoresMap = {};
  scores.forEach(s => {
    scoresMap[s.hole_number] = { strokes: s.strokes, updated_at: s.updated_at };
  });

  // Parse enabled games so the client knows whether to show Jeff Martin UI
  let enabledGames = ['stroke_play'];
  try {
    const parsed = JSON.parse(event.enabled_games_json || '["stroke_play"]');
    if (Array.isArray(parsed)) enabledGames = parsed;
  } catch { /* leave default */ }

  // Load Jeff Martin state if enabled (table might not exist on older DBs)
  const yourHoles = {};
  const mulligans = {};
  if (enabledGames.includes('jeff_martin')) {
    try {
      const { results: yh } = await db.prepare(
        'SELECT hole_number, player_index FROM hole_your_holes WHERE team_id = ?'
      ).bind(team.id).all();
      (yh || []).forEach(r => { yourHoles[r.hole_number] = r.player_index; });
    } catch { /* table missing */ }

    try {
      const { results: muls } = await db.prepare(
        'SELECT player_index, used_count, holes_used_json FROM team_mulligans WHERE team_id = ?'
      ).bind(team.id).all();
      (muls || []).forEach(r => {
        let holes = [];
        try { holes = JSON.parse(r.holes_used_json || '[]'); } catch { holes = []; }
        mulligans[r.player_index] = { used_count: r.used_count, holes_used: holes };
      });
    } catch { /* table missing */ }
  }

  return json({
    team: {
      id: team.id,
      team_name: team.team_name,
      players: team.players_json ? JSON.parse(team.players_json) : [],
      locked_at: team.locked_at,
    },
    event: {
      id: event.id,
      name: event.name,
      holes: event.holes,
      status: event.status,
      locked_at: event.locked_at,
      date: event.date,
      event_type: event.event_type,
      enabled_games: enabledGames,
      jm_show_mulligans: event.jm_show_mulligans == null ? true : event.jm_show_mulligans !== 0,
      scoring_mode: event.scoring_mode
        || (event.event_type === 'weekly_match' ? 'single' : 'distributed'),
      ...tokenStateSnapshot(event),
    },
    token_expired: isEventTokenExpired(event),
    pars: eventHoles.reduce((acc, h) => { acc[h.hole_number] = h.par; return acc; }, {}),
    scores: scoresMap,
    your_holes: yourHoles,
    mulligans,
  });
}
