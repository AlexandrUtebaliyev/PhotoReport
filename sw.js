// Service worker: app shell — cache-first, CSV таблицы — network-first с откатом на кэш.
const VERSION = 'v1';
const SHELL_CACHE = `photoreport-shell-${VERSION}`;
const DATA_CACHE = `photoreport-data-${VERSION}`;
const EXT_CACHE = `photoreport-ext-${VERSION}`;
const KEEP = [SHELL_CACHE, DATA_CACHE, EXT_CACHE];

const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './css/tokens.css', './css/app.css',
  './js/app.js', './js/config.js', './js/data.js', './js/marks.js', './js/router.js', './js/state.js', './js/util.js',
  './js/views/feed.js', './js/views/entry.js', './js/views/stats.js', './js/views/archive.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('photoreport-') && !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req, cacheName, { ignoreSearch = false } = {}) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'docs.google.com') {
    event.respondWith(networkFirst(req, DATA_CACHE));
  } else if (url.origin === self.location.origin) {
    // навигация по приложению с ?m=… отдаёт закэшированный index.html
    const opts = req.mode === 'navigate' ? { ignoreSearch: true } : {};
    event.respondWith(
      cacheFirst(req.mode === 'navigate' ? new Request('./index.html') : req, SHELL_CACHE, opts)
        .catch(() => caches.match('./index.html')),
    );
  } else if (['fonts.googleapis.com', 'fonts.gstatic.com', 'drive.google.com', 'lh3.googleusercontent.com'].includes(url.hostname)
    || url.hostname.endsWith('.googleusercontent.com')) {
    event.respondWith(cacheFirst(req, EXT_CACHE).catch(() => Response.error()));
  }
});
