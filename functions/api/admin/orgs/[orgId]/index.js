// GET / PATCH for a single organization. Used by the V2 organizer
// wizard to populate the branding step and by OrgDetail to edit the
// org's name / slug / logo / brand color.

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
function err(message, status = 400) { return json({ error: message }, status); }

export async function onRequestGet(context) {
  const db = context.env.DB;
  const orgId = context.params.orgId;
  const org = await db.prepare(
    'SELECT id, slug, name, logo_url, brand_color, created_at FROM organizations WHERE id = ?',
  ).bind(orgId).first();
  if (!org) return err('Organization not found', 404);
  return json(org);
}

export async function onRequestPatch(context) {
  const db = context.env.DB;
  const orgId = context.params.orgId;
  const body = await context.request.json().catch(() => ({}));

  const updates = {};
  if (typeof body.name === 'string') {
    if (!body.name.trim()) return err('name cannot be empty');
    updates.name = body.name.trim();
  }
  if (typeof body.slug === 'string') {
    if (!body.slug.trim()) return err('slug cannot be empty');
    updates.slug = body.slug.trim();
  }
  if (body.logo_url !== undefined) {
    updates.logo_url = body.logo_url || null;
  }
  if (body.brand_color !== undefined) {
    // Lightweight validation: allow empty/null, "#rrggbb", "#rgb",
    // or a small set of CSS color names. Reject anything that smells
    // like an injection attempt (no parens, no semicolons).
    const v = body.brand_color;
    if (v && (typeof v !== 'string' || /[;()<>]/.test(v) || v.length > 32)) {
      return err('brand_color is invalid');
    }
    updates.brand_color = v || null;
  }

  const cols = Object.keys(updates);
  if (cols.length === 0) return err('No editable fields supplied');

  const fragment = cols.map((c) => `${c} = ?`).join(', ');
  const values = cols.map((c) => updates[c]);

  try {
    await db.prepare(`UPDATE organizations SET ${fragment} WHERE id = ?`)
      .bind(...values, orgId).run();
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes('UNIQUE constraint failed: organizations.slug')) {
      return err('Slug already in use');
    }
    return err('Database error: ' + msg, 500);
  }

  const updated = await db.prepare(
    'SELECT id, slug, name, logo_url, brand_color, created_at FROM organizations WHERE id = ?',
  ).bind(orgId).first();
  return json({ success: true, org: updated });
}
