// Canonical "event template" payload used for cloning and templates.
// An event template captures the *configuration* of a previous event —
// formats, scoring mode, branding, sponsors, betting config — but never
// captures instance-specific state (date, status, lock_at, teams, scores,
// tokens). Cloning an event = render template back into a new event row.
//
// Schema version is included so future template consumers can migrate
// older snapshots without a guess-and-check.

import { normalizeGames, canUseDistributed } from './_format_registry.js';

export const TEMPLATE_SCHEMA_VERSION = 1;

// Serialize an existing event row (+ optional sponsor rows + optional
// bet_config) into the canonical template shape. Missing/legacy fields
// fall back to safe V1 defaults.
export function extractTemplate(eventRow, sponsors = []) {
  if (!eventRow) throw new Error('extractTemplate: event required');

  let enabledGames;
  try {
    const parsed = JSON.parse(eventRow.enabled_games_json || '[]');
    enabledGames = Array.isArray(parsed) && parsed.length > 0 ? parsed : ['stroke_play'];
  } catch {
    enabledGames = ['stroke_play'];
  }

  let brandingOverrides = null;
  if (eventRow.branding_overrides_json) {
    try {
      const parsed = JSON.parse(eventRow.branding_overrides_json);
      if (parsed && typeof parsed === 'object') brandingOverrides = parsed;
    } catch { /* ignore malformed override JSON */ }
  }

  let betConfig = null;
  if (eventRow.bet_config_json) {
    try {
      const parsed = JSON.parse(eventRow.bet_config_json);
      if (parsed && typeof parsed === 'object') betConfig = parsed;
    } catch { /* ignore */ }
  }

  return {
    template_version: TEMPLATE_SCHEMA_VERSION,
    name: eventRow.name,
    course_id: eventRow.course_id,
    holes: eventRow.holes,
    leaderboard_visible: eventRow.leaderboard_visible !== 0,
    enabled_games: enabledGames,
    scoring_mode: eventRow.scoring_mode
      || (eventRow.event_type === 'weekly_match' ? 'single' : 'distributed'),
    token_policy: eventRow.token_policy || 'never',
    branding_overrides: brandingOverrides,
    bet_config: betConfig,
    jm_show_mulligans: eventRow.jm_show_mulligans !== 0,
    sponsors: (sponsors || []).map((s) => ({
      logo_url: s.logo_url,
      link_url: s.link_url || null,
      display_order: s.display_order ?? 0,
    })),
    source_event_id: eventRow.id,
  };
}

// Validate a template payload before applying it. Returns { ok: true } or
// { ok: false, error }.
export function validateTemplate(t) {
  if (!t || typeof t !== 'object') return { ok: false, error: 'template required' };
  if (typeof t.name !== 'string' || !t.name.trim()) return { ok: false, error: 'name required' };
  if (typeof t.course_id !== 'string' || !t.course_id) return { ok: false, error: 'course_id required' };
  if (t.holes !== 9 && t.holes !== 18) return { ok: false, error: 'holes must be 9 or 18' };

  const norm = normalizeGames(t.enabled_games);
  if (norm.error) return { ok: false, error: norm.error };

  if (t.scoring_mode && !['single', 'distributed'].includes(t.scoring_mode)) {
    return { ok: false, error: 'scoring_mode must be single or distributed' };
  }
  if (t.scoring_mode === 'distributed' && !canUseDistributed(norm.games)) {
    return { ok: false, error: 'distributed scoring not supported by selected formats' };
  }

  if (t.token_policy && !['never', 'on_complete', 'fixed'].includes(t.token_policy)) {
    return { ok: false, error: 'token_policy must be never, on_complete, or fixed' };
  }

  if (t.sponsors && !Array.isArray(t.sponsors)) {
    return { ok: false, error: 'sponsors must be an array' };
  }
  for (const s of t.sponsors || []) {
    if (!s || typeof s.logo_url !== 'string' || !s.logo_url) {
      return { ok: false, error: 'each sponsor needs a logo_url' };
    }
  }

  return { ok: true, normalized_games: norm.games };
}

// Build the request body shape expected by POST /api/admin/orgs/:orgId/events
// from a template. Caller supplies overrides like a new slug + date for the
// cloned event instance.
export function templateToCreatePayload(t, overrides = {}) {
  return {
    name: overrides.name ?? t.name,
    slug: overrides.slug,
    date: overrides.date ?? null,
    holes: t.holes,
    course_id: overrides.course_id ?? t.course_id,
    leaderboard_visible: overrides.leaderboard_visible ?? t.leaderboard_visible,
    enabled_games: t.enabled_games,
    scoring_mode: t.scoring_mode,
    token_policy: t.token_policy,
    branding_overrides: t.branding_overrides,
    // event_type is derived server-side from scoring_mode; included only so
    // the legacy admin form path keeps producing the same persisted value.
    event_type: t.scoring_mode === 'single' ? 'weekly_match' : 'tournament',
  };
}
