// GET /api/admin/events/:eventId/audit
//   ?limit=200       (default 200, capped at 500)
//   ?entity_type=…   filter by entity_type
//   ?actor=…         filter by actor
//
// Returns the most-recent-first audit log entries for an event. Returns
// an empty list (not an error) when migration 0010 hasn't run yet, so the
// admin UI can render its empty state cleanly.

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
function err(message, status = 400) { return json({ error: message }, status); }

export async function onRequestGet(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;
  const url = new URL(context.request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 500);
  const entityType = url.searchParams.get('entity_type');
  const actor = url.searchParams.get('actor');

  const event = await db.prepare('SELECT id FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return err('Event not found', 404);

  const where = ['event_id = ?'];
  const binds = [eventId];
  if (entityType) { where.push('entity_type = ?'); binds.push(entityType); }
  if (actor)      { where.push('actor = ?');       binds.push(actor); }

  try {
    const { results } = await db.prepare(
      `SELECT id, event_id, entity_type, entity_id, action, actor, actor_label,
              before_json, after_json, reason, created_at
       FROM audit_log
       WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    ).bind(...binds, limit).all();

    return json({
      entries: results.map((r) => ({
        ...r,
        before: r.before_json ? safeParse(r.before_json) : null,
        after:  r.after_json  ? safeParse(r.after_json)  : null,
      })),
      count: results.length,
      limit,
    });
  } catch (e) {
    const msg = String(e?.message || e);
    if (/no such table.*audit_log/i.test(msg)) {
      return json({ entries: [], count: 0, limit, schema: 'pre-0010' });
    }
    return err('Database error: ' + msg, 500);
  }
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return s; }
}
