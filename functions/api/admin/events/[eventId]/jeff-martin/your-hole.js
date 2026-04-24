// POST /api/admin/events/:eventId/jeff-martin/your-hole
// Body: { team_id: string, hole_number: number, player_index: number | null }
// Admin override — ignores team/event locks.

function newId(prefix = '') { return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }
function now() { return new Date().toISOString(); }

export async function onRequestPost(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;
  const body = await context.request.json();
  const { team_id, hole_number, player_index } = body;

  if (!team_id) return err('team_id required');
  const holeNum = parseInt(hole_number);
  if (!Number.isFinite(holeNum)) return err('hole_number required');

  // Verify team belongs to this event
  const team = await db.prepare(
    'SELECT id, players_json FROM teams WHERE id = ? AND event_id = ?'
  ).bind(team_id, eventId).first();
  if (!team) return err('Team not found for this event', 404);

  let clearing = player_index === null || player_index === undefined || player_index === '';
  let playerIdx = null;
  if (!clearing) {
    playerIdx = parseInt(player_index);
    if (!Number.isFinite(playerIdx) || playerIdx < 0) return err('Invalid player_index');
    let roster = [];
    try { roster = JSON.parse(team.players_json || '[]'); } catch { roster = []; }
    if (playerIdx >= roster.length) return err('player_index out of range for team roster');
  }

  const timestamp = now();

  if (clearing) {
    await db.prepare(
      'DELETE FROM hole_your_holes WHERE team_id = ? AND hole_number = ?'
    ).bind(team.id, holeNum).run();
  } else {
    const existing = await db.prepare(
      'SELECT id FROM hole_your_holes WHERE team_id = ? AND hole_number = ?'
    ).bind(team.id, holeNum).first();
    if (existing) {
      await db.prepare(
        'UPDATE hole_your_holes SET player_index = ?, updated_at = ? WHERE id = ?'
      ).bind(playerIdx, timestamp, existing.id).run();
    } else {
      await db.prepare(
        'INSERT INTO hole_your_holes (id, team_id, hole_number, player_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(newId('yh_'), team.id, holeNum, playerIdx, timestamp, timestamp).run();
    }
  }

  return json({ success: true });
}
