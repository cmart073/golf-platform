// Audit-log helper. Wired into score-write paths and admin overrides.
// Designed to be a *safe* call site — if the audit_log table doesn't exist
// (migration 0010 not yet run) or any insert error occurs, the helper
// swallows the error and warns. Audit logging must never break the user
// flow it observes.

function newAuditId() {
  return 'aud_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
}

const VALID_ACTORS = new Set(['admin', 'team', 'match_scorer', 'system']);

// logAudit(db, entry) — fire-and-forget by design (caller awaits, but
// errors are caught here and surfaced only via console.warn).
//
// entry = {
//   event_id: string,                // required
//   entity_type: string,             // required ('score' | 'team' | …)
//   entity_id?: string,
//   action: string,                  // required
//   actor: 'admin'|'team'|'match_scorer'|'system',
//   actor_label?: string,
//   before?: any,                    // serialized to JSON
//   after?: any,                     // serialized to JSON
//   reason?: string,
// }
export async function logAudit(db, entry) {
  if (!db || !entry) return;
  if (!entry.event_id || !entry.entity_type || !entry.action) {
    console.warn('logAudit: missing required field', entry);
    return;
  }
  const actor = VALID_ACTORS.has(entry.actor) ? entry.actor : 'system';
  try {
    await db.prepare(
      `INSERT INTO audit_log (
         id, event_id, entity_type, entity_id, action, actor, actor_label,
         before_json, after_json, reason
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      newAuditId(),
      entry.event_id,
      entry.entity_type,
      entry.entity_id || null,
      entry.action,
      actor,
      entry.actor_label || null,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after  === undefined ? null : JSON.stringify(entry.after),
      entry.reason || null,
    ).run();
  } catch (e) {
    const msg = String(e?.message || e);
    if (/no such table.*audit_log/i.test(msg)) {
      console.warn('audit_log table missing — run migration 0010');
    } else {
      console.warn('audit insert failed:', msg);
    }
  }
}

// Convenience wrapper for score updates: figures out before/after from
// the previous strokes and the new strokes value.
export async function logScoreChange(db, opts) {
  const { event_id, team_id, hole_number, before_strokes, after_strokes,
          actor, actor_label, action = 'update', reason } = opts;
  await logAudit(db, {
    event_id,
    entity_type: 'score',
    entity_id: team_id,
    action,
    actor,
    actor_label,
    before: before_strokes !== undefined ? { hole_number, strokes: before_strokes } : null,
    after:  after_strokes  !== undefined ? { hole_number, strokes: after_strokes  } : null,
    reason,
  });
}
