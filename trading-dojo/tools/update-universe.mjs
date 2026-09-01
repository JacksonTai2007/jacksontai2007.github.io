#!/usr/bin/env node
// update-universe.mjs — refresh the baked universe with REAL $0.50–$5 US stock data.
// Runs in CI (GitHub Actions) where the network is open. Uses Financial Modeling Prep (FMP):
// a server-side price screener (the correct $0.50–$5 screen a browser can't do cheaply) plus
// EOD historical prices.
//
// Requires env FMP_API_KEY. Writes data/universe.json + data/meta.json + data/candidates.json
// with dataKind='real'. A VALIDATION GATE aborts WITHOUT writing if anything looks wrong, so a
// bad fetch never replaces good data.
//
//   FMP_API_KEY=xxxx node trading-dojo/tools/update-universe.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
const KEY = process.env.FMP_API_KEY;
const BASE = 'https://financialmodelingprep.com/api/v3';

const PRICE_MIN = 0.50, PRICE_MAX = 5.00;
const TARGET = 120;          // cap universe size (by liquidity)
const MIN_BARS = 200;        // require this many valid bars
const HISTORY_DAYS = 420;    // ~2 trading years of calendar days lookback window
const CONCURRENCY = 4;

if (!KEY) { console.error('FATAL: FMP_API_KEY not set'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const round = (x, dp) => { const p = 10 ** dp; return Math.round(x * p) / p; };

async function getJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 429) { await sleep(1500 * (i + 1)); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(800 * (i + 1));
    }
  }
}

async function screenUniverse() {
  const url = `${BASE}/stock-screener?priceMoreThan=${PRICE_MIN}&priceLowerThan=${PRICE_MAX}` +
    `&exchange=NASDAQ,NYSE,AMEX&country=US&isActivelyTrading=true&limit=600&apikey=${KEY}`;
  const rows = await getJson(url);
  if (!Array.isArray(rows)) throw new Error('screener returned non-array');
  return rows
    .filter(r => !r.isEtf && !r.isFund && r.symbol && /^[A-Z]{1,5}$/.test(r.symbol))
    .map(r => ({ symbol: r.symbol, name: r.companyName || r.symbol, exchange: r.exchangeShortName, sector: r.sector || '', price: r.price, dollarVol: (r.price || 0) * (r.volume || 0) }))
    .sort((a, b) => b.dollarVol - a.dollarVol)           // most liquid first
    .slice(0, TARGET + 60);                               // headroom for ones that fail history
}

const today = new Date();
const from = new Date(today.getTime() - HISTORY_DAYS * 86400000).toISOString().slice(0, 10);
const to = today.toISOString().slice(0, 10);

async function fetchHistory(sym) {
  const url = `${BASE}/historical-price-full/${encodeURIComponent(sym)}?from=${from}&to=${to}&apikey=${KEY}`;
  const j = await getJson(url);
  const hist = j && (j.historical || (j[0] && j[0].historical));
  if (!Array.isArray(hist) || hist.length < MIN_BARS) return null;
  // FMP returns newest-first; sort ascending
  const rows = hist.map(h => ({ date: h.date, o: h.open, h: h.high, l: h.low, c: h.close, v: h.volume }))
    .filter(h => h.date && Number.isFinite(h.c))
    .sort((a, b) => a.date < b.date ? -1 : 1);
  return rows;
}

async function pool(items, fn, n) {
  const out = new Array(items.length);
  let idx = 0;
  async function worker() { while (idx < items.length) { const i = idx++; try { out[i] = await fn(items[i], i); } catch { out[i] = null; } } }
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}

