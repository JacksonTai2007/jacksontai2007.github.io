// indicators.js — pure, causal, lookahead-safe technical indicators.
// Every function takes a numeric array (oldest-first) and returns an index-aligned
// array of the same length. Values are NaN until the indicator is "warmed up".
// Because every indicator at bar i depends only on values[0..i], precomputing over
// the full series and reading index i is identical to computing on the slice [0..i]
// — i.e. there is no lookahead.

export function SMA(values, period) {
  const n = values.length, out = new Array(n).fill(NaN);
  if (period <= 0) return out;
  let sum = 0, count = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (Number.isFinite(v)) { sum += v; count++; }
    if (i >= period) {
      const old = values[i - period];
      if (Number.isFinite(old)) { sum -= old; count--; }
    }
    if (i >= period - 1 && count === period) out[i] = sum / period;
  }
  return out;
}

export function EMA(values, period) {
  const n = values.length, out = new Array(n).fill(NaN);
  if (period <= 0) return out;
  const k = 2 / (period + 1);
  let ema = NaN, seeded = false, warm = 0, seedSum = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) { out[i] = seeded ? ema : NaN; continue; }
    if (!seeded) {
      seedSum += v; warm++;
      if (warm === period) { ema = seedSum / period; seeded = true; out[i] = ema; }
    } else {
      ema = v * k + ema * (1 - k);
      out[i] = ema;
    }
  }
  return out;
}

// Wilder's RSI.
export function RSI(values, period) {
  const n = values.length, out = new Array(n).fill(NaN);
  if (period <= 0) return out;
  let avgGain = 0, avgLoss = 0, warm = 0;
  let prev = NaN;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) { continue; }
    if (!Number.isFinite(prev)) { prev = v; continue; }
    const change = v - prev; prev = v;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    warm++;
    if (warm <= period) {
      avgGain += gain; avgLoss += loss;
      if (warm === period) {
        avgGain /= period; avgLoss /= period;
        out[i] = rsiFrom(avgGain, avgLoss);
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      out[i] = rsiFrom(avgGain, avgLoss);
    }
  }
  return out;
}
function rsiFrom(avgGain, avgLoss) {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// Wilder's ATR. Needs high/low/close arrays.
export function ATR(highs, lows, closes, period) {
  const n = closes.length, out = new Array(n).fill(NaN);
  if (period <= 0) return out;
  let atr = NaN, warm = 0, trSum = 0, prevClose = NaN;
  for (let i = 0; i < n; i++) {
    const h = highs[i], l = lows[i], c = closes[i];
    if (!Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) { continue; }
    const tr = Number.isFinite(prevClose)
      ? Math.max(h - l, Math.abs(h - prevClose), Math.abs(l - prevClose))
      : h - l;
    prevClose = c;
    warm++;
    if (warm <= period) {
      trSum += tr;
      if (warm === period) { atr = trSum / period; out[i] = atr; }
    } else {
      atr = (atr * (period - 1) + tr) / period;
      out[i] = atr;
    }
  }
  return out;
}

// Highest / lowest of the prior `period` values INCLUDING the current bar.
export function HIGHEST(values, period) {
  const n = values.length, out = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (i < period - 1) continue;
    let m = -Infinity, ok = true;
    for (let j = i - period + 1; j <= i; j++) {
      const v = values[j];
      if (!Number.isFinite(v)) { ok = false; break; }
      if (v > m) m = v;
    }
    if (ok) out[i] = m;
  }
  return out;
}
export function LOWEST(values, period) {
  const n = values.length, out = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (i < period - 1) continue;
    let m = Infinity, ok = true;
    for (let j = i - period + 1; j <= i; j++) {
      const v = values[j];
      if (!Number.isFinite(v)) { ok = false; break; }
      if (v < m) m = v;
    }
    if (ok) out[i] = m;
  }
  return out;
}

// Rate of change over `period` bars, as a fraction (e.g. 0.1 = +10%).
export function ROC(values, period) {
  const n = values.length, out = new Array(n).fill(NaN);
  for (let i = period; i < n; i++) {
    const a = values[i - period], b = values[i];
    if (Number.isFinite(a) && Number.isFinite(b) && a !== 0) out[i] = b / a - 1;
  }
  return out;
}

// Rolling sample standard deviation over `period` bars.
export function STDEV(values, period) {
  const n = values.length, out = new Array(n).fill(NaN);
  if (period <= 1) return out;
  for (let i = period - 1; i < n; i++) {
    let sum = 0, ok = true;
    for (let j = i - period + 1; j <= i; j++) {
      const v = values[j];
      if (!Number.isFinite(v)) { ok = false; break; }
      sum += v;
    }
    if (!ok) continue;
    const mean = sum / period;
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) { const d = values[j] - mean; sq += d * d; }
    out[i] = Math.sqrt(sq / (period - 1));
  }
  return out;
}
