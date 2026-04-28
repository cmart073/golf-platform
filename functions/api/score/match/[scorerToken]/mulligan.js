// POST /api/score/match/:scorerToken/mulligan
// Body: { team_id, player_index, hole_number?, delta?: 1 | -1 }
// Match-scorer counterpart of /api/score/:accessToken/mulligan. Same
// per-block cap rules; just keyed by team_id from the body so a single
// scorer can manage every team's mulligans.

import { isEventTokenExpired } from '../../../../_tokens.js';

function newId(prefix = '') { return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }
function now() { return new Date().toISOString(); }

function blockOf(hole) {
  if (hole <= 6) return 1;
  if (hole <= 12) return 2;
  return 3;
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  const scorerToken = context.params.scorerToken;
  const body = await context.request.json();
  const { team_id, player_index, hole_number, delta } = body;

  if (!team_id) return err('team_id required');
  const playerIdx = parseInt(player_index);
  if (!Number.isFinite(playerIdx) || playerIdx < 0) return err('player_index required');

  const d = delta === -1 ? -1 : 1;
  const holeNum = hole_number != null ? parseInt(hole_number) : null;

  const event = await db.prepare(
    'SELECT * FROM events WHERE scorer_token = ?',
  ).bind(scorerToken).first();
  if (!event) return err('Invalid scorer token', 404);
  if (event.locked_at || event.status === 'completed') return err('Event is locked', 403);
  if (event.status !== 'live') return err('Event is not live yet', 403);
  if (isEventTokenExpired(event)) return err('Scorer link has expired', 410);

  const team = await db.prepare(
    'SELECT id, event_id, players_json FROM teams WHERE id = ?',
  ).bind(team_id).first();
  if (!team || team.event_id !== event.id) return err('Team not found in this event', 404);

  let roster = [];
  try { roster = JSON.parse(team.players_json || '[]'); } catch { roster = []; }
  if (playerIdx >= roster.length) return err('player_index out of range for team roster');

  const timestamp = now();

  const existing = await db.prepare(
    'SELECT id, used_count, holes_used_json FROM team_mulligans WHERE team_id = ? AND player_index = ?',
  ).bind(team.id, playerIdx).first();

  let usedCount = existing?.used_count ?? 0;
  let holesUsed = [];
  if (existing?.holes_used_json) {
    try { holesUsed = JSON.parse(existing.holes_used_json); } catch { holesUsed = []; }
  }

  if (d === 1) {
    if (holeNum != null) {
      if (holeNum < 1 || holeNum > event.holes) return err(`Hole must be 1-${event.holes}`);
      const thisBlock = blockOf(holeNum);
      const blockCount = holesUsed.filter((h) => blockOf(h) === thisBlock).length;
      if (blockCount >= 2) {
        return err(`Player is already at the limit of 2 mulligans for holes ${thisBlock === 1 ? '1-6' : thisBlock === 2 ? '7-12' : '13-18'}`);
      }
      holesUsed = [...holesUsed, holeNum];
    } else {
      if (usedCount >= 6) return err('Player is already at the season cap of 6 mulligans');
    }
    usedCount += 1;
  } else {
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
      'UPDATE team_mulligans SET used_count = ?, holes_used_json = ?, updated_at = ? WHERE id = ?',
    ).bind(usedCount, JSON.stringify(holesUsed), timestamp, existing.id).run();
  } else {
    await db.prepare(
      'INSERT INTO team_mulligans (id, team_id, player_index, used_count, holes_used_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(newId('mul_'), team.id, playerIdx, usedCount, JSON.stringify(holesUsed), timestamp, timestamp).run();
  }

  const { results } = await db.prepare(
    'SELECT player_index, used_count, holes_used_json FROM team_mulligans WHERE team_id = ?',
  ).bind(team.id).all();
  const mulligans = {};
  (results || []).forEach((r) => {
    let holes = [];
    try { holes = JSON.parse(r.holes_used_json || '[]'); } catch { holes = []; }
    mulligans[r.player_index] = { used_count: r.used_count, holes_used: holes };
  });

  return json({ success: true, team_id: team.id, mulligans });
}
