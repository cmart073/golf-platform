import { json, err, newId, newToken, now } from '../../../../../_shared.js';

export async function onRequestPost(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;
  const body = await context.request.json();
  const { rows } = body;

  if (!rows || typeof rows !== 'string') return err('rows string required');

  // Verify event exists
  const event = await db.prepare('SELECT id FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return err('Event not found', 404);

  const lines = rows.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return err('No valid rows found');

  const timestamp = now();
  const created = [];
  const stmts = [];

  for (const line of lines) {
    const parts = line.split(',').map(p => p.trim()).filter(p => p.length > 0);
    if (parts.length === 0) continue;

    const team_name = parts[0];
    const players = parts.slice(1);
    const id = newId('tm_');
    const access_token = newToken(32);
    const players_json = players.length > 0 ? JSON.stringify(players) : null;

    stmts.push(
      db.prepare(
        'INSERT INTO teams (id, event_id, team_name, players_json, access_token, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(id, eventId, team_name, players_json, access_token, timestamp)
    );

    created.push({ id, team_name, players, access_token });
  }

  if (stmts.length > 0) {
    await db.batch(stmts);
  }

  return json({ created, count: created.length }, 201);
}
