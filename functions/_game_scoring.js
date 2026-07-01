// ============================================================
// Game Scoring Engine — golf-platform
// Supports: stroke_play, match_play, skins, bingo/bango/bongo,
//           nassau, wolf, nine_points, jeff_martin
// Shotgun start: skins resolved in play order (wrap-around aware)
// ============================================================

export function safeJsonArray(raw, fallback = []) {
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : fallback; }
  catch { return fallback; }
}

export function safeJsonObj(raw, fallback = {}) {
  try { const p = JSON.parse(raw); return (p && typeof p === 'object' && !Array.isArray(p)) ? p : fallback; }
  catch { return fallback; }
}

function toNum(v, def = 0) { const n = Number(v); return Number.isFinite(n) ? n : def; }

function buildScoreMaps(teams, scores) {
  const byTeamHole = {};
  teams.forEach(t => { byTeamHole[t.id] = {}; });
  scores.forEach(s => {
    byTeamHole[s.team_id] ||= {};
    byTeamHole[s.team_id][s.hole_number] = s.strokes;
  });
  return byTeamHole;
}

function getRelativeHcps(teams) {
  const minHcp = Math.min(...teams.map(t => toNum(t.handicap_strokes, 0)));
  const map = {};
  teams.forEach(t => { map[t.id] = toNum(t.handicap_strokes, 0) - minHcp; });
  return map;
}

function netScoreForHole(strokes, relHcp, holeCount) {
  return strokes - relHcp / holeCount;
}

// ── Hole Order (shotgun wrap-around) ─────────────────────────
// Returns the ordered array of hole numbers a team plays given
// their starting hole. For a normal (non-shotgun) round, all
// teams start on hole 1 so this is just [1, 2, …, totalHoles].
//
// For a shotgun start with startingHole = 7, totalHoles = 18:
//   [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6]
export function getHoleOrder(startingHole = 1, totalHoles = 18) {
  const order = [];
  for (let i = 0; i < totalHoles; i++) {
    order.push(((startingHole - 1 + i) % totalHoles) + 1);
  }
  return order;
}

// ── Stroke Play ───────────────────────────────────────────────
function strokePlay(teams, byTeamHole) {
  return teams.map(t => {
    const vals = Object.values(byTeamHole[t.id] || {});
    const gross = vals.reduce((a, b) => a + b, 0);
    const net = gross - toNum(t.handicap_strokes, 0);
    return {
      team_id: t.id, team_name: t.team_name,
      gross_strokes: gross, handicap_strokes: toNum(t.handicap_strokes, 0),
      net_strokes: net, holes_scored: vals.length,
    };
  }).sort((a, b) => a.net_strokes - b.net_strokes);
}

// ── Match Play (generic range) ────────────────────────────────
function matchPlayRange(teams, byTeamHole, holeCount, startHole, endHole) {
  const relHcps = getRelativeHcps(teams);
  const points = {};
  teams.forEach(t => { points[t.id] = 0; });
  for (let hole = startHole; hole <= endHole; hole++) {
    const hs = teams.map(t => {
      const s = byTeamHole[t.id]?.[hole];
      if (s == null) return null;
      return { team: t, net: netScoreForHole(s, relHcps[t.id], holeCount) };
    }).filter(Boolean);
    if (hs.length < 2) continue;
    const best = Math.min(...hs.map(x => x.net));
    const winners = hs.filter(x => x.net === best);
    const award = 1 / winners.length;
    winners.forEach(w => { points[w.team.id] += award; });
  }
  return points;
}

function matchPlay(teams, byTeamHole, holeCount) {
  const pts = matchPlayRange(teams, byTeamHole, holeCount, 1, holeCount);
  return teams.map(t => ({
    team_id: t.id, team_name: t.team_name,
    points: Number((pts[t.id] || 0).toFixed(2)),
  })).sort((a, b) => b.points - a.points);
}

