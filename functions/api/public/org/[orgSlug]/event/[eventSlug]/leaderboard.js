function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=5' },
  });
}
function err(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestGet(context) {
  const db = context.env.DB;
  const { orgSlug, eventSlug } = context.params;

  const org = await db.prepare('SELECT id, name FROM organizations WHERE slug = ?').bind(orgSlug).first();
  if (!org) return err('Organization not found', 404);

  const event = await db.prepare(
    'SELECT id, name, date, holes, status, locked_at, leaderboard_visible FROM events WHERE org_id = ? AND slug = ?'
  ).bind(org.id, eventSlug).first();
  if (!event) return err('Event not found', 404);

  const { results: eventHoles } = await db.prepare(
    'SELECT hole_number, par FROM event_holes WHERE event_id = ? ORDER BY hole_number'
  ).bind(event.id).all();

  const parMap = {};
  let totalPar = 0;
  eventHoles.forEach(h => { parMap[h.hole_number] = h.par; totalPar += h.par; });

  if (!event.leaderboard_visible) {
    return json({
      event: { name: event.name, date: event.date, holes: event.holes, status: event.status, leaderboard_visible: false },
      totals: { total_par: totalPar },
      teams: [],
      hidden: true,
    });
  }

  const { results: teams } = await db.prepare(
    'SELECT id, team_name, locked_at, created_at FROM teams WHERE event_id = ? ORDER BY created_at'
  ).bind(event.id).all();

  if (teams.length === 0) {
    return json({
      event: { name: event.name, date: event.date, holes: event.holes, status: event.status, leaderboard_visible: true },
      totals: { total_par: totalPar },
      org: { name: org.name },
      teams: [],
      hidden: false,
    });
  }

  const teamIds = teams.map(t => t.id);
  const placeholders = teamIds.map(() => '?').join(',');
  const { results: allScores } = await db.prepare(
    `SELECT team_id, hole_number, strokes, updated_at FROM hole_scores WHERE team_id IN (${placeholders}) ORDER BY updated_at DESC`
  ).bind(...teamIds).all();

  const leaderboard = teams.map(team => {
    const teamScores = allScores.filter(s => s.team_id === team.id);
    const holesCompleted = teamScores.length;
    const strokesCompleted = teamScores.reduce((sum, s) => sum + s.strokes, 0);
    const parCompleted = teamScores.reduce((sum, s) => sum + (parMap[s.hole_number] || 0), 0);
    const toPar = strokesCompleted - parCompleted;
    const projectedTotal = strokesCompleted + (totalPar - parCompleted);
    const lastUpdated = teamScores.length > 0 ? teamScores[0].updated_at : null;

    return {
      id: team.id,
      team_name: team.team_name,
      to_par: toPar,
      projected_total: projectedTotal,
      strokes_completed: strokesCompleted,
      holes_completed: holesCompleted,
      submitted: !!team.locked_at,
      last_updated: lastUpdated,
    };
  });

  leaderboard.sort((a, b) => {
    if (a.to_par !== b.to_par) return a.to_par - b.to_par;
    if (a.holes_completed !== b.holes_completed) return b.holes_completed - a.holes_completed;
    if (!a.last_updated) return 1;
    if (!b.last_updated) return -1;
    return a.last_updated < b.last_updated ? -1 : 1;
  });

  return json({
    event: { name: event.name, date: event.date, holes: event.holes, status: event.status, leaderboard_visible: true },
    org: { name: org.name },
    totals: { total_par: totalPar },
    teams: leaderboard,
    hidden: false,
  });
}
