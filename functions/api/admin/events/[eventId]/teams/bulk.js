function newId(prefix = '') { return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
function newToken(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join('');
}
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }
function now() { return new Date().toISOString(); }

// CSV format (per line):
//   Team Name, Player1, Player2, Player3, Player4[, StartingHole]
//
// The starting hole is detected by checking whether the LAST field is a
// plain integer in the range 1–18. If so, it is treated as the starting
// hole and not added to the players list. This means a player named "7"
// would be misread — unlikely in practice, and an edge case admins can
// fix manually after import.
function parseRow(line) {
  const parts = line.split(',').map(p => p.trim()).filter(p => p.length > 0);
  if (parts.length === 0) return null;

  const team_name = parts[0];
  let playerParts = parts.slice(1);
  let starting_hole = null;

  // Detect trailing integer in range 1–18 as starting hole
  if (playerParts.length > 0) {
    const last = playerParts[playerParts.length - 1];
    const n = parseInt(last);
    if (!isNaN(n) && n >= 1 && n <= 18 && String(n) === last) {
      starting_hole = n;
      playerParts = playerParts.slice(0, -1);
    }
  }

  return { team_name, players: playerParts, starting_hole };
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;
  const body = await context.request.json();
  const { rows } = body;

  if (!rows || typeof rows !== 'string') return err('rows string required');

  const event = await db.prepare('SELECT id FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return err('Event not found', 404);

  const lines = rows.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return err('No valid rows found');

  const timestamp = now();
  const created = [];
  const stmts = [];

  for (const line of lines) {
    const parsed = parseRow(line);
    if (!parsed) continue;

    const { team_name, players, starting_hole } = parsed;
    const handicap = 0;
    const id = newId('tm_');
    const access_token = newToken(32);
    const players_json = players.length > 0 ? JSON.stringify(players) : null;

    stmts.push(
      db.prepare(
        'INSERT INTO teams (id, event_id, team_name, players_json, access_token, handicap_strokes, starting_hole, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(id, eventId, team_name, players_json, access_token, handicap, starting_hole, timestamp)
    );

    created.push({ id, team_name, players, access_token, handicap_strokes: handicap, starting_hole });
  }

  if (stmts.length > 0) {
    await db.batch(stmts);
  }

  return json({ created, count: created.length }, 201);
}