// ── Skins (play-order aware, gross, with carryover) ───────────
// For shotgun events, skins are resolved in the order teams actually
// play the holes — not in hole-number order. The holeOrder array
// encodes this. For non-shotgun events it is always [1…18].
//
// Returns two shapes:
//   summary[]  — { team_id, team_name, skins_won } sorted desc (existing shape)
//   detail[]   — per-hole: { hole_number, play_position, winner_team_id,
//                             winner_team_name, is_carryover, carry_pot,
//                             tied_teams[] }
//
// The existing `skins` key on computeGameResults is the summary array for
// backward compat. A new `skins_detail` key carries the full breakdown.
function skins(teams, byTeamHole, holeCount, holeOrder = null) {
  const relHcps = getRelativeHcps(teams);
  const wins = {};
  teams.forEach(t => { wins[t.id] = 0; });

  const playOrder = holeOrder || getHoleOrder(1, holeCount);
  const detail = [];
  let carry = 1;

  for (let pos = 0; pos < playOrder.length; pos++) {
    const hole = playOrder[pos];
    const hs = teams.map(t => {
      const s = byTeamHole[t.id]?.[hole];
      if (s == null) return null;
      // Gross skins (no handicap adjustment for outing-style gross skins)
      return { team: t, score: s };
    }).filter(Boolean);

    // Skip holes where not all teams have scored yet
    if (hs.length < 2) {
      detail.push({
        hole_number: hole,
        play_position: pos + 1,
        winner_team_id: null,
        winner_team_name: null,
        is_carryover: false,
        carry_pot: carry,
        tied_teams: [],
        status: 'pending',
      });
      continue;
    }

    const best = Math.min(...hs.map(x => x.score));
    const winners = hs.filter(x => x.score === best);
    const tied = hs.filter(x => x.score === best).map(x => ({
      team_id: x.team.id,
      team_name: x.team.team_name,
    }));

    if (winners.length === 1) {
      const w = winners[0];
      wins[w.team.id] += carry;
      detail.push({
        hole_number: hole,
        play_position: pos + 1,
        winner_team_id: w.team.id,
        winner_team_name: w.team.team_name,
        winner_score: best,
        is_carryover: carry > 1,
        carry_pot: carry,
        holes_collected: carry > 1
          ? playOrder.slice(pos - (carry - 1), pos + 1)
          : [hole],
        tied_teams: [],
        status: 'won',
      });
      carry = 1;
    } else {
      detail.push({
        hole_number: hole,
        play_position: pos + 1,
        winner_team_id: null,
        winner_team_name: null,
        is_carryover: true,
        carry_pot: carry,
        tied_teams: tied,
        status: 'tied',
      });
      carry += 1;
    }
  }

  // Any unresolved carry at end of round
  const unresolved = carry > 1;

  const summary = teams.map(t => ({
    team_id: t.id, team_name: t.team_name, skins_won: wins[t.id],
  })).sort((a, b) => b.skins_won - a.skins_won);

  return { summary, detail, unresolved_carry: unresolved ? carry - 1 : 0 };
}

// ── Bingo Bango Bongo ─────────────────────────────────────────
function bingoBangoBongo(teams, manualPoints) {
  const totals = {};
  teams.forEach(t => { totals[t.id] = 0; });
  manualPoints
    .filter(p => ['bingo', 'bango', 'bongo'].includes(p.game_type))
    .forEach(p => { totals[p.team_id] = toNum(totals[p.team_id], 0) + toNum(p.points, 0); });
  return teams.map(t => ({
    team_id: t.id, team_name: t.team_name,
    points: Number(toNum(totals[t.id], 0).toFixed(2)),
  })).sort((a, b) => b.points - a.points);
}

// ── Nassau ────────────────────────────────────────────────────
function nassau(teams, byTeamHole, holeCount, presses = []) {
  const front9End = Math.min(9, holeCount);
  const back9Start = holeCount > 9 ? 10 : 1;

  const front = matchPlayRange(teams, byTeamHole, holeCount, 1, front9End);
  const back = holeCount > 9 ? matchPlayRange(teams, byTeamHole, holeCount, back9Start, holeCount) : null;
  const overall = matchPlayRange(teams, byTeamHole, holeCount, 1, holeCount);

  const pressResults = [];
  presses.filter(p => p.game_type?.startsWith('nassau_')).forEach(press => {
    const startH = press.hole_number || 1;
    let endH;
    if (press.game_type === 'nassau_front') endH = front9End;
    else if (press.game_type === 'nassau_back') endH = holeCount;
    else endH = holeCount;
    if (startH <= endH) {
      const pts = matchPlayRange(teams, byTeamHole, holeCount, startH, endH);
      pressResults.push({
        game_type: press.game_type,
        pressed_by: press.team_id,
        pressed_by_name: teams.find(t => t.id === press.team_id)?.team_name || '?',
        from_hole: startH, to_hole: endH,
        results: teams.map(t => ({
          team_id: t.id, team_name: t.team_name, points: Number((pts[t.id] || 0).toFixed(2)),
        })).sort((a, b) => b.points - a.points),
      });
    }
  });

  const fmt = (pts) => teams.map(t => ({
    team_id: t.id, team_name: t.team_name, points: Number((pts[t.id] || 0).toFixed(2)),
  })).sort((a, b) => b.points - a.points);

  const result = { front: fmt(front), overall: fmt(overall) };
  if (back) result.back = fmt(back);
  if (pressResults.length > 0) result.presses = pressResults;
  return result;
}

