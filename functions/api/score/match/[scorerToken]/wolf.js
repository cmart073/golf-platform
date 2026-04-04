function newId(prefix = '') { return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }
function now() { return new Date().toISOString(); }

export async function onRequestPost(context) {
  const db = context.env.DB;
  const scorerToken = context.params.scorerToken;
  const body = await context.request.json();
  const { hole_number, wolf_team_id, partner_team_id } = body;

  if (!hole_number || !wolf_team_id) return err('hole_number and wolf_team_id required');
  const holeNum = parseInt(hole_number);

  const event = await db.prepare(
    'SELECT id, holes, status, locked_at FROM events WHERE scorer_token = ?'
  ).bind(scorerToken).first();
  if (!event) return err('Invalid scorer token', 404);
  if (event.locked_at || event.status === 'completed') return err('Event is locked', 403);
  if (event.status !== 'live') return err('Event is not live yet', 403);
  if (holeNum < 1 || holeNum > event.holes) return err(`Hole must be 1-${event.holes}`);

  // Validate teams belong to this event
  const { results: teams } = await db.prepare('SELECT id FROM teams WHERE event_id = ?').bind(event.id).all();
  const validIds = new Set(teams.map(t => t.id));
  if (!validIds.has(wolf_team_id)) return err('Invalid wolf team');
  if (partner_team_id && !validIds.has(partner_team_id)) return err('Invalid partner team');
  if (partner_team_id === wolf_team_id) return err('Wolf cannot be their own partner');

  const ts = now();
  const existing = await db.prepare(
    'SELECT id FROM wolf_picks WHERE event_id = ? AND hole_number = ?'
  ).bind(event.id, holeNum).first();

  if (existing) {
    await db.prepare(
      'UPDATE wolf_picks SET wolf_team_id = ?, partner_team_id = ?, updated_at = ? WHERE id = ?'
    ).bind(wolf_team_id, partner_team_id || null, ts, existing.id).run();
  } else {
    await db.prepare(
      'INSERT INTO wolf_picks (id, event_id, hole_number, wolf_team_id, partner_team_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(newId('wp_'), event.id, holeNum, wolf_team_id, partner_team_id || null, ts, ts).run();
  }

  return json({ success: true, hole_number: holeNum });
}
