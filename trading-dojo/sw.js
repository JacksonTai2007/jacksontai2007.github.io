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
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

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
  if (url.pathname.includes('/data/')) {
    e.respondWith(caches.match(req).then(cached => {
      const net = fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r; }).catch(() => cached);
      return cached || net;
    }));
    return;
  }

  // everything else (js/css/icons): cache-first
  e.respondWith(caches.match(req).then(cached => cached || fetch(req).then(r => {
    const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r;
  })));
});
