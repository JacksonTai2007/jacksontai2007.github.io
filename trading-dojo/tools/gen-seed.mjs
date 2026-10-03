#!/usr/bin/env node
// gen-seed.mjs — generate a deterministic, OFFLINE seed universe for Penny Stock Arena.
// No network (satisfies the build-sandbox 403 constraint). Reproducible via mulberry32.
// Output: data/universe.json (dataKind='seed'), data/meta.json, data/candidates.json.
//
// The seed is SYNTHETIC and clearly labeled (names get a "(DEMO)" suffix, meta.synthetic=true,
// meta.dataKind='seed'). The CI updater (tools/update-universe.mjs) later overwrites these with
// real penny-stock OHLCV (dataKind='real') and the in-app SEED banner self-clears.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
mkdirSync(DATA, { recursive: true });

// ---- deterministic PRNG ----
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const MASTER_SEED = 20260627;

// ---- config ----
const N_STOCKS = 120;
const N_BARS = 252;          // ~1 trading year
const PRICE_MIN = 0.50, PRICE_MAX = 5.00;
const BAND_LOW = 0.50, BAND_HIGH = 5.0; // reflecting band == screen, so the universe stays in-band

const SECTORS = ['Biotech', 'Mining', 'Tech', 'Clean Energy', 'EV', 'Cannabis', 'Media', 'Energy', 'Crypto Mining', 'Financials'];
const SECTOR_WEIGHTS = [22, 20, 18, 8, 8, 6, 5, 5, 4, 4]; // penny-typical skew

const NAME_TAILS = {
  Biotech: ['Therapeutics', 'Biosciences', 'Pharma', 'Bio'],
  Mining: ['Mining', 'Resources', 'Minerals', 'Gold'],
  Tech: ['Technologies', 'Systems', 'Labs', 'Holdings'],
  'Clean Energy': ['Energy', 'Power', 'Solar', 'Hydrogen'],
  EV: ['Motors', 'Mobility', 'Auto', 'EV'],
  Cannabis: ['Cannabis', 'Brands', 'Growth', 'Leaf'],
  Media: ['Media', 'Networks', 'Interactive', 'Studios'],
  Energy: ['Energy', 'Petroleum', 'Drilling', 'Oil'],
  'Crypto Mining': ['Compute', 'Mining', 'Digital', 'Chain'],
  Financials: ['Capital', 'Financial', 'Holdings', 'Bancorp'],
};
const EXCHANGES = ['NASDAQ', 'NYSE', 'AMEX'];

// ---- trading dates (weekdays ending build date) ----
function tradingDates(count, end) {
  const out = [];
  const d = new Date(end + 'T00:00:00Z');
  while (out.length < count) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.unshift(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}
const BUILD_DATE = process.env.SEED_DATE || '2026-06-26';
const dates = tradingDates(N_BARS, BUILD_DATE);

// ---- helpers ----
function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function pickWeighted(rng, items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}
function round(x, dp) { const p = 10 ** dp; return Math.round(x * p) / p; }

// ---- ticker generation (unique, synthetic) ----
const used = new Set();
function makeTicker(rng) {
  const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let attempt = 0; attempt < 1000; attempt++) {
    const len = 3 + (rng() < 0.5 ? 0 : 1);
    let s = '';
    for (let i = 0; i < len; i++) s += L[Math.floor(rng() * 26)];
    if (!used.has(s)) { used.add(s); return s; }
  }
  return 'ZZ' + used.size;
}
function makeName(rng, sector, ticker) {
  const tail = NAME_TAILS[sector][Math.floor(rng() * NAME_TAILS[sector].length)];
  return `${ticker.charAt(0)}${ticker.slice(1).toLowerCase()} ${tail} (DEMO)`;
}

