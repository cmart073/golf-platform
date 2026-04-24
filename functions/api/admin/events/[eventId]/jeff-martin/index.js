// GET /api/admin/events/:eventId/jeff-martin
// Returns the full Jeff Martin state for the event:
//   - teams (with rosters)
//   - your_holes: { team_id: { hole_number: player_index } }
//   - mulligans: { team_id: { player_index: { used_count, holes_used } } }

function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }

export async function onRequestGet(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;

  const event = await db.prepare('SELECT id, holes FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return err('Event not found', 404);

  const { results: teams } = await db.prepare(
    'SELECT id, team_name, players_json FROM teams WHERE event_id = ? ORDER BY created_at'
  ).bind(eventId).all();

  const teamsShaped = teams.map(t => {
    let players = [];
    try { players = JSON.parse(t.players_json || '[]'); } catch { players = []; }
    return { id: t.id, team_name: t.team_name, players };
  });

  const yourHoles = {};
  const mulligans = {};

  if (teams.length > 0) {
    const teamIds = teams.map(t => t.id);
    const placeholders = teamIds.map(() => '?').join(',');

    try {
      const { results: yh } = await db.prepare(
        `SELECT team_id, hole_number, player_index FROM hole_your_holes WHERE team_id IN (${placeholders})`
      ).bind(...teamIds).all();
      (yh || []).forEach(r => {
        yourHoles[r.team_id] ||= {};
        yourHoles[r.team_id][r.hole_number] = r.player_index;
      });
    } catch { /* table missing */ }

    try {
      const { results: muls } = await db.prepare(
        `SELECT team_id, player_index, used_count, holes_used_json FROM team_mulligans WHERE team_id IN (${placeholders})`
      ).bind(...teamIds).all();
      (muls || []).forEach(r => {
        mulligans[r.team_id] ||= {};
        let holes = [];
        try { holes = JSON.parse(r.holes_used_json || '[]'); } catch { holes = []; }
        mulligans[r.team_id][r.player_index] = { used_count: r.used_count, holes_used: holes };
      });
    } catch { /* table missing */ }
  }

  return json({
    event: { id: event.id, holes: event.holes },
    teams: teamsShaped,
    your_holes: yourHoles,
    mulligans,
  });
}
