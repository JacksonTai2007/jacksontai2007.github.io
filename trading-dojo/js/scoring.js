// scoring.js — the transparent 0–100 composite, tiers, and ELO. Single source of truth.
// Every sub-score, weight, and penalty here is surfaced in the in-app "score breakdown" sheet.

const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

export const WEIGHTS = { return: 0.30, sharpe: 0.30, drawdown: 0.20, winRate: 0.10, exposure: 0.10 };

// Returns { score, base, sub:{...}, penalties:{...}, tier } with full transparency.
export function score0to100(m) {
  // hard guard: a strategy that never trades a stock can't be ranked
  if (!m || m.tradeCount === 0) {
    return {
      score: 0, base: 0,
      sub: { sReturn: 0, sSharpe: 0, sDrawdown: 0, sWinRate: 0, sExposure: 0 },
      penalties: { trade: 0, flat: 0, blowup: 1 },
      tier: 'Unranked',
    };
  }

  const sub = {
    sReturn: clamp01((m.totalReturn + 0.25) / 0.75),   // -25% -> 0, +50% -> 1
    sSharpe: clamp01((m.sharpe + 0.5) / 3.0),          // -0.5 -> 0, +2.5 -> 1
    sDrawdown: clamp01(1 - m.maxDrawdown / 0.50),      // 0% -> 1, 50%+ -> 0
    sWinRate: clamp01((m.winRate - 0.30) / 0.40),      // 30% -> 0, 70% -> 1
    sExposure: clamp01(m.exposure / 0.60),             // monotone, saturates at 60%
  };

  const base = 100 * (
    WEIGHTS.return * sub.sReturn +
    WEIGHTS.sharpe * sub.sSharpe +
    WEIGHTS.drawdown * sub.sDrawdown +
    WEIGHTS.winRate * sub.sWinRate +
    WEIGHTS.exposure * sub.sExposure
  );

  const penalties = {
    trade: m.tradeCount < 3 ? 0.50 : (m.tradeCount < 8 ? 0.85 : 1.0), // distrust low-sample flukes
    flat: m.exposure < 0.02 ? 0.40 : 1.0,                              // never really traded
    blowup: m.maxDrawdown > 0.80 ? 0.60 : 1.0,                         // ruinous drawdown
  };

  let score = base * penalties.trade * penalties.flat * penalties.blowup;
  score = clamp(Math.round(score), 0, 100);
  return { score, base, sub, penalties, tier: tierFor(score) };
}

export const TIERS = [
  { name: 'Diamond', min: 80, color: '#7fe7ff' },
  { name: 'Platinum', min: 60, color: '#b9c4ff' },
  { name: 'Gold', min: 40, color: '#f5b942' },
  { name: 'Silver', min: 20, color: '#c8d0dc' },
  { name: 'Bronze', min: 0, color: '#cd853f' },
];
export function tierFor(score) {
  // 'Unranked' is reserved for the never-traded path (score0to100 sets it directly);
  // a strategy that traded to a rounded 0 is still Bronze (Bronze owns 0).
  if (score < 0) return 'Unranked';
  for (const t of TIERS) if (score >= t.min) return t.name;
  return 'Bronze';
}
export function tierColor(name) {
  const t = TIERS.find(x => x.name === name);
  return t ? t.color : '#8a97ad';
}

// ---- ELO ----
export const ELO_START = 1200;
export const BASELINE_ELO = 1200; // fixed, non-updating yardstick

function expected(a, b) { return 1 / (1 + Math.pow(10, (b - a) / 400)); }

// Update an ELO map { symbol: {elo, matches} } in place from one run's scores.
// runScores: [{symbol, score}], baselineScores: { symbol -> score } (buy&hold per stock).
// Each stock duels (1) the buy&hold baseline on the SAME stock (one-sided: baseline is a
// FIXED 1200 yardstick, only the stock moves — this is the intended source of net ELO
// movement), and (2) its score-rank neighbors (+1, +2) as SYMMETRIC pairwise duels
// (+d to A, -d to B with a shared K) so neighbor duels conserve ELO mass. K=40 while a
// symbol has fewer than 5 matches (fast placement), else 24.
export function eloUpdate(eloMap, runScores, baselineScores) {
  const ranked = [...runScores].sort((a, b) => b.score - a.score);
  const ensure = sym => { if (!eloMap[sym]) eloMap[sym] = { elo: ELO_START, matches: 0 }; return eloMap[sym]; };
  ranked.forEach(r => ensure(r.symbol));
  const kOf = sym => (eloMap[sym].matches < 5 ? 40 : 24);
  const delta = {}; ranked.forEach(r => (delta[r.symbol] = 0));
  const matchesPlayed = {}; ranked.forEach(r => (matchesPlayed[r.symbol] = 0));

  // (1) one-sided baseline duels
  for (const A of ranked) {
    const bScore = baselineScores[A.symbol];
    if (!Number.isFinite(bScore)) continue;
    const res = A.score > bScore ? 1 : (A.score === bScore ? 0.5 : 0);
    delta[A.symbol] += kOf(A.symbol) * (res - expected(eloMap[A.symbol].elo, BASELINE_ELO));
    matchesPlayed[A.symbol] += 1;
  }
  // (2) symmetric neighbor duels (each unique pair scored once)
  for (let i = 0; i < ranked.length; i++) {
    for (const j of [i + 1, i + 2]) {
      if (j >= ranked.length) continue;
      const A = ranked[i], B = ranked[j];
      const k = Math.min(kOf(A.symbol), kOf(B.symbol));
      const res = A.score > B.score ? 1 : (A.score === B.score ? 0.5 : 0);
      const d = k * (res - expected(eloMap[A.symbol].elo, eloMap[B.symbol].elo));
      delta[A.symbol] += d; delta[B.symbol] -= d;
      matchesPlayed[A.symbol] += 1; matchesPlayed[B.symbol] += 1;
    }
  }

  for (const A of ranked) {
    const a = eloMap[A.symbol];
    a.elo = clamp(Math.round(a.elo + delta[A.symbol]), 100, 3000);
    a.matches += matchesPlayed[A.symbol];
  }
  return eloMap;
}
