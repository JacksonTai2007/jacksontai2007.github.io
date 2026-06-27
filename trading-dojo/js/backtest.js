// backtest.js — pure, deterministic, event-driven backtester (no RNG, no lookahead).
//
// Contract (judges' non-negotiables):
//   * A signal is decided on bar i using ONLY candles[0..i].
//   * The resulting position change FILLS at bar i+1's OPEN, with fees + slippage.
//   * The final bar never opens a new trade.
//   * Equity is marked-to-close each bar.
//   * Not-yet-listed leading bars => flat cash (no fake return: non-survivorship).
//
// The strategy function receives a defensively re-sliced history (candles.slice(0, i+1))
// so a strategy that stashes the array can never peek at the future.

import { SMA, EMA, RSI, ATR, HIGHEST, LOWEST, ROC, STDEV } from './indicators.js';
import { computeMetrics } from './metrics.js';

export const DEFAULT_CONFIG = {
  startCash: 10000,
  feeBps: 10,        // commission, charged on entry AND exit, per side
  slipBps: 15,       // slippage: buys fill higher, sells fill lower
  allowShort: false,
  rebalanceThreshold: 0.10, // ignore target changes smaller than 10% of equity (cuts churn)
};

// Build a frozen, memoized, lookahead-safe indicator context for one (listed) series.
function makeIndicatorCtx(listed) {
  const closes = listed.map(c => (c ? c.c : NaN));
  const highs = listed.map(c => (c ? c.h : NaN));
  const lows = listed.map(c => (c ? c.l : NaN));
  const cache = new Map();
  const get = (key, fn) => { let a = cache.get(key); if (!a) { a = fn(); cache.set(key, a); } return a; };

  let curI = 0;           // the bar the accessors read; crossover flips this to i-1 temporarily
  const at = arr => arr[curI];

  const series = {
    sma: p => at(get('sma' + p, () => SMA(closes, p))),
    ema: p => at(get('ema' + p, () => EMA(closes, p))),
    rsi: p => at(get('rsi' + p, () => RSI(closes, p))),
    atr: p => at(get('atr' + p, () => ATR(highs, lows, closes, p))),
    highest: p => at(get('hi' + p, () => HIGHEST(highs, p))),
    lowest: p => at(get('lo' + p, () => LOWEST(lows, p))),
    roc: p => at(get('roc' + p, () => ROC(closes, p))),
    stdev: p => at(get('std' + p, () => STDEV(closes, p))),
  };

  const evalAt = (fn, i) => {
    const saved = curI; curI = i;
    const val = typeof fn === 'function' ? fn() : fn;
    curI = saved;
    return val;
  };
  const crossover = (a, b) => {
    if (curI < 1) return false;
    const a0 = evalAt(a, curI - 1), b0 = evalAt(b, curI - 1);
    const a1 = evalAt(a, curI), b1 = evalAt(b, curI);
    return Number.isFinite(a0) && Number.isFinite(b0) && Number.isFinite(a1) && Number.isFinite(b1)
      && a0 <= b0 && a1 > b1;
  };
  const crossunder = (a, b) => {
    if (curI < 1) return false;
    const a0 = evalAt(a, curI - 1), b0 = evalAt(b, curI - 1);
    const a1 = evalAt(a, curI), b1 = evalAt(b, curI);
    return Number.isFinite(a0) && Number.isFinite(b0) && Number.isFinite(a1) && Number.isFinite(b1)
      && a0 >= b0 && a1 < b1;
  };

  return {
    setBar(i) { curI = i; },
    build(state) {
      return Object.freeze({
        i: curI,
        price: closes[curI],
        position: state.frac,
        cash: state.cash,
        equity: state.equity,
        entryPrice: state.entryPrice,
        allowShort: state.allowShort,
        sma: series.sma, ema: series.ema, rsi: series.rsi, atr: series.atr,
        highest: series.highest, lowest: series.lowest, roc: series.roc, stdev: series.stdev,
        crossover, crossunder,
        log: state.log,
      });
    },
  };
}

function normalizeSignal(raw, currentFrac, allowShort) {
  let target = currentFrac;
  if (raw === 'buy') target = 1;
  else if (raw === 'sell') target = 0;
  else if (raw === 'hold' || raw == null) target = currentFrac;
  else if (typeof raw === 'number') target = raw;
  else if (typeof raw === 'object') {
    const size = Number.isFinite(raw.size) ? raw.size : 1;
    if (raw.signal === 'buy') target = size;
    else if (raw.signal === 'sell') target = 0;
    else target = currentFrac;
  }
  if (!Number.isFinite(target)) target = currentFrac;
  if (!allowShort) target = Math.max(0, target);
  return Math.max(-1, Math.min(1, target));
}

