// data.js — load + validate + screen the baked universe. Keeps the compact parallel-array
// shape (cheap to hand to the worker); the worker converts to candle objects once.

const PRICE_MIN = 0.50, PRICE_MAX = 5.00, MIN_VALID_BARS = 60;

let _universe = null;
let _meta = null;

export async function loadUniverse() {
  const [uni, meta] = await Promise.all([
    fetch('data/universe.json').then(r => r.json()),
    fetch('data/meta.json').then(r => r.json()).catch(() => null),
  ]);
  if (!uni || !Array.isArray(uni.stocks) || !Array.isArray(uni.dates)) {
    throw new Error('universe.json malformed');
  }
  _meta = meta || uni.meta || { dataKind: 'unknown' };

  const band = (_meta.priceBand && _meta.priceBand.length === 2) ? _meta.priceBand : [PRICE_MIN, PRICE_MAX];
  const stocks = [];
  for (const s of uni.stocks) {
    if (!s || !Array.isArray(s.c)) continue;
    const lastClose = s.meta?.lastClose ?? lastFinite(s.c);
    if (!(lastClose >= band[0] && lastClose <= band[1])) continue;      // screen $0.50–$5
    const valid = s.c.filter(x => x != null && Number.isFinite(x)).length;
    if (valid < MIN_VALID_BARS) continue;
    stocks.push(s);
  }
  if (stocks.length === 0) throw new Error('no stocks passed screening');

  _universe = { schemaVersion: uni.schemaVersion, meta: _meta, dates: uni.dates, stocks };
  return _universe;
}

function lastFinite(arr) {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null && Number.isFinite(arr[i])) return arr[i];
  return NaN;
}

export function getUniverse() { return _universe; }
export function getMeta() { return _meta; }
export function isSeed() { return !_meta || _meta.dataKind !== 'real'; }

// Replace the in-memory universe with a live-fetched one (same shape). Used by live.js.
export function setUniverse(uni, meta) {
  _universe = uni; _meta = meta || uni.meta;
}
