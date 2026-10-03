/* Penny Stock Arena service worker — offline-first app shell + data. */
const CACHE = 'penny-arena-v1';
const ASSETS = [
  './', './index.html', './manifest.json', './css/app.css',
  './js/app.js', './js/data.js', './js/store.js', './js/scoring.js', './js/metrics.js',
  './js/backtest.js', './js/indicators.js', './js/presets.js', './js/backtest.worker.js',
  './js/ladder.js', './js/race.js', './js/live.js',
  './data/universe.json', './data/meta.json', './data/candidates.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  // Purge old cache buckets. We intentionally do NOT clients.claim(): a tab keeps the
  // generation it loaded for its lifetime, so the main thread and the (respawnable) module
  // worker never mix versions. Asset freshness is handled by stale-while-revalidate below.
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
});

// return cached immediately, refresh the cache in the background
function staleWhileRevalidate(req) {
  return caches.match(req).then(cached => {
    const net = fetch(req).then(r => { if (r && r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return r; }).catch(() => cached);
    return cached || net;
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // never touch cross-origin (e.g. Finnhub live API)
  if (url.origin !== location.origin) return;

  // app document: network-first so updates show, fall back to cache offline
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put('./index.html', cp)); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }

  // data JSON: stale-while-revalidate (offline instantly; CI refresh shows next launch)
  if (url.pathname.includes('/data/')) { e.respondWith(staleWhileRevalidate(req)); return; }

  // js/css/icons: stale-while-revalidate too, so a normal Pages deploy that changes assets
  // (without bumping sw.js) still reaches returning users on their next launch.
  e.respondWith(staleWhileRevalidate(req));
});
