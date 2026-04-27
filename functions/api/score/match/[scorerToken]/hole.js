import { logScoreChange } from '../../../../_audit.js';
import { isEventTokenExpired } from '../../../../_tokens.js';

function newId(prefix = '') { return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }
function now() { return new Date().toISOString(); }

export async function onRequestPost(context) {
  const db = context.env.DB;
  const scorerToken = context.params.scorerToken;
  const body = await context.request.json();
  const { hole_number, scores } = body;

  if (!hole_number || !Array.isArray(scores) || scores.length === 0) {
    return err('hole_number and scores[] required');
  }

  const holeNum = parseInt(hole_number);
  if (isNaN(holeNum)) return err('Invalid hole number');

  // Validate event via scorer_token
  const event = await db.prepare(
    'SELECT * FROM events WHERE scorer_token = ?'
  ).bind(scorerToken).first();

  if (!event) return err('Invalid scorer token', 404);
  if (event.locked_at || event.status === 'completed') {
    return err('Event is locked — scores cannot be changed', 403);
  }
  if (event.status !== 'live') {
    return err('Event is not live yet', 403);
  }
  if (isEventTokenExpired(event)) {
    return err('This scorer link has expired. Ask your organizer for a new link.', 410);
  }
  if (holeNum < 1 || holeNum > event.holes) {
    return err(`Hole must be between 1 and ${event.holes}`);
  }

  // Verify the hole exists
  const eventHole = await db.prepare(
    'SELECT par FROM event_holes WHERE event_id = ? AND hole_number = ?'
  ).bind(event.id, holeNum).first();
  if (!eventHole) return err('Hole not configured for this event');

  // Get all teams for this event to validate team_ids
  const { results: teams } = await db.prepare(
    'SELECT id FROM teams WHERE event_id = ?'
  ).bind(event.id).all();
  const validTeamIds = new Set(teams.map(t => t.id));

  const timestamp = now();
  const stmts = [];
  const auditPayloads = [];

  for (const s of scores) {
    const strokes = parseInt(s.strokes);
    if (isNaN(strokes) || strokes < 1 || strokes > 20) continue;
    if (!validTeamIds.has(s.team_id)) continue;

    const existing = await db.prepare(
      'SELECT id, strokes FROM hole_scores WHERE team_id = ? AND hole_number = ?'
    ).bind(s.team_id, holeNum).first();

    if (existing) {
      if (existing.strokes === strokes) continue;
      stmts.push(
        db.prepare(
          'UPDATE hole_scores SET strokes = ?, updated_at = ?, updated_by = ? WHERE id = ?'
        ).bind(strokes, timestamp, 'match_scorer', existing.id),
      );
      auditPayloads.push({
        team_id: s.team_id,
        hole_number: holeNum,
        before_strokes: existing.strokes,
        after_strokes: strokes,
        action: 'update',
      });
    } else {
      stmts.push(
        db.prepare(
          'INSERT INTO hole_scores (id, team_id, hole_number, strokes, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(newId('hs_'), s.team_id, holeNum, strokes, timestamp, 'match_scorer'),
      );
      auditPayloads.push({
        team_id: s.team_id,
        hole_number: holeNum,
        after_strokes: strokes,
        action: 'create',
      });
    }
  }

  if (stmts.length > 0) {
    await db.batch(stmts);
    // Log audits after the batch lands so we don't pollute history on partial
    // failure. Each is logAudit-fire-and-forget so a missing audit table
    // can't break score writes.
    for (const a of auditPayloads) {
      await logScoreChange(db, {
        ...a,
        event_id: event.id,
        actor: 'match_scorer',
      });
    }
  }

  return json({ success: true, hole_number: holeNum, saved: stmts.length });
}
