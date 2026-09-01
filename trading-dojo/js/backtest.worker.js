// backtest.worker.js — module Web Worker. Runs user/preset strategy code OFF the main
// thread. Strategy code is treated as UNTRUSTED-BUT-SAME-ORIGIN (it's the user's own code
// in their own browser): we shadow the obvious network/DOM/eval identifiers so casual access
// fails and isolate errors per stock, but identifier-shadowing is not an airtight sandbox
// (e.g. dynamic import() is syntax, not an identifier). There is no other user's data here,
// so the blast radius is the user's own session. The page can terminate+respawn this worker
// on a global timeout to recover from infinite loops.

import { runForStock, DEFAULT_CONFIG } from './backtest.js';
import { score0to100 } from './scoring.js';
import { BASELINE } from './presets.js';

let UNIVERSE = null;       // { dates, stocks:[{symbol,name,meta,candles:[{t,o,h,l,c,v,i}]}] }
const MAX_POINTS = 240;

// Convert compact parallel arrays -> per-stock candle objects ONCE on init.
function ingest(universe) {
  const dates = universe.dates;
  const stocks = universe.stocks.map(s => {
    const n = dates.length;
    const candles = new Array(n);
    for (let i = 0; i < n; i++) {
      const o = s.o[i];
      // FROZEN: candles are built once and shared across runs/stocks; freezing makes a strategy's
      // in-place write throw (caught per-stock) instead of silently corrupting the universe.
      candles[i] = (o == null) ? null : Object.freeze({ t: dates[i], o, h: s.h[i], l: s.l[i], c: s.c[i], v: s.v[i], i });
    }
    return { symbol: s.symbol, name: s.name, meta: s.meta, candles };
  });
  return { dates, stocks };
}

// Compile strategy source in a scope where network/DOM/global identifiers are shadowed undefined.
const SHADOW = ['self', 'globalThis', 'window', 'document', 'postMessage', 'importScripts',
  'fetch', 'XMLHttpRequest', 'WebSocket', 'Worker', 'SharedWorker', 'indexedDB', 'caches',
  'localStorage', 'navigator', 'location', 'Function', 'setTimeout', 'setInterval',
  'queueMicrotask', 'Request', 'Response', 'AbortController', 'BroadcastChannel'];
// NB: 'eval'/'arguments' are illegal as strict-mode parameter names, so they cannot be
// shadowed this way; blocking eval would require a CSP (not available on static GitHub Pages).
function compile(source) {
  const make = new Function(...SHADOW,
    '"use strict";\n' + source + '\n;if (typeof strategy !== "function") throw new Error("define function strategy(candles, ctx)");\nreturn strategy;');
  return make(...SHADOW.map(() => undefined));
}

function downsample(equity) {
  const T = equity.length;
  if (T <= MAX_POINTS) return Array.from(equity);
  const step = (T - 1) / (MAX_POINTS - 1);
  const out = new Array(MAX_POINTS);
  for (let i = 0; i < MAX_POINTS; i++) out[i] = equity[Math.round(i * step)];
  out[MAX_POINTS - 1] = equity[T - 1];
  return out;
}

function runStrategyOverUniverse(strategyFn, config, runId) {
  const stocks = UNIVERSE.stocks;
  const results = [];
  for (let s = 0; s < stocks.length; s++) {
    const st = stocks[s];
    let entry;
    try {
      const r = runForStock(st.candles, strategyFn, config);
      const sc = score0to100(r.metrics);
      entry = {
        symbol: st.symbol, name: st.name, meta: st.meta,
        metrics: r.metrics, score: sc.score, scoreDetail: sc,
        equity: downsample(r.equity), startBar: r.startBar, dnf: false,
        trades: r.trades.slice(0, 60),
      };
    } catch (e) {
      entry = {
        symbol: st.symbol, name: st.name, meta: st.meta,
        metrics: null, score: 0, scoreDetail: { score: 0, tier: 'Unranked', error: String(e && e.message || e) },
        equity: [config.startCash], startBar: 0, dnf: true, error: String(e && e.message || e), trades: [],
      };
    }
    results.push(entry);
    if (s % 10 === 0) postMessage({ type: 'progress', runId, done: s + 1, total: stocks.length });
  }
  return results;
}

self.onmessage = (ev) => {
  const msg = ev.data || {};
  if (msg.type === 'init') {
    UNIVERSE = ingest(msg.universe);
    postMessage({ type: 'ready', stocks: UNIVERSE.stocks.length });
    return;
  }
  if (msg.type === 'run') {
    const runId = msg.runId;
    const config = { ...DEFAULT_CONFIG, ...(msg.config || {}) };
    if (!UNIVERSE) { postMessage({ type: 'error', runId, message: 'universe not loaded' }); return; }
    let strategyFn;
    try { strategyFn = compile(msg.strategySource); }
    catch (e) { postMessage({ type: 'error', runId, message: 'compile error: ' + (e && e.message || e) }); return; }

    let baselineFn;
    try { baselineFn = compile(BASELINE.source); } catch { baselineFn = () => 1; }

    const results = runStrategyOverUniverse(strategyFn, config, runId);
    // baseline scores per stock (for ELO baseline duel + duel view)
    const baseResults = runStrategyOverUniverse(baselineFn, config, runId);
    const baselineScores = {};
    const baselineEquity = {};
    for (const b of baseResults) { baselineScores[b.symbol] = b.score; baselineEquity[b.symbol] = b.equity; }

    postMessage({
      type: 'result', runId,
      results, baselineScores, baselineEquity,
      config,
    });
  }
};
