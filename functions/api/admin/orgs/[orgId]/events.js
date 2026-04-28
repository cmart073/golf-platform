import { normalizeGames, inferScoringMode, canUseDistributed } from '../../../../_format_registry.js';

function newId(prefix = '') { return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
function newToken(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join('');
}
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }
function now() { return new Date().toISOString(); }

export async function onRequestGet(context) {
  const db = context.env.DB;
  const orgId = context.params.orgId;
  const { results } = await db.prepare(
    'SELECT * FROM events WHERE org_id = ? ORDER BY created_at DESC'
  ).bind(orgId).all();
  return json(results);
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    const orgId = context.params.orgId;
    const body = await context.request.json();
    const {
      name, slug, date, holes, course_id, leaderboard_visible,
      event_type, enabled_games,
      scoring_mode, token_policy, branding_overrides,
    } = body;

    if (!name || !slug) return err('name and slug required');
    if (holes !== 9 && holes !== 18) return err('holes must be 9 or 18');
    if (!course_id) return err('course_id required');

    const course = await db.prepare(
      'SELECT id FROM courses WHERE id = ?'
    ).bind(course_id).first();
    if (!course) return err('course not found');

    const { results: courseHoles } = await db.prepare(
      'SELECT hole_number, par FROM course_holes WHERE course_id = ? AND hole_number <= ? ORDER BY hole_number'
    ).bind(course_id, holes).all();

    if (courseHoles.length < holes) {
      return err(`Course only has ${courseHoles.length} holes defined, need ${holes}`);
    }

    const safeEventType = event_type === 'weekly_match' ? 'weekly_match' : 'tournament';
    const normalized = normalizeGames(enabled_games);
    if (normalized.error) return err(normalized.error);
    const enabledGamesJson = JSON.stringify(normalized.games);

    // V2 fields. scoring_mode is an explicit organizer choice; if omitted we
    // fall back to the V1 inference (event_type→mode) so the legacy admin
    // form keeps working unchanged.
    let resolvedScoringMode;
    if (scoring_mode === 'single' || scoring_mode === 'distributed') {
      resolvedScoringMode = scoring_mode;
    } else {
      resolvedScoringMode = safeEventType === 'weekly_match'
        ? 'single'
        : inferScoringMode(normalized.games);
    }
    if (resolvedScoringMode === 'distributed' && !canUseDistributed(normalized.games)) {
      return err('Distributed scoring is not supported by the selected formats');
    }

    const safeTokenPolicy = ['never', 'on_complete', 'fixed'].includes(token_policy)
      ? token_policy
      : 'never';

    let brandingOverridesJson = null;
    if (branding_overrides && typeof branding_overrides === 'object') {
      brandingOverridesJson = JSON.stringify(branding_overrides);
    }

    // Generate a scorer token whenever the event will use single-scorer mode.
    // Keep event_type in sync with scoring_mode so V1 read paths still work.
    const needsScorerToken = resolvedScoringMode === 'single';
    const scorerToken = needsScorerToken ? newToken(32) : null;
    const persistedEventType = needsScorerToken ? 'weekly_match' : 'tournament';

    const eventId = newId('evt_');
    const timestamp = now();

    await db.prepare(
      `INSERT INTO events (
         id, org_id, course_id, slug, name, date, holes,
         leaderboard_visible, status, created_at,
         event_type, enabled_games_json, scorer_token,
         scoring_mode, token_policy, branding_overrides_json
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      eventId, orgId, course_id, slug, name,
      date || null, holes,
      leaderboard_visible !== undefined ? (leaderboard_visible ? 1 : 0) : 1,
      timestamp,
      persistedEventType,
      enabledGamesJson,
      scorerToken,
      resolvedScoringMode,
      safeTokenPolicy,
      brandingOverridesJson,
    ).run();

    const stmts = courseHoles.map((ch) =>
      db.prepare(
        'INSERT INTO event_holes (id, event_id, hole_number, par) VALUES (?, ?, ?, ?)'
      ).bind(newId('eh_'), eventId, ch.hole_number, ch.par)
    );
    await db.batch(stmts);

    return json({
      id: eventId, slug, name, holes, status: 'draft',
      scorer_token: scorerToken,
      scoring_mode: resolvedScoringMode,
      token_policy: safeTokenPolicy,
      enabled_games: normalized.games,
    }, 201);
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (msg.includes('UNIQUE constraint failed: events.org_id, events.slug')) {
      return err('Event slug already exists for this organization');
    }
    return err(`Failed to create event: ${msg}`, 500);
  }
}
