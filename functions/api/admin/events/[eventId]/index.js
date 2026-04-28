function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }

// PATCH /api/admin/events/:eventId — partial edit of event metadata.
// Accepts any subset of: name, slug, date, leaderboard_visible,
// branding_overrides, token_policy, token_expires_at. Game/format/scoring
// fields go through /game-settings; status through /status; visibility
// has its own legacy endpoint but is also accepted here for completeness.
//
// Course and holes are intentionally not editable post-creation — they
// require regenerating event_holes which would invalidate scores.
export async function onRequestPatch(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;
  const body = await context.request.json().catch(() => ({}));

  const event = await db.prepare('SELECT id FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return err('Event not found', 404);

  const updates = {};

  if (typeof body.name === 'string') {
    if (!body.name.trim()) return err('name cannot be empty');
    updates.name = body.name.trim();
  }
  if (typeof body.slug === 'string') {
    if (!body.slug.trim()) return err('slug cannot be empty');
    updates.slug = body.slug.trim();
  }
  if (body.date !== undefined) {
    updates.date = body.date || null;
  }
  if (body.leaderboard_visible !== undefined) {
    updates.leaderboard_visible = body.leaderboard_visible ? 1 : 0;
  }
  if (body.branding_overrides !== undefined) {
    updates.branding_overrides_json = body.branding_overrides
      ? JSON.stringify(body.branding_overrides)
      : null;
  }
  if (body.token_policy !== undefined) {
    if (!['never', 'on_complete', 'fixed'].includes(body.token_policy)) {
      return err('token_policy must be never, on_complete, or fixed');
    }
    updates.token_policy = body.token_policy;
  }
  if (body.token_expires_at !== undefined) {
    updates.token_expires_at = body.token_expires_at || null;
  }

  const cols = Object.keys(updates);
  if (cols.length === 0) return err('No editable fields supplied');

  // Try the wider UPDATE; degrade on missing 0009 columns so legacy DBs
  // can still patch name/slug/date/visibility.
  const tryLayers = [];
  tryLayers.push(cols);
  // Build progressively narrower column lists by stripping V2-only columns
  // when they aren't all known.
  const v2Cols = ['branding_overrides_json', 'token_policy', 'token_expires_at'];
  if (cols.some((c) => v2Cols.includes(c))) {
    tryLayers.push(cols.filter((c) => !v2Cols.includes(c)));
  }

  let lastError = null;
  let appliedCols = null;
  for (const colSet of tryLayers) {
    if (colSet.length === 0) continue;
    const fragment = colSet.map((c) => `${c} = ?`).join(', ');
    const values = colSet.map((c) => updates[c]);
    try {
      await db.prepare(`UPDATE events SET ${fragment} WHERE id = ?`)
        .bind(...values, eventId).run();
      appliedCols = colSet;
      break;
    } catch (e) {
      const msg = String(e?.message || e);
      lastError = msg;
      if (msg.includes('UNIQUE constraint failed: events.org_id, events.slug')) {
        return err('Event slug already exists for this organization');
      }
      if (!/no such column/i.test(msg)) {
        return err('Database error: ' + msg, 500);
      }
    }
  }
  if (!appliedCols) return err('Database error: ' + (lastError || 'unknown'), 500);

  const updated = await db.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first();
  return json({
    success: true,
    event: updated,
    applied_columns: appliedCols,
    skipped_columns: cols.filter((c) => !appliedCols.includes(c)),
  });
}

export async function onRequestDelete(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;

  const event = await db.prepare('SELECT id, name FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return err('Event not found', 404);

  // Get all team IDs for this event so we can cascade delete their scores
  const { results: teams } = await db.prepare('SELECT id FROM teams WHERE event_id = ?').bind(eventId).all();
  const teamIds = teams.map(t => t.id);

  const stmts = [];

  // Delete hole_scores for all teams
  if (teamIds.length > 0) {
    const ph = teamIds.map(() => '?').join(',');
    stmts.push(db.prepare(`DELETE FROM hole_scores WHERE team_id IN (${ph})`).bind(...teamIds));
  }

  // Delete game_points, sponsors, event_holes, teams, then the event itself
  stmts.push(db.prepare('DELETE FROM game_points WHERE event_id = ?').bind(eventId));
  stmts.push(db.prepare('DELETE FROM sponsors WHERE event_id = ?').bind(eventId));
  stmts.push(db.prepare('DELETE FROM event_holes WHERE event_id = ?').bind(eventId));
  stmts.push(db.prepare('DELETE FROM teams WHERE event_id = ?').bind(eventId));
  stmts.push(db.prepare('DELETE FROM events WHERE id = ?').bind(eventId));

  await db.batch(stmts);

  return json({ success: true, deleted: event.name });
}

export async function onRequestGet(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;

  const event = await db.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return err('Event not found', 404);

  const org = await db.prepare('SELECT slug, name FROM organizations WHERE id = ?').bind(event.org_id).first();

  const { results: eventHoles } = await db.prepare(
    'SELECT hole_number, par FROM event_holes WHERE event_id = ? ORDER BY hole_number'
  ).bind(eventId).all();

  const { results: teams } = await db.prepare(
    'SELECT id, team_name, players_json, access_token, starting_hole, handicap_strokes, locked_at, created_at FROM teams WHERE event_id = ? ORDER BY created_at'
  ).bind(eventId).all();

  const { results: sponsors } = await db.prepare(
    'SELECT * FROM sponsors WHERE event_id = ? ORDER BY display_order ASC'
  ).bind(eventId).all();

  let allScores = [];
  let allYourHoles = [];
  if (teams.length > 0) {
    const placeholders = teams.map(() => '?').join(',');
    const { results } = await db.prepare(
      `SELECT team_id, hole_number, strokes, updated_at, updated_by FROM hole_scores WHERE team_id IN (${placeholders}) ORDER BY hole_number`
    ).bind(...teams.map(t => t.id)).all();
    allScores = results;

    // Jeff Martin your-hole selections (table may not exist on older DBs)
    try {
      const { results: yh } = await db.prepare(
        `SELECT team_id, hole_number, player_index FROM hole_your_holes WHERE team_id IN (${placeholders})`
      ).bind(...teams.map(t => t.id)).all();
      allYourHoles = yh || [];
    } catch { /* table missing */ }
  }

  const teamsWithScores = teams.map(t => ({
    ...t,
    players: t.players_json ? JSON.parse(t.players_json) : [],
    scores: allScores
      .filter(s => s.team_id === t.id)
      .reduce((acc, s) => {
        acc[s.hole_number] = { strokes: s.strokes, updated_at: s.updated_at, updated_by: s.updated_by };
        return acc;
      }, {}),
    your_holes: allYourHoles
      .filter(y => y.team_id === t.id)
      .reduce((acc, y) => { acc[y.hole_number] = y.player_index; return acc; }, {}),
  }));

  const { results: gamePoints } = await db.prepare(
    'SELECT team_id, hole_number, game_type, points FROM game_points WHERE event_id = ? ORDER BY hole_number'
  ).bind(eventId).all();

  return json({
    event,
    org: org ? { slug: org.slug, name: org.name } : null,
    holes: eventHoles,
    teams: teamsWithScores,
    sponsors,
    game_points: gamePoints,
  });
}
