// POST /api/score/:accessToken/your-hole
// Body: { hole_number: number, player_index: number | null }
// Sets or clears which teammate "owned" the hole in Jeff Martin.
// player_index = null clears the selection.

function newId(prefix = '') { return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }
function now() { return new Date().toISOString(); }

export async function onRequestPost(context) {
  const db = context.env.DB;
  const accessToken = context.params.accessToken;
  const body = await context.request.json();
  const { hole_number, player_index } = body;

  const holeNum = parseInt(hole_number);
  if (!Number.isFinite(holeNum)) return err('hole_number required');

  const team = await db.prepare(
    'SELECT id, event_id, locked_at, players_json FROM teams WHERE access_token = ?'
  ).bind(accessToken).first();
  if (!team) return err('Invalid access token', 404);
  if (team.locked_at) return err('Your scores have been submitted and are locked', 403);

  const event = await db.prepare(
    'SELECT id, holes, status, locked_at FROM events WHERE id = ?'
  ).bind(team.event_id).first();
  if (!event) return err('Event not found', 404);
  if (event.locked_at || event.status === 'completed') {
    return err('Event is locked', 403);
  }
  if (event.status !== 'live') return err('Event is not live yet', 403);
  if (holeNum < 1 || holeNum > event.holes) return err(`Hole must be between 1 and ${event.holes}`);

  // Validate player_index against team's players_json roster
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

  // Return updated map of hole -> player_index
  const { results } = await db.prepare(
    'SELECT hole_number, player_index FROM hole_your_holes WHERE team_id = ?'
  ).bind(team.id).all();
  const your_holes = {};
  (results || []).forEach(r => { your_holes[r.hole_number] = r.player_index; });

  return json({ success: true, your_holes });
}
