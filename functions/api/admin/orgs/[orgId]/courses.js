function newId(prefix = '') { return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }
function now() { return new Date().toISOString(); }

export async function onRequestGet(context) {
  const db = context.env.DB;
  const orgId = context.params.orgId;
  const { results } = await db.prepare(
    'SELECT * FROM courses WHERE org_id = ? ORDER BY name'
  ).bind(orgId).all();
  return json(results);
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  const orgId = context.params.orgId;
  const body = await context.request.json();
  const { name, city, state, pars } = body;

  if (!name) return err('name required');
  if (!pars || typeof pars !== 'object') return err('pars object required (e.g. {"1":4,"2":3,...})');

  const courseId = newId('crs_');
  const timestamp = now();

  await db.prepare(
    'INSERT INTO courses (id, org_id, name, city, state, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(courseId, orgId, name, city || null, state || null, timestamp).run();

  const stmts = [];
  for (let h = 1; h <= 18; h++) {
    const par = parseInt(pars[String(h)]);
    if (!par || par < 3 || par > 6) return err(`Invalid par for hole ${h}: must be 3-6`);
    stmts.push(
      db.prepare(
        'INSERT INTO course_holes (id, course_id, hole_number, par) VALUES (?, ?, ?, ?)'
      ).bind(newId('ch_'), courseId, h, par)
    );
  }
  await db.batch(stmts);

  return json({ id: courseId, name, city, state }, 201);
}
