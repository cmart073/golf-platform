// POST /api/score/:accessToken/mulligan
// Body: { player_index: number, hole_number?: number, delta?: 1 | -1 }
// Increments (delta=+1, default) or decrements (delta=-1) the mulligan counter
// for a player on this team. Enforces the Jeff Martin cap: max 2 per player
// per 6-hole block (so over 18 holes: 2 on holes 1-6, 2 on 7-12, 2 on 13-18).

function newId(prefix = '') { return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }
function now() { return new Date().toISOString(); }

// Which 6-hole block a hole belongs to (1-based block: 1, 2, or 3)
function blockOf(hole) {
  if (hole <= 6) return 1;
  if (hole <= 12) return 2;
  return 3;
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  const accessToken = context.params.accessToken;
  const body = await context.request.json();
  const { player_index, hole_number, delta } = body;

  const playerIdx = parseInt(player_index);
  if (!Number.isFinite(playerIdx) || playerIdx < 0) return err('player_index required');

  const d = delta === -1 ? -1 : 1;
  const holeNum = hole_number != null ? parseInt(hole_number) : null;

  const team = await db.prepare(
    'SELECT id, event_id, locked_at, players_json FROM teams WHERE access_token = ?'
  ).bind(accessToken).first();
  if (!team) return err('Invalid access token', 404);
  if (team.locked_at) return err('Your scores have been submitted and are locked', 403);

  const event = await db.prepare(
    'SELECT id, holes, status, locked_at FROM events WHERE id = ?'
  ).bind(team.event_id).first();
  if (!event) return err('Event not found', 404);
  if (event.locked_at || event.status === 'completed') return err('Event is locked', 403);
  if (event.status !== 'live') return err('Event is not live yet', 403);

  // Validate player against roster
  let roster = [];
  try { roster = JSON.parse(team.players_json || '[]'); } catch { roster = []; }
  if (playerIdx >= roster.length) return err('player_index out of range for team roster');

  const timestamp = now();

  // Load existing row
  const existing = await db.prepare(
    'SELECT id, used_count, holes_used_json FROM team_mulligans WHERE team_id = ? AND player_index = ?'
  ).bind(team.id, playerIdx).first();

  let usedCount = existing?.used_count ?? 0;
  let holesUsed = [];
  if (existing?.holes_used_json) {
    try { holesUsed = JSON.parse(existing.holes_used_json); } catch { holesUsed = []; }
  }

  if (d === 1) {
    // Enforce cap per 6-hole block if holeNum is provided
    if (holeNum != null) {
      if (holeNum < 1 || holeNum > event.holes) return err(`Hole must be between 1 and ${event.holes}`);
      const thisBlock = blockOf(holeNum);
      const blockCount = holesUsed.filter(h => blockOf(h) === thisBlock).length;
      if (blockCount >= 2) {
        return err(`Player is already at the limit of 2 mulligans for holes ${thisBlock === 1 ? '1-6' : thisBlock === 2 ? '7-12' : '13-18'}`);
      }
      holesUsed = [...holesUsed, holeNum];
    } else {
      // No hole specified — just cap at 6 overall
      if (usedCount >= 6) return err('Player is already at the season cap of 6 mulligans');
    }
    usedCount += 1;
  } else {
    // decrement: pop the last one (or the hole if specified)
    if (usedCount <= 0) return err('No mulligans to remove');
    usedCount -= 1;
    if (holeNum != null) {
      const idx = holesUsed.lastIndexOf(holeNum);
      if (idx >= 0) holesUsed.splice(idx, 1);
    } else if (holesUsed.length > 0) {
      holesUsed.pop();
    }
  }

  if (existing) {
    await db.prepare(
      'UPDATE team_mulligans SET used_count = ?, holes_used_json = ?, updated_at = ? WHERE id = ?'
    ).bind(usedCount, JSON.stringify(holesUsed), timestamp, existing.id).run();
  } else {
    await db.prepare(
      'INSERT INTO team_mulligans (id, team_id, player_index, used_count, holes_used_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(newId('mul_'), team.id, playerIdx, usedCount, JSON.stringify(holesUsed), timestamp, timestamp).run();
  }

  // Return the full mulligan state for this team
  const { results } = await db.prepare(
    'SELECT player_index, used_count, holes_used_json FROM team_mulligans WHERE team_id = ?'
  ).bind(team.id).all();
  const mulligans = {};
  (results || []).forEach(r => {
    let holes = [];
    try { holes = JSON.parse(r.holes_used_json || '[]'); } catch { holes = []; }
    mulligans[r.player_index] = { used_count: r.used_count, holes_used: holes };
  });

  return json({ success: true, mulligans });
}
