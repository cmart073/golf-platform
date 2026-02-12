import { json, err, newId, now } from '../../_shared.js';

export async function onRequestGet(context) {
  const db = context.env.DB;
  const { results } = await db.prepare('SELECT * FROM organizations ORDER BY created_at DESC').all();
  return json(results);
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  const body = await context.request.json();
  const { name, slug, logo_url, brand_color } = body;
  if (!name || !slug) return err('name and slug required');

  const id = newId('org_');
  await db.prepare(
    'INSERT INTO organizations (id, slug, name, logo_url, brand_color, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, slug, name, logo_url || null, brand_color || null, now()).run();

  return json({ id, slug, name }, 201);
}
