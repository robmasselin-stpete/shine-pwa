const CACHE_NAME = 'shine-v12';
const TILE_CACHE = 'shine-tiles-v1';
const IMG_CACHE = 'shine-images-v3';
const FONT_CACHE = 'shine-fonts-v1';

const SHELL_ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './css/fonts.css',
  './js/app.js',
  './js/data.js',
  './js/photos.js',
  './manifest.json',
  './images/icons/icon-192.png',
  './images/icons/icon-512.png'
];

// Install: only precache shell (fast install). Images cache on first view.
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  const keep = [CACHE_NAME, TILE_CACHE, IMG_CACHE, FONT_CACHE];
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Google Fonts + Leaflet CDN — cache first
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com') || url.hostname.includes('unpkg.com')) {
    e.respondWith(cacheFirstCDN(e.request));
    return;
  }

  // Map tiles — network first, fall back to cache
  if (url.hostname.includes('tile') || url.hostname.includes('carto') || url.hostname.includes('basemaps')) {
    e.respondWith(networkFirstTile(e.request));
    return;
  }

  // Images — cache first
  if (url.pathname.includes('/images/') || e.request.destination === 'image') {
    e.respondWith(cacheFirstImage(e.request));
    return;
  }

  // App shell — cache first
  e.respondWith(cacheFirst(e.request));
});

async function cacheFirst(req) {
  const c = await caches.match(req);
  if (c) return c;
  try {
    const r = await fetch(req);
    if (r.ok) { const cache = await caches.open(CACHE_NAME); cache.put(req, r.clone()); }
    return r;
  } catch {
    return req.mode === 'navigate' ? caches.match('./index.html') : new Response('Offline', {status:503});
  }
}

async function cacheFirstCDN(req) {
  const c = await caches.match(req);
  if (c) return c;
  try {
    const r = await fetch(req);
    if (r.ok) { const cache = await caches.open(FONT_CACHE); cache.put(req, r.clone()); }
    return r;
  } catch { return new Response('', {status:503}); }
}

async function cacheFirstImage(req) {
  const c = await caches.match(req);
  if (c) return c;
  try {
    const r = await fetch(req);
    if (r.ok) { const cache = await caches.open(IMG_CACHE); cache.put(req, r.clone()); }
    return r;
  } catch { return new Response('', {status:503}); }
}

async function networkFirstTile(req) {
  try {
    const r = await fetch(req);
    if (r.ok) { const cache = await caches.open(TILE_CACHE); cache.put(req, r.clone()); }
    return r;
  } catch {
    const c = await caches.match(req);
    return c || new Response('', {status:503});
  }
}
