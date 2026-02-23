const CACHE_VERSION = 'shine-v4';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const IMG_CACHE = `${CACHE_VERSION}-images`;
const TILE_CACHE = `${CACHE_VERSION}-tiles`;

const SHELL_URLS = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/app.js',
  '/js/data.js',
  '/js/photos.js',
  '/manifest.json',
];

// Install: cache shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then(c => c.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategies
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Map tiles: network-first, cache fallback
  if (url.hostname.includes('basemaps.cartocdn.com')) {
    e.respondWith(
      fetch(e.request).then(r => {
        const clone = r.clone();
        caches.open(TILE_CACHE).then(c => c.put(e.request, clone));
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Images: cache-first, network fallback (progressive caching)
  if (e.request.url.includes('/images/')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(r => {
          const clone = r.clone();
          caches.open(IMG_CACHE).then(c => c.put(e.request, clone));
          return r;
        });
      })
    );
    return;
  }

  // Shell: cache-first, network fallback
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
