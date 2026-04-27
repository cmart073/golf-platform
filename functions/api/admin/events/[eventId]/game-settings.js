import { normalizeGames, inferScoringMode, canUseDistributed } from '../../../../_format_registry.js';

function newToken(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join('');
}
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function err(message, status = 400) { return json({ error: message }, status); }

// Builds a SET clause from an object of column→value pairs, returning both
// the SQL fragment and the bound values in matching order. Caller is
// responsible for placing the WHERE id = ? bind at the end.
function buildSet(pairs) {
  const cols = Object.keys(pairs);
  return {
    fragment: cols.map((c) => `${c} = ?`).join(', '),
    values: cols.map((c) => pairs[c]),
  };
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  const eventId = context.params.eventId;
  const body = await context.request.json();
  const {
    event_type, enabled_games, jm_show_mulligans,
    scoring_mode, token_policy, branding_overrides,
  } = body;

  const normalized = normalizeGames(enabled_games);
  if (normalized.error) return err(normalized.error);
  const enabledGamesJson = JSON.stringify(normalized.games);

  const event = await db.prepare('SELECT id, scorer_token FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return err('Event not found', 404);

  // Resolve scoring mode: explicit organizer choice wins; otherwise derive
  // from event_type (V1 form) or from the format mix.
  let resolvedScoringMode;
  if (scoring_mode === 'single' || scoring_mode === 'distributed') {
    resolvedScoringMode = scoring_mode;
  } else if (event_type === 'weekly_match') {
    resolvedScoringMode = 'single';
  } else if (event_type === 'tournament') {
    resolvedScoringMode = inferScoringMode(normalized.games);
  } else {
    resolvedScoringMode = inferScoringMode(normalized.games);
  }
  if (resolvedScoringMode === 'distributed' && !canUseDistributed(normalized.games)) {
    return err('Distributed scoring is not supported by the selected formats');
  }

  const needsScorerToken = resolvedScoringMode === 'single';
  const persistedEventType = needsScorerToken ? 'weekly_match' : 'tournament';
  let scorerToken = event.scorer_token;
  if (needsScorerToken && !scorerToken) scorerToken = newToken(32);
  if (!needsScorerToken) scorerToken = null;

  const showMulligans = jm_show_mulligans === false || jm_show_mulligans === 0 ? 0 : 1;

  // Always-present columns (V1 schema). The two columns added in later
  // migrations (0008 jm_show_mulligans, 0009 scoring_mode/token_policy/
  // branding_overrides_json) are appended below if their migration has run
  // — we probe by attempting the wider UPDATE first and falling back when
  // the DB rejects an unknown column.
  const baseCols = {
    event_type: persistedEventType,
    enabled_games_json: enabledGamesJson,
    scorer_token: scorerToken,
  };

  const v0008Cols = { ...baseCols, jm_show_mulligans: showMulligans };

  const safeTokenPolicy = ['never', 'on_complete', 'fixed'].includes(token_policy)
    ? token_policy
    : null;
  let brandingOverridesJson = null;
  if (branding_overrides && typeof branding_overrides === 'object') {
    brandingOverridesJson = JSON.stringify(branding_overrides);
  }

  const v0009Cols = {
    ...v0008Cols,
    scoring_mode: resolvedScoringMode,
    ...(safeTokenPolicy ? { token_policy: safeTokenPolicy } : {}),
    ...(branding_overrides !== undefined ? { branding_overrides_json: brandingOverridesJson } : {}),
  };

  // Try widest schema first, then degrade column-set by column-set as we
  // hit "no such column" errors. Each layer keeps the values that *did*
  // make it in so the legacy UI doesn't get mystery half-saves.
  const layers = [v0009Cols, v0008Cols, baseCols];
  let appliedLayer = null;
  let lastError = null;
  for (const cols of layers) {
    const { fragment, values } = buildSet(cols);
    try {
      await db.prepare(`UPDATE events SET ${fragment} WHERE id = ?`)
        .bind(...values, eventId).run();
      appliedLayer = cols;
      break;
    } catch (e) {
      const msg = String(e?.message || e);
      lastError = msg;
      if (!/no such column/i.test(msg)) {
        return err('Database error: ' + msg, 500);
      }
      // fall through to next layer
    }
  }
  if (!appliedLayer) {
    return err('Database error: ' + (lastError || 'unknown'), 500);
  }

  return json({
    success: true,
    event_type: persistedEventType,
    enabled_games: JSON.parse(enabledGamesJson),
    scorer_token: scorerToken,
    jm_show_mulligans: !!showMulligans,
    scoring_mode: appliedLayer.scoring_mode || resolvedScoringMode,
    token_policy: appliedLayer.token_policy || null,
    branding_overrides: branding_overrides ?? null,
    schema_level:
      appliedLayer === v0009Cols ? '0009'
      : appliedLayer === v0008Cols ? '0008'
      : 'base',
  });
}