// ── Wolf ──────────────────────────────────────────────────────
function wolf(teams, byTeamHole, holeCount, wolfPicks = []) {
  if (teams.length < 3) return null;
  const pts = {};
  teams.forEach(t => { pts[t.id] = 0; });
  const wolfMap = {};
  wolfPicks.forEach(wp => { wolfMap[wp.hole_number] = wp; });

  for (let hole = 1; hole <= holeCount; hole++) {
    const pick = wolfMap[hole];
    if (!pick) continue;
    const wolfId = pick.wolf_team_id;
    const partnerId = pick.partner_team_id;
    const isLone = !partnerId;
    const wolfScore = byTeamHole[wolfId]?.[hole];
    if (wolfScore == null) continue;

    if (isLone) {
      const opps = teams.filter(t => t.id !== wolfId);
      const oppScores = opps.map(t => byTeamHole[t.id]?.[hole]).filter(s => s != null);
      if (oppScores.length === 0) continue;
      const bestOpp = Math.min(...oppScores);
      if (wolfScore < bestOpp) {
        pts[wolfId] += 4 * opps.length;
        opps.forEach(t => { pts[t.id] -= 4; });
      } else if (wolfScore > bestOpp) {
        pts[wolfId] -= 4 * opps.length;
        opps.forEach(t => { if ((byTeamHole[t.id]?.[hole] ?? 99) <= bestOpp) pts[t.id] += 4; });
      }
    } else {
      const partnerScore = byTeamHole[partnerId]?.[hole];
      const wolfBest = Math.min(wolfScore, partnerScore ?? 99);
      const opps = teams.filter(t => t.id !== wolfId && t.id !== partnerId);
      const oppScores = opps.map(t => byTeamHole[t.id]?.[hole]).filter(s => s != null);
      if (oppScores.length === 0) continue;
      const bestOpp = Math.min(...oppScores);
      if (wolfBest < bestOpp) {
        pts[wolfId] += 2 * opps.length;
        pts[partnerId] += 2 * opps.length;
        opps.forEach(t => { pts[t.id] -= 2; });
      } else if (wolfBest > bestOpp) {
        pts[wolfId] -= 2 * opps.length;
        pts[partnerId] -= 2 * opps.length;
        opps.forEach(t => { pts[t.id] += 2; });
      }
    }
  }

  return {
    wolf_order: teams.map((t, i) => ({ team_id: t.id, team_name: t.team_name, order: i })),
    picks: wolfPicks.map(wp => ({
      hole_number: wp.hole_number, wolf: wp.wolf_team_id,
      wolf_name: teams.find(t => t.id === wp.wolf_team_id)?.team_name || '?',
      partner: wp.partner_team_id,
      partner_name: wp.partner_team_id ? (teams.find(t => t.id === wp.partner_team_id)?.team_name || '?') : 'LONE WOLF 🐺',
      is_lone_wolf: !wp.partner_team_id,
    })),
    standings: teams.map(t => ({
      team_id: t.id, team_name: t.team_name, points: pts[t.id],
    })).sort((a, b) => b.points - a.points),
  };
}

