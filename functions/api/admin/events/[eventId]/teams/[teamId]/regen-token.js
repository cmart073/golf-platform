// POST /api/admin/events/:eventId/teams/:teamId/regen-token
// Issues a fresh access_token for a team. The previous token immediately
// stops working. Used when an organizer needs to revoke access (lost
// phone, sent to the wrong group, etc.) without rebuilding the team.

import { newToken } from '../../../../../../_tokens.js';
import { logAudit } from '../../../../../../_audit.js';

function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }

export async function onRequestPost(context) {
  const db = context.env.DB;
  const { eventId, teamId } = context.params;
  const body = await context.request.json().catch(() => ({}));

  const team = await db.prepare(
    'SELECT id, team_name, access_token FROM teams WHERE id = ? AND event_id = ?',
  ).bind(teamId, eventId).first();
  if (!team) return err('Team not found in this event', 404);

  // Generate a new token, retrying once if we hit the (extremely unlikely)
  // unique-constraint collision.
  let attempts = 0;
  let token = newToken(32);
  while (attempts < 3) {
    try {
      await db.prepare('UPDATE teams SET access_token = ? WHERE id = ?')
        .bind(token, teamId).run();
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
    entity_type: 'team',
    entity_id: teamId,
    action: 'regen_token',
    actor: 'admin',
    actor_label: team.team_name,
    before: { access_token: team.access_token ? '****' + team.access_token.slice(-4) : null },
    after: { access_token: '****' + token.slice(-4) },
    reason: body.reason || null,
  });

  return json({ success: true, access_token: token });
}
