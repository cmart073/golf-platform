export function safeJsonArray(raw, fallback = []) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function toNum(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function buildScoreMaps(teams, scores) {
  const byTeamHole = {};
  teams.forEach((t) => { byTeamHole[t.id] = {}; });
  scores.forEach((s) => {
    byTeamHole[s.team_id] ||= {};
    byTeamHole[s.team_id][s.hole_number] = s.strokes;
  });
  return byTeamHole;
}

function strokePlay(teams, byTeamHole) {
  return teams.map((t) => {
    const vals = Object.values(byTeamHole[t.id] || {});
    const gross = vals.reduce((a, b) => a + b, 0);
    const net = gross - toNum(t.handicap_strokes, 0);
    return {
      team_id: t.id,
      team_name: t.team_name,
      gross_strokes: gross,
      handicap_strokes: toNum(t.handicap_strokes, 0),
      net_strokes: net,
      holes_scored: vals.length,
    };
  }).sort((a, b) => a.net_strokes - b.net_strokes);
}

function matchPlay(teams, byTeamHole, holeCount) {
  const points = {};
  teams.forEach((t) => { points[t.id] = 0; });

  for (let hole = 1; hole <= holeCount; hole++) {
    const holeScores = teams
      .map((t) => {
        const strokes = byTeamHole[t.id]?.[hole];
        if (!strokes) return null;
        const net = strokes - toNum(t.handicap_strokes, 0) / holeCount;
        return { team: t, net };
      })
      .filter(Boolean);

    if (holeScores.length < 2) continue;
    const best = Math.min(...holeScores.map((x) => x.net));
    const winners = holeScores.filter((x) => x.net === best);
    const award = 1 / winners.length;
    winners.forEach((w) => { points[w.team.id] += award; });
  }

  return teams.map((t) => ({
    team_id: t.id,
    team_name: t.team_name,
    points: Number(points[t.id].toFixed(2)),
  })).sort((a, b) => b.points - a.points);
}

function skins(teams, byTeamHole, holeCount) {
  const wins = {};
  teams.forEach((t) => { wins[t.id] = 0; });
  let carry = 1;

  for (let hole = 1; hole <= holeCount; hole++) {
    const holeScores = teams
      .map((t) => {
        const strokes = byTeamHole[t.id]?.[hole];
        if (!strokes) return null;
        const net = strokes - toNum(t.handicap_strokes, 0) / holeCount;
        return { team: t, net };
      })
      .filter(Boolean);
    if (holeScores.length < 2) continue;
    const best = Math.min(...holeScores.map((x) => x.net));
    const winners = holeScores.filter((x) => x.net === best);
    if (winners.length === 1) {
      wins[winners[0].team.id] += carry;
      carry = 1;
    } else {
      carry += 1;
    }
  }

  return teams.map((t) => ({
    team_id: t.id,
    team_name: t.team_name,
    skins_won: wins[t.id],
  })).sort((a, b) => b.skins_won - a.skins_won);
}

function manualGame(teams, manualPoints, gameType) {
  const totals = {};
  teams.forEach((t) => { totals[t.id] = 0; });
  manualPoints
    .filter((p) => p.game_type === gameType)
    .forEach((p) => { totals[p.team_id] = toNum(totals[p.team_id], 0) + toNum(p.points, 0); });

  return teams.map((t) => ({
    team_id: t.id,
    team_name: t.team_name,
    points: Number(toNum(totals[t.id], 0).toFixed(2)),
  })).sort((a, b) => b.points - a.points);
}

export function computeGameResults({ event, teams, scores, manualPoints }) {
  const enabled = safeJsonArray(event.enabled_games_json, ['stroke_play']);
  const holeCount = toNum(event.holes, 18);
  const byTeamHole = buildScoreMaps(teams, scores);

  const out = {};
  if (enabled.includes('stroke_play')) out.stroke_play = strokePlay(teams, byTeamHole);
  if (enabled.includes('match_play')) out.match_play = matchPlay(teams, byTeamHole, holeCount);
  if (enabled.includes('skins')) out.skins = skins(teams, byTeamHole, holeCount);
  if (enabled.includes('bingo')) out.bingo = manualGame(teams, manualPoints, 'bingo');
  if (enabled.includes('bango')) out.bango = manualGame(teams, manualPoints, 'bango');
  if (enabled.includes('bongo')) out.bongo = manualGame(teams, manualPoints, 'bongo');

  return out;
}