// ── 9 Points (Nines / Dots) ───────────────────────────────────
function ninePoints(teams, byTeamHole, holeCount) {
  const relHcps = getRelativeHcps(teams);
  const pts = {};
  teams.forEach(t => { pts[t.id] = 0; });

  for (let hole = 1; hole <= holeCount; hole++) {
    const hs = teams.map(t => {
      const s = byTeamHole[t.id]?.[hole];
      if (s == null) return null;
      return { team_id: t.id, net: netScoreForHole(s, relHcps[t.id], holeCount) };
    }).filter(Boolean);
    if (hs.length < 2) continue;
    hs.sort((a, b) => a.net - b.net);

    const groups = [];
    let curr = null;
    hs.forEach(h => {
      if (curr && curr.net === h.net) curr.ids.push(h.team_id);
      else { curr = { net: h.net, ids: [h.team_id] }; groups.push(curr); }
    });

    if (groups.length === 1) {
      const share = 9 / hs.length;
      hs.forEach(h => { pts[h.team_id] += share; });
    } else if (hs.length === 2) {
      pts[groups[0].ids[0]] += 6;
      pts[groups[1].ids[0]] += 3;
    } else if (hs.length === 3) {
      if (groups.length === 3) {
        pts[groups[0].ids[0]] += 5;
        pts[groups[1].ids[0]] += 3;
        pts[groups[2].ids[0]] += 1;
      } else if (groups.length === 2) {
        if (groups[0].ids.length === 1) {
          pts[groups[0].ids[0]] += 5;
          groups[1].ids.forEach(id => { pts[id] += 2; });
        } else {
          groups[0].ids.forEach(id => { pts[id] += 4; });
          pts[groups[1].ids[0]] += 1;
        }
      }
    } else {
      let rank = 0;
      const rankPts = [];
      groups.forEach(g => {
        const positions = [];
        for (let i = 0; i < g.ids.length; i++) positions.push(hs.length - 1 - (rank + i));
        const avg = positions.reduce((a, b) => a + b, 0) / positions.length;
        g.ids.forEach(id => { rankPts.push({ team_id: id, rk: avg }); });
        rank += g.ids.length;
      });
      const totalRank = rankPts.reduce((s, r) => s + r.rk, 0);
      if (totalRank > 0) rankPts.forEach(r => { pts[r.team_id] += (r.rk / totalRank) * 9; });
      else hs.forEach(h => { pts[h.team_id] += 9 / hs.length; });
    }
  }

  return teams.map(t => ({
    team_id: t.id, team_name: t.team_name, points: Number(pts[t.id].toFixed(1)),
  })).sort((a, b) => b.points - a.points);
}

// ── Jeff Martin (Modified Stableford scramble w/ "Your Hole" bonus) ──
export function stablefordPoints(diff) {
  if (diff >= 2) return 0;
  if (diff === 1) return 1;
  if (diff === 0) return 2;
  if (diff === -1) return 3;
  if (diff === -2) return 4;
  if (diff === -3) return 5;
  return 6;
}

function jeffMartin(teams, byTeamHole, holeCount, parByHole, yourHolesByTeam) {
  const rows = teams.map(t => {
    const yours = yourHolesByTeam?.[t.id] || {};
    const perHole = [];
    let totalPoints = 0;
    let birdies = 0, eagles = 0, pars = 0, yourHoleCount = 0;

    for (let h = 1; h <= holeCount; h++) {
      const strokes = byTeamHole[t.id]?.[h];
      if (strokes == null) {
        perHole.push({ hole: h, strokes: null, points: null, your_hole_player: yours[h] ?? null });
        continue;
      }
      const par = parByHole?.[h] ?? 4;
      const hasYourHole = yours[h] != null;
      const adjStrokes = hasYourHole ? strokes - 1 : strokes;
      const diff = adjStrokes - par;
      const pts = stablefordPoints(diff);

      if (hasYourHole) yourHoleCount++;
      if (diff === 0) pars++;
      if (diff === -1) birdies++;
      if (diff === -2) eagles++;

      totalPoints += pts;
      perHole.push({
        hole: h, strokes, adjusted_strokes: adjStrokes,
        points: pts, your_hole_player: yours[h] ?? null,
      });
    }

    return {
      team_id: t.id, team_name: t.team_name,
      points: totalPoints,
      holes_scored: perHole.filter(r => r.strokes != null).length,
      birdies, eagles, pars,
      your_hole_count: yourHoleCount,
      per_hole: perHole,
    };
  });

  return rows.sort((a, b) => b.points - a.points);
}


function applyMultiplier(results, multiplier) {
  if (!multiplier || multiplier <= 1) return results;
  if (!Array.isArray(results)) return results;
  return results.map(r => ({
    ...r,
    points: r.points != null ? Number((r.points * multiplier).toFixed(2)) : r.points,
    skins_won: r.skins_won != null ? r.skins_won * multiplier : undefined,
  }));
}

