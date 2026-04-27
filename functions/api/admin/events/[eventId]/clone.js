// Clone an existing event into a new draft event in the same org.
// Body:
//   { slug: string, name?: string, date?: string|null,
//     course_id?: string,            // override the source's course
//     copy_sponsors?: boolean,       // default true
//     leaderboard_visible?: boolean }
//
// Teams, scores, tokens, and locks are intentionally not copied — only the
// configuration captured by the canonical event template is.

import { extractTemplate, validateTemplate, templateToCreatePayload } from '../../../../_event_template.js';
import { canUseDistributed } from '../../../../_format_registry.js';

function newId(prefix = '') { return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
function newToken(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join('');
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
function err(message, status = 400) { return json({ error: message }, status); }
function now() { return new Date().toISOString(); }

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    const sourceId = context.params.eventId;
    const body = await context.request.json().catch(() => ({}));

    const sourceEvent = await db.prepare('SELECT * FROM events WHERE id = ?').bind(sourceId).first();
    if (!sourceEvent) return err('Source event not found', 404);

    const { results: sponsorsRows } = await db.prepare(
      'SELECT * FROM sponsors WHERE event_id = ? ORDER BY display_order ASC',
    ).bind(sourceId).all();

    const template = extractTemplate(sourceEvent, sponsorsRows);

    // Apply caller overrides (slug, name, date, course_id) before
    // validation so the validator sees the final payload.
    const targetCourseId = body.course_id || template.course_id;
    if (!body.slug || typeof body.slug !== 'string') return err('slug required');

    const overridden = {
      ...template,
      name: body.name || template.name,
      course_id: targetCourseId,
    };
    const v = validateTemplate(overridden);
    if (!v.ok) return err(v.error);

    // Verify the target course exists and has enough holes defined.
    const course = await db.prepare('SELECT id FROM courses WHERE id = ?').bind(targetCourseId).first();
    if (!course) return err('course not found');
    const { results: courseHoles } = await db.prepare(
      'SELECT hole_number, par FROM course_holes WHERE course_id = ? AND hole_number <= ? ORDER BY hole_number',
    ).bind(targetCourseId, overridden.holes).all();
    if (courseHoles.length < overridden.holes) {
      return err(`Course only has ${courseHoles.length} holes defined, need ${overridden.holes}`);
    }

    const payload = templateToCreatePayload(overridden, {
      slug: body.slug,
      date: body.date ?? null,
      leaderboard_visible: body.leaderboard_visible ?? template.leaderboard_visible,
    });

    if (payload.scoring_mode === 'distributed' && !canUseDistributed(payload.enabled_games)) {
      return err('Distributed scoring is not supported by the cloned formats');
    }

    const needsScorerToken = payload.scoring_mode === 'single';
    const scorerToken = needsScorerToken ? newToken(32) : null;
    const persistedEventType = needsScorerToken ? 'weekly_match' : 'tournament';

    const newEventId = newId('evt_');
    const ts = now();
    const enabledGamesJson = JSON.stringify(payload.enabled_games);
    const brandingOverridesJson = payload.branding_overrides
      ? JSON.stringify(payload.branding_overrides)
      : null;

    await db.prepare(
      `INSERT INTO events (
         id, org_id, course_id, slug, name, date, holes,
         leaderboard_visible, status, created_at,
         event_type, enabled_games_json, scorer_token,
         scoring_mode, token_policy, branding_overrides_json,
         template_source_event_id
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      newEventId, sourceEvent.org_id, payload.course_id, payload.slug, payload.name,
      payload.date, payload.holes,
      payload.leaderboard_visible ? 1 : 0,
      ts,
      persistedEventType,
      enabledGamesJson,
      scorerToken,
      payload.scoring_mode,
      payload.token_policy,
      brandingOverridesJson,
      sourceEvent.id,
    ).run();

    const stmts = courseHoles.map((ch) =>
      db.prepare(
        'INSERT INTO event_holes (id, event_id, hole_number, par) VALUES (?, ?, ?, ?)',
      ).bind(newId('eh_'), newEventId, ch.hole_number, ch.par),
    );

    const copySponsors = body.copy_sponsors !== false; // default true
    if (copySponsors) {
      for (const s of template.sponsors) {
        stmts.push(
          db.prepare(
            'INSERT INTO sponsors (id, event_id, logo_url, display_order, link_url) VALUES (?, ?, ?, ?, ?)',
          ).bind(newId('spn_'), newEventId, s.logo_url, s.display_order ?? 0, s.link_url || null),
        );
      }
    }

    if (stmts.length > 0) await db.batch(stmts);

    return json({
      id: newEventId,
      slug: payload.slug,
      name: payload.name,
      holes: payload.holes,
      status: 'draft',
      scorer_token: scorerToken,
      scoring_mode: payload.scoring_mode,
      token_policy: payload.token_policy,
      template_source_event_id: sourceEvent.id,
      sponsors_copied: copySponsors ? template.sponsors.length : 0,
    }, 201);
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (msg.includes('UNIQUE constraint failed: events.org_id, events.slug')) {
      return err('Event slug already exists for this organization');
    }
    if (/no such column.*scoring_mode/i.test(msg)) {
      return err('Run migration 0009 before using the clone endpoint', 500);
    }
    return err('Failed to clone event: ' + msg, 500);
  }
}
