import { json, err, newId, now } from '../../../../_shared.js';

export async function onRequestPost(context) {
  const db = context.env.DB;
  const accessToken = context.params.accessToken;
  const body = await context.request.json();
  const { hole_number, strokes } = body;

  // Validate inputs
  if (!hole_number || !strokes) return err('hole_number and strokes required');
  const holeNum = parseInt(hole_number);
  const strokesNum = parseInt(strokes);
  if (isNaN(holeNum) || isNaN(strokesNum)) return err('Invalid numbers');
  if (strokesNum < 1 || strokesNum > 20) return err('Strokes must be 1-20');

  // Find team
  const team = await db.prepare(
    'SELECT id, event_id FROM teams WHERE access_token = ?'
  ).bind(accessToken).first();
  if (!team) return err('Invalid access token', 404);

  // Check event status
  const event = await db.prepare(
    'SELECT id, holes, status, locked_at FROM events WHERE id = ?'
  ).bind(team.event_id).first();
  if (!event) return err('Event not found', 404);

  if (event.locked_at || event.status === 'completed') {
    return err('Event is locked — scores cannot be changed', 403);
  }

  if (holeNum < 1 || holeNum > event.holes) {
    return err(`Hole must be between 1 and ${event.holes}`);
  }

  // Verify par exists for this hole
  const eventHole = await db.prepare(
    'SELECT par FROM event_holes WHERE event_id = ? AND hole_number = ?'
  ).bind(event.id, holeNum).first();
  if (!eventHole) return err('Hole not configured for this event');

  const timestamp = now();

  // Upsert score
  const existing = await db.prepare(
    'SELECT id FROM hole_scores WHERE team_id = ? AND hole_number = ?'
  ).bind(team.id, holeNum).first();

  if (existing) {
    await db.prepare(
      'UPDATE hole_scores SET strokes = ?, updated_at = ?, updated_by = ? WHERE id = ?'
    ).bind(strokesNum, timestamp, 'team', existing.id).run();
  } else {
    await db.prepare(
      'INSERT INTO hole_scores (id, team_id, hole_number, strokes, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(newId('hs_'), team.id, holeNum, strokesNum, timestamp, 'team').run();
  }

  // Return updated scores
  const { results: scores } = await db.prepare(
    'SELECT hole_number, strokes, updated_at FROM hole_scores WHERE team_id = ? ORDER BY hole_number'
  ).bind(team.id).all();

  const scoresMap = {};
  scores.forEach(s => {
    scoresMap[s.hole_number] = { strokes: s.strokes, updated_at: s.updated_at };
  });

  return json({ success: true, scores: scoresMap });
}
