import { logScoreChange } from '../../../_audit.js';
import { isEventTokenExpired } from '../../../_tokens.js';

function newId(prefix = '') { return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }
function now() { return new Date().toISOString(); }

export async function onRequestPost(context) {
  const db = context.env.DB;
  const accessToken = context.params.accessToken;
  const body = await context.request.json();
  const { hole_number, strokes } = body;

  if (!hole_number || !strokes) return err('hole_number and strokes required');
  const holeNum = parseInt(hole_number);
  const strokesNum = parseInt(strokes);
  if (isNaN(holeNum) || isNaN(strokesNum)) return err('Invalid numbers');
  if (strokesNum < 1 || strokesNum > 20) return err('Strokes must be 1-20');

  const team = await db.prepare(
    'SELECT id, event_id, locked_at FROM teams WHERE access_token = ?'
  ).bind(accessToken).first();
  if (!team) return err('Invalid access token', 404);

  // Check TEAM lock (golfer submitted)
  if (team.locked_at) {
    return err('Your scores have been submitted and are locked', 403);
  }

  const event = await db.prepare(
    'SELECT * FROM events WHERE id = ?'
  ).bind(team.event_id).first();
  if (!event) return err('Event not found', 404);

  // Check EVENT lock
  if (event.locked_at || event.status === 'completed') {
    return err('Event is locked — scores cannot be changed', 403);
  }

  // Check token expiry (V2). Pre-0009 events have token_expires_at undefined
  // and isEventTokenExpired returns false, so legacy behavior is unchanged.
  if (isEventTokenExpired(event)) {
    return err('This scorecard link has expired. Ask your organizer for a new link.', 410);
  }

  // Check event is live
  if (event.status !== 'live') {
    return err('Event is not live yet', 403);
  }

  if (holeNum < 1 || holeNum > event.holes) {
    return err(`Hole must be between 1 and ${event.holes}`);
  }

  const eventHole = await db.prepare(
    'SELECT par FROM event_holes WHERE event_id = ? AND hole_number = ?'
  ).bind(event.id, holeNum).first();
  if (!eventHole) return err('Hole not configured for this event');

  const timestamp = now();

  const existing = await db.prepare(
    'SELECT id, strokes FROM hole_scores WHERE team_id = ? AND hole_number = ?'
  ).bind(team.id, holeNum).first();

  if (existing) {
    if (existing.strokes !== strokesNum) {
      await db.prepare(
        'UPDATE hole_scores SET strokes = ?, updated_at = ?, updated_by = ? WHERE id = ?'
      ).bind(strokesNum, timestamp, 'team', existing.id).run();
      await logScoreChange(db, {
        event_id: event.id,
        team_id: team.id,
        hole_number: holeNum,
        before_strokes: existing.strokes,
        after_strokes: strokesNum,
        actor: 'team',
        action: 'update',
      });
    }
  } else {
    await db.prepare(
      'INSERT INTO hole_scores (id, team_id, hole_number, strokes, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(newId('hs_'), team.id, holeNum, strokesNum, timestamp, 'team').run();
    await logScoreChange(db, {
      event_id: event.id,
      team_id: team.id,
      hole_number: holeNum,
      after_strokes: strokesNum,
      actor: 'team',
      action: 'create',
    });
  }

  const { results: scores } = await db.prepare(
    'SELECT hole_number, strokes, updated_at FROM hole_scores WHERE team_id = ? ORDER BY hole_number'
  ).bind(team.id).all();

  const scoresMap = {};
  scores.forEach(s => {
    scoresMap[s.hole_number] = { strokes: s.strokes, updated_at: s.updated_at };
  });

  return json({ success: true, scores: scoresMap });
}