// Run the strategy over ONE stock. `candles` is the full shared-axis array (may have
// leading nulls for late-listed names). Returns equity over the FULL axis (flat before
// listing) plus trades + metrics computed over the tradeable sub-range.
export function runForStock(candles, signalFn, config = DEFAULT_CONFIG) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const T = candles.length;
  const equityFull = new Float64Array(T);

  // first listed bar
  let start = candles.findIndex(c => c && Number.isFinite(c.o) && c.o > 0);
  if (start < 0) {
    equityFull.fill(cfg.startCash);
    return { equity: equityFull, trades: [], metrics: computeMetrics(equityFull, [], cfg.startCash), startBar: T };
  }
  for (let i = 0; i < start; i++) equityFull[i] = cfg.startCash;

  const listed = candles.slice(start);
  const m = listed.length;
  const ind = makeIndicatorCtx(listed);

  let cash = cfg.startCash;
  let shares = 0;           // signed
  let avgEntry = 0;         // avg entry price of the open position
  let entryFee = 0;         // fees paid opening current position
  let entryIdx = -1;
  const trades = [];
  const equityListed = new Float64Array(m);
  let pendingTarget = null; // fraction decided last bar, fills this bar's open
  let prevEquity = cfg.startCash;
  let barsInMarket = 0;
  let lastValidK = -1, lastClose = NaN;
  const logs = [];
  const log = (...a) => { if (logs.length < 50) logs.push(a.map(String).join(' ')); };

  for (let k = 0; k < m; k++) {
    const c = listed[k];
    if (!c || !Number.isFinite(c.c)) { equityListed[k] = prevEquity; continue; } // halt: carry

    // 1) execute pending order at THIS bar's open
    if (pendingTarget !== null && Number.isFinite(c.o) && c.o > 0) {
      const eqOpen = cash + shares * c.o;
      const curFrac = eqOpen > 0 ? (shares * c.o) / eqOpen : 0;
      if (Math.abs(pendingTarget - curFrac) > cfg.rebalanceThreshold || (pendingTarget === 0 && shares !== 0)) {
        const targetValue = pendingTarget * eqOpen;
        const targetShares = Math.trunc(targetValue / c.o);
        const delta = targetShares - shares;
        if (delta !== 0) {
          const dir = Math.sign(delta);
          const fill = c.o * (1 + dir * cfg.slipBps / 10000);
          const fee = Math.abs(delta) * fill * cfg.feeBps / 10000;
          // trade bookkeeping (zero-cross = close)
          const wasFlat = shares === 0;
          const crossesZero = shares !== 0 && Math.sign(targetShares) !== Math.sign(shares) && targetShares !== 0;
          if (wasFlat && targetShares !== 0) {
            avgEntry = fill; entryFee = fee; entryIdx = k;
          } else if (Math.sign(delta) === Math.sign(shares)) {
            // adding to same side -> weighted avg entry
            avgEntry = (avgEntry * Math.abs(shares) + fill * Math.abs(delta)) / Math.abs(targetShares);
            entryFee += fee;
          } else {
            // reducing or closing
            const closedShares = Math.min(Math.abs(delta), Math.abs(shares));
            const pnl = (fill - avgEntry) * closedShares * Math.sign(shares) - entryFee * (closedShares / Math.abs(shares)) - fee * (closedShares / Math.abs(delta));
            if (targetShares === 0 || crossesZero) {
              trades.push({ entryIdx: start + entryIdx, exitIdx: start + k, entryPx: avgEntry, exitPx: fill, pnl, bars: k - entryIdx });
            }
            if (crossesZero) { avgEntry = fill; entryFee = fee * (Math.abs(targetShares) / Math.abs(delta)); entryIdx = k; }
            else if (targetShares === 0) { avgEntry = 0; entryFee = 0; entryIdx = -1; }
          }
          cash -= delta * fill;
          cash -= fee;
          shares = targetShares;
        }
      }
      pendingTarget = null;
    }

    // 2) mark to close
    equityListed[k] = cash + shares * c.c;
    prevEquity = equityListed[k];
    lastValidK = k; lastClose = c.c;
    if (shares !== 0) barsInMarket++;

    // 3) decide for next bar (never on the last bar)
    if (k < m - 1) {
      ind.setBar(k);
      const eqNow = equityListed[k];
      const frac = eqNow > 0 ? (shares * c.c) / eqNow : 0;
      const ctx = ind.build({ frac, cash, equity: eqNow, entryPrice: avgEntry, allowShort: cfg.allowShort, log });
      let raw;
      try { raw = signalFn(listed.slice(0, k + 1), ctx); }
      catch (e) { throw new Error('strategy error @bar ' + (start + k) + ': ' + (e && e.message ? e.message : e)); }
      pendingTarget = normalizeSignal(raw, frac, cfg.allowShort);
    }
  }

  // mark any still-open position to the last close as a (paper) closing trade,
  // so buy & hold and any strategy still holding get proper trade credit.
  if (shares !== 0 && entryIdx >= 0 && Number.isFinite(lastClose)) {
    const pnl = (lastClose - avgEntry) * shares - entryFee;
    trades.push({ entryIdx: start + entryIdx, exitIdx: start + lastValidK, entryPx: avgEntry, exitPx: lastClose, pnl, bars: lastValidK - entryIdx, open: true });
  }

  for (let k = 0; k < m; k++) equityFull[start + k] = equityListed[k];

  const metrics = computeMetrics(equityListed, trades, cfg.startCash);
  metrics.exposure = m > 0 ? barsInMarket / m : 0;
  return { equity: equityFull, trades, metrics, startBar: start };
}
