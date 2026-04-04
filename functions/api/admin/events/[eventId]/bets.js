function newId(prefix = '') { return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }
function now() { return new Date().toISOString(); }

// GET — list all presses and bet config for this event
export async function onRequestGet(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;

  const event = await db.prepare('SELECT id, bet_config_json FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return err('Event not found', 404);

  let presses = [];
  try {
    const { results } = await db.prepare(
      "SELECT id, team_id, game_type, hole_number, value, created_at FROM event_bets WHERE event_id = ? AND bet_type = 'press' ORDER BY created_at"
    ).bind(eventId).all();
    presses = results || [];
  } catch { /* table may not exist */ }

  let betConfig = {};
  try { betConfig = JSON.parse(event.bet_config_json || '{}'); } catch {}

  return json({ presses, bet_config: betConfig });
}

// POST — add press, set multiplier, or update bet config
export async function onRequestPost(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;
  const body = await context.request.json();
  const { action } = body;

  const event = await db.prepare('SELECT id, bet_config_json FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return err('Event not found', 404);

  // ── PRESS: Create a new press bet ──
  if (action === 'press') {
    const { team_id, game_type, hole_number } = body;
    if (!team_id || !game_type || !hole_number) return err('team_id, game_type, hole_number required');

    const team = await db.prepare('SELECT id FROM teams WHERE id = ? AND event_id = ?').bind(team_id, eventId).first();
    if (!team) return err('Team not found in event', 404);

    const ts = now();
    await db.prepare(
      `INSERT INTO event_bets (id, event_id, bet_type, game_type, team_id, hole_number, value, created_at, updated_at)
       VALUES (?, ?, 'press', ?, ?, ?, 1, ?, ?)`
    ).bind(newId('bet_'), eventId, game_type, team_id, parseInt(hole_number), ts, ts).run();

    return json({ success: true, action: 'press' });
  }

  // ── MULTIPLIER: Set a point multiplier for a game ──
  if (action === 'set_multiplier') {
    const { game_type, multiplier } = body;
    if (!game_type) return err('game_type required');
    const m = Number(multiplier);
    if (!Number.isFinite(m) || m < 1) return err('multiplier must be >= 1');

    let config = {};
    try { config = JSON.parse(event.bet_config_json || '{}'); } catch {}
    if (!config.multipliers) config.multipliers = {};
    config.multipliers[game_type] = m;

    await db.prepare('UPDATE events SET bet_config_json = ? WHERE id = ?')
      .bind(JSON.stringify(config), eventId).run();

    return json({ success: true, action: 'set_multiplier', bet_config: config });
  }

  // ── BET CONFIG: Update per-unit values (e.g. $2 nassau, $1 skins) ──
  if (action === 'set_values') {
    const { values } = body; // { nassau: 2, skins: 1, wolf: 5, ... }
    if (!values || typeof values !== 'object') return err('values object required');

    let config = {};
    try { config = JSON.parse(event.bet_config_json || '{}'); } catch {}
    config.values = values;

    await db.prepare('UPDATE events SET bet_config_json = ? WHERE id = ?')
      .bind(JSON.stringify(config), eventId).run();

    return json({ success: true, action: 'set_values', bet_config: config });
  }

  // ── DELETE PRESS ──
  if (action === 'delete_press') {
    const { press_id } = body;
    if (!press_id) return err('press_id required');
    await db.prepare('DELETE FROM event_bets WHERE id = ? AND event_id = ?').bind(press_id, eventId).run();
    return json({ success: true, action: 'delete_press' });
  }

  return err('Unknown action. Use: press, set_multiplier, set_values, delete_press');
}