// ---- one stock ----
function genStock(idx) {
  const rng = mulberry32(MASTER_SEED + idx * 7919);
  const sector = pickWeighted(rng, SECTORS, SECTOR_WEIGHTS);
  const ticker = makeTicker(rng);
  const name = makeName(rng, sector, ticker);
  const exchange = EXCHANGES[Math.floor(rng() * EXCHANGES.length)];

  const annDrift = gauss(rng) * 0.40;                 // many bleed, some moon
  const annVol = 0.60 + rng() * 0.80;                 // 60%–140% annual vol (penny-high)
  const dt = 1 / 252;
  const mu = annDrift * dt;
  const sigma = annVol * Math.sqrt(dt);

  // some stocks "list late" to exercise non-survivorship null handling
  const listLate = rng() < 0.15;
  const startBar = listLate ? Math.floor(rng() * (N_BARS * 0.4)) : 0;

  let price = PRICE_MIN + rng() * (PRICE_MAX - PRICE_MIN);
  const o = new Array(N_BARS).fill(null);
  const h = new Array(N_BARS).fill(null);
  const l = new Array(N_BARS).fill(null);
  const c = new Array(N_BARS).fill(null);
  const v = new Array(N_BARS).fill(null);
  let prevClose = price;

  // persistent trend regime (AR(1)) so multi-week trends exist and trend/breakout
  // strategies have real, learnable signal — gives the ladder a spread of tiers.
  let regime = gauss(rng) * sigma * 1.5;

  for (let i = startBar; i < N_BARS; i++) {
    regime = regime * 0.96 + gauss(rng) * sigma * 0.55;
    // regime events: pumps, dumps, rare reverse-split-like jump
    let shock = mu + regime + sigma * gauss(rng);
    const roll = rng();
    if (roll < 0.012) shock += 0.20 + rng() * 0.60;     // pump +20–80%
    else if (roll < 0.024) shock -= 0.15 + rng() * 0.45; // dump -15–60%

    const open = i === startBar ? price : prevClose * (1 + sigma * 0.3 * gauss(rng));
    let close = open * (1 + shock);

    // reflecting band keeps the universe penny-themed
    if (close < BAND_LOW) close = BAND_LOW + (BAND_LOW - close) * 0.5;
    if (close > BAND_HIGH) close = BAND_HIGH - (close - BAND_HIGH) * 0.5;
    if (close < 0.05) close = 0.05;

    const intrabar = Math.abs(sigma) * (0.5 + rng()) * open;
    const high = Math.max(open, close) + Math.abs(gauss(rng)) * intrabar * 0.4;
    const low = Math.min(open, close) - Math.abs(gauss(rng)) * intrabar * 0.4;

    const ret = Math.abs(close / open - 1);
    const baseVol = 200000 + rng() * 3000000;
    const vol = Math.round(baseVol * (1 + ret * 12) * Math.exp(gauss(rng) * 0.3));

    o[i] = round(open, 4); h[i] = round(Math.max(high, open, close), 4);
    l[i] = round(Math.max(0.01, Math.min(low, open, close)), 4); c[i] = round(close, 4);
    v[i] = vol;
    prevClose = close;
  }

  const lastClose = c[N_BARS - 1];
  return {
    symbol: ticker, name,
    meta: { exchange, sector, lastClose: round(lastClose, 4), synthetic: true },
    o, h, l, c, v,
  };
}

// ---- build universe ----
const stocks = [];
for (let i = 0; i < N_STOCKS; i++) {
  const s = genStock(i);
  // keep the seed honestly inside the price band on the last bar
  if (s.meta.lastClose >= PRICE_MIN * 0.6 && s.meta.lastClose <= PRICE_MAX * 1.6) stocks.push(s);
}
stocks.sort((a, b) => a.symbol.localeCompare(b.symbol));

const meta = {
  dataKind: 'seed',
  asOf: BUILD_DATE,
  source: 'synthetic-gbm-v1',
  universeSize: stocks.length,
  barsPerStock: N_BARS,
  priceBand: [PRICE_MIN, PRICE_MAX],
  interval: '1d',
  schemaVersion: 3,
  warning: 'SEED DATA — synthetic prices, NOT real markets. Run the CI updater for real data.',
};

const universe = { schemaVersion: 3, meta, dates, stocks };

writeFileSync(join(DATA, 'universe.json'), JSON.stringify(universe));
writeFileSync(join(DATA, 'meta.json'), JSON.stringify(meta, null, 2));

// ---- candidates.json: REAL low-priced tickers for the in-browser live screen ----
const candidates = {
  note: 'Real US-listed symbols that have historically traded in the $0.50–$5 band, used by the in-browser Finnhub live screen. Refreshed by CI. Seed prices live in universe.json and are synthetic.',
  priceBand: [PRICE_MIN, PRICE_MAX],
  asOf: BUILD_DATE,
  symbols: [
    'SNDL', 'TLRY', 'CRON', 'FCEL', 'PLUG', 'CHPT', 'EVGO', 'GSAT', 'GPRO', 'NOK',
    'LCID', 'NIO', 'RIG', 'TELL', 'KOS', 'BTG', 'NGD', 'DNN', 'UUUU', 'NAK',
    'GERN', 'AGEN', 'IBRX', 'IQ', 'WULF', 'BBD', 'LYG', 'PSEC', 'SOUN', 'BBAI',
    'RGTI', 'QBTS', 'MVIS', 'VFS', 'HOLO', 'CIFR', 'AMPX', 'ZIM', 'ACB', 'CGC',
  ],
};
writeFileSync(join(DATA, 'candidates.json'), JSON.stringify(candidates, null, 2));

console.log(`seed: ${stocks.length} stocks × ${N_BARS} bars, dates ${dates[0]}..${dates[dates.length - 1]}`);
console.log('wrote data/universe.json, data/meta.json, data/candidates.json');