function applyPresses(teams, byTeamHole, holeCount, presses, gameType) {
  const gp = presses.filter(p => p.game_type === gameType);
  if (gp.length === 0) return [];
  return gp.map(press => {
    const startH = press.hole_number || 1;
    const pts = matchPlayRange(teams, byTeamHole, holeCount, startH, holeCount);
    return {
      game_type: gameType,
      pressed_by: press.team_id,
      pressed_by_name: teams.find(t => t.id === press.team_id)?.team_name || '?',
      from_hole: startH, to_hole: holeCount,
      results: teams.map(t => ({
        team_id: t.id, team_name: t.team_name, points: Number((pts[t.id] || 0).toFixed(2)),
      })).sort((a, b) => b.points - a.points),
    };
  });
}

// ── Main compute function ─────────────────────────────────────
// New optional param: holeOrder — ordered array of hole numbers
// representing play order (for shotgun starts). When not provided,
// holes play 1…holeCount as normal.
export function computeGameResults({
  event, teams, scores, manualPoints,
  presses = [], wolfPicks = [], multipliers = {},
  yourHoles = [], parByHole = null,
  holeOrder = null,  // NEW: optional play-order array for shotgun skins
}) {
  const enabled = safeJsonArray(event.enabled_games_json, ['stroke_play']);
  const holeCount = toNum(event.holes, 18);
  const byTeamHole = buildScoreMaps(teams, scores);
  const out = {};

  // Build yourHoles lookup: { team_id: { hole_number: player_index } }
  const yourHolesByTeam = {};
  yourHoles.forEach(y => {
    yourHolesByTeam[y.team_id] ||= {};
    yourHolesByTeam[y.team_id][y.hole_number] = y.player_index;
  });

  if (enabled.includes('stroke_play'))
    out.stroke_play = applyMultiplier(strokePlay(teams, byTeamHole), multipliers.stroke_play);

  if (enabled.includes('match_play')) {
    out.match_play = applyMultiplier(matchPlay(teams, byTeamHole, holeCount), multipliers.match_play);
    const mp = applyPresses(teams, byTeamHole, holeCount, presses, 'match_play');
    if (mp.length > 0) out.match_play_presses = mp;
  }

  if (enabled.includes('skins')) {
    const skinsResult = skins(teams, byTeamHole, holeCount, holeOrder);
    // Preserve existing summary array shape under 'skins' key for backward compat
    out.skins = applyMultiplier(skinsResult.summary, multipliers.skins);
    // Add detailed per-hole breakdown under new key
    out.skins_detail = skinsResult.detail;
    out.skins_unresolved_carry = skinsResult.unresolved_carry;
    const sp = applyPresses(teams, byTeamHole, holeCount, presses, 'skins');
    if (sp.length > 0) out.skins_presses = sp;
  }

  if (enabled.includes('bingo') && enabled.includes('bango') && enabled.includes('bongo'))
    out.bingo_bango_bongo = applyMultiplier(bingoBangoBongo(teams, manualPoints), multipliers.bingo_bango_bongo);

  if (enabled.includes('nassau')) {
    out.nassau = nassau(teams, byTeamHole, holeCount, presses);
    const m = multipliers.nassau;
    if (m && m > 1) {
      if (out.nassau.front) out.nassau.front = applyMultiplier(out.nassau.front, m);
      if (out.nassau.back) out.nassau.back = applyMultiplier(out.nassau.back, m);
      if (out.nassau.overall) out.nassau.overall = applyMultiplier(out.nassau.overall, m);
    }
  }

  if (enabled.includes('wolf')) {
    const wr = wolf(teams, byTeamHole, holeCount, wolfPicks);
    if (wr) {
      if (multipliers.wolf > 1) wr.standings = applyMultiplier(wr.standings, multipliers.wolf);
      out.wolf = wr;
    }
  }

  if (enabled.includes('nine_points'))
    out.nine_points = applyMultiplier(ninePoints(teams, byTeamHole, holeCount), multipliers.nine_points);

  if (enabled.includes('jeff_martin'))
    out.jeff_martin = jeffMartin(teams, byTeamHole, holeCount, parByHole, yourHolesByTeam);

  return out;
}
