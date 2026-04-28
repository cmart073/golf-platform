// POST /api/score/match/:scorerToken/your-hole
// Body: { team_id: string, hole_number: number, player_index: number | null }
// Match-scorer counterpart of /api/score/:accessToken/your-hole — sets
// (or clears) which teammate "owned" a hole for Jeff Martin scoring.

import { isEventTokenExpired } from '../../../../_tokens.js';

function newId(prefix = '') { return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }
function now() { return new Date().toISOString(); }

export async function onRequestPost(context) {
  const db = context.env.DB;
  const scorerToken = context.params.scorerToken;
  const body = await context.request.json();
  const { team_id, hole_number, player_index } = body;

  if (!team_id) return err('team_id required');
  const holeNum = parseInt(hole_number);
  if (!Number.isFinite(holeNum)) return err('hole_number required');

  const event = await db.prepare(
    'SELECT * FROM events WHERE scorer_token = ?',
  ).bind(scorerToken).first();
  if (!event) return err('Invalid scorer token', 404);
  if (event.locked_at || event.status === 'completed') return err('Event is locked', 403);
  if (event.status !== 'live') return err('Event is not live yet', 403);
  if (isEventTokenExpired(event)) return err('Scorer link has expired', 410);
  if (holeNum < 1 || holeNum > event.holes) return err(`Hole must be 1-${event.holes}`);

  const team = await db.prepare(
    'SELECT id, event_id, players_json FROM teams WHERE id = ?',
  ).bind(team_id).first();
  if (!team || team.event_id !== event.id) return err('Team not found in this event', 404);

  const clearing = player_index === null || player_index === undefined || player_index === '';
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
    await db.prepare('DELETE FROM hole_your_holes WHERE team_id = ? AND hole_number = ?')
      .bind(team.id, holeNum).run();
  } else {
    const existing = await db.prepare(
      'SELECT id FROM hole_your_holes WHERE team_id = ? AND hole_number = ?',
    ).bind(team.id, holeNum).first();
    if (existing) {
      await db.prepare('UPDATE hole_your_holes SET player_index = ?, updated_at = ? WHERE id = ?')
        .bind(playerIdx, timestamp, existing.id).run();
    } else {
      await db.prepare(
        'INSERT INTO hole_your_holes (id, team_id, hole_number, player_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).bind(newId('yh_'), team.id, holeNum, playerIdx, timestamp, timestamp).run();
    }
  }

  const { results } = await db.prepare(
    'SELECT hole_number, player_index FROM hole_your_holes WHERE team_id = ?',
  ).bind(team.id).all();
  const your_holes = {};
  (results || []).forEach((r) => { your_holes[r.hole_number] = r.player_index; });

  return json({ success: true, team_id: team.id, your_holes });
}
