function newId(prefix = '') { return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }
function now() { return new Date().toISOString(); }

export async function onRequestGet(context) {
  const db = context.env.DB;
  // Return all courses across all organizations — courses are shared globally.
  // Includes the owner org's name/slug so the UI can show provenance.
  const { results } = await db.prepare(
    `SELECT c.*, o.name AS org_name, o.slug AS org_slug
     FROM courses c
     LEFT JOIN organizations o ON o.id = c.org_id
     ORDER BY c.name`
  ).all();
  return json(results);
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  const orgId = context.params.orgId;
  const body = await context.request.json();
  const { name, city, state, pars, holes } = body;

  if (!name) return err('name required');

  // V2.1: pars are optional. When omitted we default every hole to par 4
  // so the autofilled-from-OSM flow can land in one click; the organizer
  // can edit pars later from the course detail. `holes` lets us cap at 9
  // for 9-hole courses; default to 18.
  const holeCount = holes === 9 ? 9 : 18;
  const parsByHole = {};
  for (let h = 1; h <= holeCount; h++) {
    const supplied = pars ? parseInt(pars[String(h)]) : null;
    if (supplied) {
      if (supplied < 3 || supplied > 6) return err(`Invalid par for hole ${h}: must be 3-6`);
      parsByHole[h] = supplied;
    } else {
      parsByHole[h] = 4;
    }
  }

  const courseId = newId('crs_');
  const timestamp = now();

  await db.prepare(
    'INSERT INTO courses (id, org_id, name, city, state, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(courseId, orgId, name, city || null, state || null, timestamp).run();

  const stmts = [];
  for (let h = 1; h <= holeCount; h++) {
    stmts.push(
      db.prepare(
        'INSERT INTO course_holes (id, course_id, hole_number, par) VALUES (?, ?, ?, ?)'
      ).bind(newId('ch_'), courseId, h, parsByHole[h])
    );
  }
  await db.batch(stmts);

  return json({
    id: courseId, name, city, state,
    holes: holeCount,
    pars_default: !pars,
  }, 201);
}
