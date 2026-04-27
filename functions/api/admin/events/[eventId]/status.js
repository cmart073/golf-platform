import { logAudit } from '../../../../_audit.js';

function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }
function now() { return new Date().toISOString(); }

export async function onRequestPost(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;
  const body = await context.request.json();
  const { status, reason } = body;

  const valid = ['draft', 'live', 'completed'];
  if (!valid.includes(status)) return err(`status must be one of: ${valid.join(', ')}`);

  const event = await db.prepare('SELECT id, status, locked_at, token_policy FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return err('Event not found', 404);

  const locked_at = status === 'completed' ? now() : null;

  await db.prepare(
    'UPDATE events SET status = ?, locked_at = ? WHERE id = ?'
  ).bind(status, locked_at, eventId).run();

  // When an event completes and the policy is on_complete, stamp
  // token_expires_at = now so all team/scorer tokens stop working.
  // Only attempt the column if it exists (graceful degrade for pre-0009).
  let tokenExpiresAt = null;
  if (status === 'completed' && event.token_policy === 'on_complete') {
    tokenExpiresAt = now();
    try {
      await db.prepare('UPDATE events SET token_expires_at = ? WHERE id = ?')
        .bind(tokenExpiresAt, eventId).run();
    } catch (e) {
      const msg = String(e?.message || e);
      if (!/no such column.*token_expires_at/i.test(msg)) throw e;
      tokenExpiresAt = null;
    }
  }

  if (event.status !== status) {
    await logAudit(db, {
      event_id: eventId,
      entity_type: 'event',
      entity_id: eventId,
      action: 'set_status',
      actor: 'admin',
      before: { status: event.status, locked_at: event.locked_at },
      after: { status, locked_at, token_expires_at: tokenExpiresAt },
      reason: reason || null,
    });
  }

  return json({ success: true, status, locked_at, token_expires_at: tokenExpiresAt });
}
