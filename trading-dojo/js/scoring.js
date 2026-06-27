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
  if (score <= 0) return 'Unranked';
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
// Each stock duels (1) the buy&hold baseline on the SAME stock, and (2) its 4 nearest
// score-ranked neighbors (±2). Placement K=40 for first 5 matches, then K=24.
export function eloUpdate(eloMap, runScores, baselineScores) {
  const ranked = [...runScores].sort((a, b) => b.score - a.score);
  const deltas = new Map();
  const ensure = sym => { if (!eloMap[sym]) eloMap[sym] = { elo: ELO_START, matches: 0 }; return eloMap[sym]; };

  for (let i = 0; i < ranked.length; i++) {
    const A = ranked[i];
    const a = ensure(A.symbol);
    const kA = a.matches < 5 ? 40 : 24;
    let dA = 0;

    // (1) baseline duel
    const bScore = baselineScores[A.symbol];
    if (Number.isFinite(bScore)) {
      const res = A.score > bScore ? 1 : (A.score === bScore ? 0.5 : 0);
      dA += kA * (res - expected(a.elo, BASELINE_ELO));
    }
    // (2) neighbor duels (±2)
    for (const j of [i - 2, i - 1, i + 1, i + 2]) {
      if (j < 0 || j >= ranked.length) continue;
      const B = ranked[j];
      const b = ensure(B.symbol);
      const res = A.score > B.score ? 1 : (A.score === B.score ? 0.5 : 0);
      dA += kA * (res - expected(a.elo, b.elo));
    }
    deltas.set(A.symbol, dA);
  }

  for (const A of ranked) {
    const a = eloMap[A.symbol];
    a.elo = clamp(Math.round(a.elo + (deltas.get(A.symbol) || 0)), 100, 3000);
    a.matches += 1;
  }
  return eloMap;
}
