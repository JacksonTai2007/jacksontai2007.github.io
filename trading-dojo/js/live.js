// live.js — optional in-browser real-data path via Finnhub (free tier sends permissive CORS).
// Best-effort: fetches real-time quotes for the candidate penny stocks and screens to $0.50–$5.
// Finnhub's free /stock/candle is now restricted, so this powers a real-price screen panel;
// the durable real-history path is the CI updater. The app never hard-depends on this.

const BASE = 'https://finnhub.io/api/v1';

export async function fetchQuotes(key, symbols, band = [0.5, 5], onProgress) {
  const out = [];
  const queue = symbols.slice();
  const CONCURRENCY = 5;
  let done = 0;

  async function worker() {
    while (queue.length) {
      const sym = queue.shift();
      try {
        const r = await fetch(`${BASE}/quote?symbol=${encodeURIComponent(sym)}&token=${encodeURIComponent(key)}`);
        if (r.status === 401 || r.status === 403) throw new Error('auth');
        if (r.status === 429) { await sleep(1200); queue.push(sym); continue; }
        const j = await r.json();
        const px = j && Number(j.c);
        if (Number.isFinite(px) && px > 0) {
          out.push({ symbol: sym, price: px, change: Number(j.dp) || 0, inBand: px >= band[0] && px <= band[1] });
        }
      } catch (e) {
        if (e.message === 'auth') throw e;
        // skip transient errors
      }
      done++; if (onProgress) onProgress(done, symbols.length);
      await sleep(60); // gentle pacing under the 60/min free limit
    }
  }
  // token-bucket-ish: run a few workers
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  out.sort((a, b) => a.price - b.price);
  return out;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