function buildUniverse(screened, histories) {
  // shared union of trading dates
  const dateSet = new Set();
  for (const h of histories) if (h) for (const row of h.rows) dateSet.add(row.date);
  const dates = [...dateSet].sort();
  if (dates.length < MIN_BARS) throw new Error('aligned dates < MIN_BARS');
  const dateIdx = new Map(dates.map((d, i) => [d, i]));

  const stocks = [];
  for (const h of histories) {
    if (!h) continue;
    const n = dates.length;
    const o = new Array(n).fill(null), hi = new Array(n).fill(null), lo = new Array(n).fill(null), c = new Array(n).fill(null), v = new Array(n).fill(null);
    let valid = 0, lastClose = NaN, maxJump = 0, prevC = NaN;
    for (const row of h.rows) {
      const i = dateIdx.get(row.date); if (i == null) continue;
      o[i] = round(row.o, 4); hi[i] = round(row.h, 4); lo[i] = round(row.l, 4); c[i] = round(row.c, 4); v[i] = row.v | 0;
      if (Number.isFinite(prevC) && prevC > 0) { const j = Math.abs(row.c / prevC - 1); if (j > maxJump) maxJump = j; }
      prevC = row.c; lastClose = row.c; valid++;
    }
    if (valid < MIN_BARS) continue;
    if (!(lastClose >= PRICE_MIN && lastClose <= PRICE_MAX)) continue;
    if (maxJump > 0.90) { console.warn(`drop ${h.meta.symbol}: suspect ${(maxJump * 100).toFixed(0)}% single-day move (adj/split?)`); continue; }
    stocks.push({ symbol: h.meta.symbol, name: h.meta.name, meta: { exchange: h.meta.exchange, sector: h.meta.sector, lastClose: round(lastClose, 4), synthetic: false, avgDollarVol: Math.round(h.meta.dollarVol) }, o, h: hi, l: lo, c, v });
  }
  stocks.sort((a, b) => (b.meta.avgDollarVol || 0) - (a.meta.avgDollarVol || 0));
  const capped = stocks.slice(0, TARGET).sort((a, b) => a.symbol.localeCompare(b.symbol));
  return { dates, stocks: capped };
}

function validate(universe) {
  const errs = [];
  if (universe.stocks.length < 60) errs.push(`universeSize ${universe.stocks.length} < 60`);
  if (universe.dates.length < MIN_BARS) errs.push(`bars ${universe.dates.length} < ${MIN_BARS}`);
  for (const s of universe.stocks) {
    if (!(s.meta.lastClose >= PRICE_MIN && s.meta.lastClose <= PRICE_MAX)) errs.push(`${s.symbol} lastClose ${s.meta.lastClose} out of band`);
    if (s.c.some(x => x != null && !Number.isFinite(x))) errs.push(`${s.symbol} has NaN close`);
  }
  return errs;
}

(async () => {
  mkdirSync(DATA, { recursive: true });
  console.log(`screening $${PRICE_MIN}-$${PRICE_MAX} US stocks…`);
  const screened = await screenUniverse();
  console.log(`screener: ${screened.length} candidates; fetching history…`);
  const histories = await pool(screened, async (s) => { const rows = await fetchHistory(s.symbol); return rows ? { meta: s, rows } : null; }, CONCURRENCY);
  const got = histories.filter(Boolean).length;
  console.log(`history: ${got}/${screened.length} usable`);

  const built = buildUniverse(screened, histories);
  const meta = {
    dataKind: 'real', asOf: to, source: 'fmp', universeSize: built.stocks.length,
    barsPerStock: built.dates.length, priceBand: [PRICE_MIN, PRICE_MAX], interval: '1d',
    schemaVersion: 3, warning: '',
  };
  const universe = { schemaVersion: 3, meta, dates: built.dates, stocks: built.stocks };

  const errs = validate(universe);
  if (errs.length) { console.error('VALIDATION FAILED — writing nothing:\n' + errs.slice(0, 20).join('\n')); process.exit(2); }

  writeFileSync(join(DATA, 'universe.json'), JSON.stringify(universe));
  writeFileSync(join(DATA, 'meta.json'), JSON.stringify(meta, null, 2));
  const candidates = { note: 'Screened low-priced US tickers for the in-browser live path.', priceBand: [PRICE_MIN, PRICE_MAX], asOf: to, symbols: screened.slice(0, 60).map(s => s.symbol) };
  writeFileSync(join(DATA, 'candidates.json'), JSON.stringify(candidates, null, 2));
  console.log(`wrote ${built.stocks.length} real stocks × ${built.dates.length} bars (asOf ${to}).`);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
