// Canonical registry for game formats supported by the platform.
// Single source of truth for: validation, UI metadata, scoring-mode
// inference, and BBB-style auto-expansion. Imported by event create/edit
// APIs and (over time) by the React scorecard renderer.

// Scoring models drive which scorecard UI is shown:
//   'team_card'  → one card per team, team's accessToken (V1 ScoreEntry.jsx)
//   'group_card' → one card for the whole group, scorerToken     (V1 MatchScorer.jsx)
// `default_mode` is what we pre-select; `supports_distributed` controls
// whether the organizer is allowed to flip the event to per-team entry.
export const FORMATS = [
  {
    id: 'stroke_play',
    label: 'Stroke Play',
    description: 'Total strokes (gross/net) over the round.',
    default_mode: 'team_card',
    supports_distributed: true,
    is_side_game: false,
    auto_includes: [],
    conflicts_with: ['match_play'],
  },
  {
    id: 'match_play',
    label: 'Match Play',
    description: 'Best net score wins each hole; ties split.',
    default_mode: 'group_card',
    supports_distributed: false,
    is_side_game: false,
    auto_includes: [],
    conflicts_with: ['stroke_play'],
  },
  {
    id: 'skins',
    label: 'Skins',
    description: 'Outright low score wins the hole; ties carry over.',
    default_mode: 'group_card',
    supports_distributed: true,
    is_side_game: true,
    auto_includes: [],
    conflicts_with: [],
  },
  {
    id: 'bingo',
    label: 'Bingo (first on green)',
    description: 'Manually-awarded per-hole point.',
    default_mode: 'group_card',
    supports_distributed: false,
    is_side_game: true,
    auto_includes: ['bango', 'bongo'],
    conflicts_with: [],
    bbb_member: true,
  },
  {
    id: 'bango',
    label: 'Bango (closest to pin)',
    description: 'Manually-awarded per-hole point.',
    default_mode: 'group_card',
    supports_distributed: false,
    is_side_game: true,
    auto_includes: ['bingo', 'bongo'],
    conflicts_with: [],
    bbb_member: true,
  },
  {
    id: 'bongo',
    label: 'Bongo (first in hole)',
    description: 'Manually-awarded per-hole point.',
    default_mode: 'group_card',
    supports_distributed: false,
    is_side_game: true,
    auto_includes: ['bingo', 'bango'],
    conflicts_with: [],
    bbb_member: true,
  },
  {
    id: 'nassau',
    label: 'Nassau',
    description: 'Front 9, back 9, and overall match-play points.',
    default_mode: 'group_card',
    supports_distributed: false,
    is_side_game: true,
    auto_includes: [],
    conflicts_with: [],
  },
  {
    id: 'wolf',
    label: 'Wolf',
    description: 'Rotating wolf picks a partner or goes lone.',
    default_mode: 'group_card',
    supports_distributed: false,
    is_side_game: true,
    auto_includes: [],
    conflicts_with: [],
  },
  {
    id: 'nine_points',
    label: 'Nine Points',
    description: '9 points per hole split by finishing order.',
    default_mode: 'group_card',
    supports_distributed: false,
    is_side_game: true,
    auto_includes: [],
    conflicts_with: [],
  },
  {
    id: 'jeff_martin',
    label: 'Jeff Martin (Stableford scramble)',
    description: 'Modified Stableford scramble with "your hole" + mulligans.',
    default_mode: 'team_card',
    supports_distributed: true,
    is_side_game: false,
    auto_includes: [],
    conflicts_with: [],
  },
];

const FORMAT_BY_ID = Object.fromEntries(FORMATS.map((f) => [f.id, f]));

export function getFormat(id) {
  return FORMAT_BY_ID[id] || null;
}

export function isValidFormat(id) {
  return Boolean(FORMAT_BY_ID[id]);
}

// Validates and normalizes the organizer's enabled-games selection.
// Returns { error } on conflict, otherwise { games: string[] }.
//
// Rules:
//   - Drops unknown ids
//   - Returns ['stroke_play'] when nothing valid was supplied
//   - Enforces every conflicts_with edge
//   - Auto-expands BBB members so { bingo } → { bingo, bango, bongo }
export function normalizeGames(input) {
  const filtered = Array.isArray(input)
    ? input.filter(isValidFormat)
    : [];
  const set = new Set(filtered.length > 0 ? filtered : ['stroke_play']);

  for (const id of Array.from(set)) {
    const fmt = FORMAT_BY_ID[id];
    for (const other of fmt.conflicts_with) {
      if (set.has(other)) {
        return { error: `Choose either ${id} or ${other}, not both` };
      }
    }
    for (const auto of fmt.auto_includes) {
      set.add(auto);
    }
  }

  return { games: Array.from(set) };
}

// Infer the canonical scoring mode for a given enabled-games selection.
//
//   - If any selected format requires group_card (no support for distributed),
//     the event must use 'single' scoring.
//   - Otherwise default to 'distributed' (team cards) when stroke_play or
//     jeff_martin is the primary format; else 'single'.
//
// V2 organizers can override with an explicit toggle, but only if every
// selected format reports supports_distributed=true.
export function inferScoringMode(games) {
  const ids = Array.isArray(games) ? games : [];
  const formats = ids.map(getFormat).filter(Boolean);
  if (formats.length === 0) return 'distributed';

  const requiresGroup = formats.some((f) => !f.supports_distributed);
  if (requiresGroup) return 'single';

  const hasTeamCardPrimary = formats.some(
    (f) => !f.is_side_game && f.default_mode === 'team_card',
  );
  return hasTeamCardPrimary ? 'distributed' : 'single';
}

// Whether the organizer is allowed to flip the event to distributed
// (per-team) scoring given the current format selection.
export function canUseDistributed(games) {
  const ids = Array.isArray(games) ? games : [];
  if (ids.length === 0) return true;
  return ids
    .map(getFormat)
    .filter(Boolean)
    .every((f) => f.supports_distributed);
}

// Public-facing list (drop internal-only fields) for the wizard / UI.
export function listFormatsForUI() {
  return FORMATS.map((f) => ({
    id: f.id,
    label: f.label,
    description: f.description,
    is_side_game: f.is_side_game,
    default_mode: f.default_mode,
    supports_distributed: f.supports_distributed,
    bbb_member: Boolean(f.bbb_member),
    conflicts_with: f.conflicts_with,
  }));
}
