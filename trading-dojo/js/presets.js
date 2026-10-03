// presets.js — built-in strategies as serializable SOURCE STRINGS. They run through the
// exact same Web Worker + backtester pipeline as user code, so "beat baseline" is fair.
// Each source must define `function strategy(candles, ctx) { ... }`.

export const BASELINE = {
  id: 'baseline',
  name: 'Buy & Hold',
  blurb: 'Fully invested from the first bar. The fixed yardstick every stock is measured against.',
  source: `// Buy & Hold baseline — always target full long.
function strategy(candles, ctx) {
  return 1;
}`,
};

export const PRESETS = [
  {
    id: 'sma-cross',
    name: 'SMA Crossover',
    blurb: 'Go long when the fast 10-SMA crosses above the slow 30-SMA; flat on the cross under.',
    source: `// SMA Crossover — the default. Long on 10/30 golden cross, flat on death cross.
function strategy(candles, ctx) {
  const fast = () => ctx.sma(10);
  const slow = () => ctx.sma(30);
  if (ctx.crossover(fast, slow))  return 'buy';
  if (ctx.crossunder(fast, slow)) return 'sell';
  return 'hold';
}`,
  },
  {
    id: 'rsi-meanrev',
    name: 'RSI Mean-Reversion',
    blurb: 'Buy oversold (RSI < 30), exit when it recovers above 55. Likes choppy names.',
    source: `// RSI Mean-Reversion — fade the dips.
function strategy(candles, ctx) {
  const rsi = ctx.rsi(14);
  if (!isFinite(rsi)) return 'hold';
  if (rsi < 30) return 'buy';
  if (rsi > 55) return 'sell';
  return 'hold';
}`,
  },
  {
    id: 'donchian',
    name: 'Donchian Breakout',
    blurb: 'Long when price breaks the 20-bar high; exit on a break of the 10-bar low. Rides pumps.',
    source: `// Donchian Breakout — momentum on a channel break (uses the raw candle history).
function strategy(candles, ctx) {
  const n = candles.length;
  if (n < 21) return 'hold';
  let hh = -Infinity, ll = Infinity;
  for (let j = n - 21; j < n - 1; j++) hh = Math.max(hh, candles[j].h);
  for (let j = n - 11; j < n - 1; j++) ll = Math.min(ll, candles[j].l);
  const close = candles[n - 1].c;
  if (close > hh) return 'buy';
  if (close < ll) return 'sell';
  return 'hold';
}`,
  },
  {
    id: 'atr-trend',
    name: 'ATR Trailing Trend',
    blurb: 'Hold while above the 20-EMA with positive momentum; exit on a 2×ATR break or stalling.',
    source: `// ATR Trailing Trend — ride trends, exit on a volatility-scaled break.
function strategy(candles, ctx) {
  const ema20 = ctx.ema(20), atr14 = ctx.atr(14), roc10 = ctx.roc(10);
  if (!isFinite(ema20) || !isFinite(atr14)) return 'hold';
  if (ctx.position <= 0) {
    return (ctx.price > ema20 && roc10 > 0) ? 'buy' : 'hold';
  }
  return (ctx.price < ema20 - 2 * atr14 || roc10 < 0) ? 'sell' : 'hold';
}`,
  },
  {
    id: 'vol-surge',
    name: 'Volume-Surge Pump-Catcher',
    blurb: 'Long on a 2× volume spike up-day; take +15% or exit on the first down close.',
    source: `// Volume-Surge Pump-Catcher — chase the classic penny pump, cut fast.
function strategy(candles, ctx) {
  const n = candles.length;
  if (n < 21) return 'hold';
  let avg = 0;
  for (let j = n - 21; j < n - 1; j++) avg += candles[j].v;
  avg /= 20;
  const cur = candles[n - 1];
  if (ctx.position <= 0) {
    return (cur.v > 2 * avg && cur.c > cur.o) ? 'buy' : 'hold';
  }
  return (ctx.price >= ctx.entryPrice * 1.15 || cur.c < cur.o) ? 'sell' : 'hold';
}`,
  },
];

export const DEFAULT_STRATEGY_SOURCE = PRESETS[0].source;

export function presetById(id) {
  if (id === 'baseline') return BASELINE;
  return PRESETS.find(p => p.id === id) || PRESETS[0];
}
