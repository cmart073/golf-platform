import { logScoreChange } from '../../../../../../_audit.js';

function newId(prefix = '') { return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }
function now() { return new Date().toISOString(); }

export async function onRequestPost(context) {
  const db = context.env.DB;
  const { eventId, teamId } = context.params;
  const body = await context.request.json();
  const { hole_number, strokes, reason } = body;

  if (!hole_number || !strokes) return err('hole_number and strokes required');
  const holeNum = parseInt(hole_number);
  const strokesNum = parseInt(strokes);
  if (isNaN(holeNum) || isNaN(strokesNum)) return err('Invalid numbers');
  if (strokesNum < 1 || strokesNum > 20) return err('Strokes must be 1-20');

  // Verify team belongs to event
  const team = await db.prepare(
    'SELECT id, team_name FROM teams WHERE id = ? AND event_id = ?'
  ).bind(teamId, eventId).first();
  if (!team) return err('Team not found in this event', 404);

  // Verify hole exists
  const event = await db.prepare('SELECT holes FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return err('Event not found', 404);
  if (holeNum < 1 || holeNum > event.holes) return err(`Hole must be 1-${event.holes}`);

  const timestamp = now();

  // Admin override — upsert regardless of lock status
  const existing = await db.prepare(
    'SELECT id, strokes FROM hole_scores WHERE team_id = ? AND hole_number = ?'
  ).bind(teamId, holeNum).first();

  if (existing) {
    if (existing.strokes !== strokesNum) {
      await db.prepare(
        'UPDATE hole_scores SET strokes = ?, updated_at = ?, updated_by = ? WHERE id = ?'
      ).bind(strokesNum, timestamp, 'admin', existing.id).run();
      await logScoreChange(db, {
        event_id: eventId,
        team_id: teamId,
        hole_number: holeNum,
        before_strokes: existing.strokes,
        after_strokes: strokesNum,
        actor: 'admin',
        actor_label: team.team_name,
        action: 'override',
        reason: reason || null,
      });
    }
  } else {
    await db.prepare(
      'INSERT INTO hole_scores (id, team_id, hole_number, strokes, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(newId('hs_'), teamId, holeNum, strokesNum, timestamp, 'admin').run();
    await logScoreChange(db, {
      event_id: eventId,
      team_id: teamId,
      hole_number: holeNum,
      after_strokes: strokesNum,
      actor: 'admin',
      actor_label: team.team_name,
      action: 'override',
      reason: reason || null,
    });
  }

  return json({ success: true, hole_number: holeNum, strokes: strokesNum, updated_by: 'admin' });
}
