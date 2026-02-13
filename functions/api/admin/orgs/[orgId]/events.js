function newId(prefix = '') { return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }
function now() { return new Date().toISOString(); }

export async function onRequestGet(context) {
  const db = context.env.DB;
  const orgId = context.params.orgId;
  const { results } = await db.prepare(
    'SELECT * FROM events WHERE org_id = ? ORDER BY created_at DESC'
  ).bind(orgId).all();
  return json(results);
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  const orgId = context.params.orgId;
  const body = await context.request.json();
  const { name, slug, date, holes, course_id, leaderboard_visible } = body;

  if (!name || !slug) return err('name and slug required');
  if (holes !== 9 && holes !== 18) return err('holes must be 9 or 18');
  if (!course_id) return err('course_id required');

  const course = await db.prepare(
    'SELECT id FROM courses WHERE id = ? AND org_id = ?'
  ).bind(course_id, orgId).first();
  if (!course) return err('course not found in this organization');

  const { results: courseHoles } = await db.prepare(
    'SELECT hole_number, par FROM course_holes WHERE course_id = ? AND hole_number <= ? ORDER BY hole_number'
  ).bind(course_id, holes).all();

  if (courseHoles.length < holes) {
    return err(`Course only has ${courseHoles.length} holes defined, need ${holes}`);
  }

  const eventId = newId('evt_');
  const timestamp = now();

  await db.prepare(
    `INSERT INTO events (id, org_id, course_id, slug, name, date, holes, leaderboard_visible, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`
  ).bind(
    eventId, orgId, course_id, slug, name,
    date || null, holes,
    leaderboard_visible !== undefined ? (leaderboard_visible ? 1 : 0) : 1,
    timestamp
  ).run();

  const stmts = courseHoles.map((ch) =>
    db.prepare(
      'INSERT INTO event_holes (id, event_id, hole_number, par) VALUES (?, ?, ?, ?)'
    ).bind(newId('eh_'), eventId, ch.hole_number, ch.par)
  );
  await db.batch(stmts);

  return json({ id: eventId, slug, name, holes, status: 'draft' }, 201);
}
