// POST /api/admin/events/:eventId/regen-scorer-token
// Issues a fresh scorer_token for the single-scorer mode. Old token
// immediately stops working. Returns the new token so the organizer can
// re-share.

import { newToken } from '../../../../_tokens.js';
import { logAudit } from '../../../../_audit.js';

function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }

export async function onRequestPost(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;
  const body = await context.request.json().catch(() => ({}));

  const event = await db.prepare(
    'SELECT id, scorer_token, event_type FROM events WHERE id = ?',
  ).bind(eventId).first();
  if (!event) return err('Event not found', 404);
  if (event.event_type !== 'weekly_match') {
    return err('Scorer token only applies to single-scorer events', 409);
  }

  let attempts = 0;
  let token = newToken(32);
  while (attempts < 3) {
    try {
      await db.prepare('UPDATE events SET scorer_token = ? WHERE id = ?')
        .bind(token, eventId).run();
      break;
    } catch (e) {
      const msg = String(e?.message || e);
      if (/UNIQUE constraint failed/i.test(msg) && attempts < 2) {
        attempts++;
        token = newToken(32);
        continue;
      }
      return err('Database error: ' + msg, 500);
    }
  }

  await logAudit(db, {
    event_id: eventId,
    entity_type: 'event',
    entity_id: eventId,
    action: 'regen_token',
    actor: 'admin',
    before: { scorer_token: event.scorer_token ? '****' + event.scorer_token.slice(-4) : null },
    after: { scorer_token: '****' + token.slice(-4) },
    reason: body.reason || null,
  });

  return json({ success: true, scorer_token: token });
}
