// POST /api/admin/events/:eventId/jeff-martin/mulligan
// Body: { team_id, player_index, used_count?, holes_used? }
// Admin god-mode: directly set the mulligan state for a player.
// Ignores the per-block cap; admin is trusted.

function newId(prefix = '') { return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }
function now() { return new Date().toISOString(); }

export async function onRequestPost(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;
  const body = await context.request.json();
  const { team_id, player_index, used_count, holes_used } = body;

  if (!team_id) return err('team_id required');
  const playerIdx = parseInt(player_index);
  if (!Number.isFinite(playerIdx) || playerIdx < 0) return err('player_index required');

  // Verify team belongs to this event
  const team = await db.prepare(
    'SELECT id, players_json FROM teams WHERE id = ? AND event_id = ?'
  ).bind(team_id, eventId).first();
  if (!team) return err('Team not found for this event', 404);

  let roster = [];
  try { roster = JSON.parse(team.players_json || '[]'); } catch { roster = []; }
  if (playerIdx >= roster.length) return err('player_index out of range for team roster');

  const count = Math.max(0, parseInt(used_count ?? 0));
  const holes = Array.isArray(holes_used) ? holes_used.filter(h => Number.isFinite(parseInt(h))).map(h => parseInt(h)) : [];
  const timestamp = now();

  const existing = await db.prepare(
    'SELECT id FROM team_mulligans WHERE team_id = ? AND player_index = ?'
  ).bind(team.id, playerIdx).first();

  if (existing) {
    await db.prepare(
      'UPDATE team_mulligans SET used_count = ?, holes_used_json = ?, updated_at = ? WHERE id = ?'
    ).bind(count, JSON.stringify(holes), timestamp, existing.id).run();
  } else {
    await db.prepare(
      'INSERT INTO team_mulligans (id, team_id, player_index, used_count, holes_used_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(newId('mul_'), team.id, playerIdx, count, JSON.stringify(holes), timestamp, timestamp).run();
  }

  return json({ success: true, used_count: count, holes_used: holes });
}
