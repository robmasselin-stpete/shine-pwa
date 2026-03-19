/**
 * SHINE PWA — Service Worker
 *
 * Offline strategy using 4 named caches:
 *   1. App shell (HTML, CSS, JS)     — cache-first, precached on install
 *   2. Mural images                  — cache-first, precached on install
 *   3. Map tiles (CARTO)             — network-first, cached for offline fallback
 *   4. Fonts & CDN (Google, Leaflet) — cache-first, cached on first fetch
 *
 * Cache versioning: bump the version suffix to force a cache refresh on deploy.
 * The activate handler auto-deletes old caches not in the `keep` list.
 *
 * IMPORTANT: The MURAL_IMAGES list must match the img paths in data.js.
 * When adding a new mural, add its image path here too.
 */

const CACHE_NAME = 'shine-v53';      // App shell — bump on code changes
const TILE_CACHE = 'shine-tiles-v1'; // Map tiles — rarely needs bumping
const IMG_CACHE = 'shine-images-v9'; // Mural images — bump when images change
const FONT_CACHE = 'shine-fonts-v1'; // CDN fonts/libs — rarely needs bumping

// These files are precached on install — the app works offline immediately
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

// All mural images referenced by data.js — precached on install.
// When adding a new mural, add its image path here too.
const MURAL_IMAGES = [
  './images/murals/2015/shark-toof.jpeg',
  './images/murals/2016/alex-pardee.jpeg',
  './images/murals/2017/sarah-sheppard-life-reimagined.jpeg',
  './images/murals/2017/stephen-palladino.jpeg',
  './images/murals/2018/daas.jpeg',
  './images/murals/2018/derek-donnelly-365-million.jpeg',
  './images/murals/2018/js-signs-point-of-pines.jpeg',
  './images/murals/2018/notice-us.jpeg',
  './images/murals/2019/george-rose.jpeg',
  './images/murals/2019/morning-breath.jpeg',
  './images/murals/2020/brian-butler.jpeg',
  './images/murals/2020/iboms.jpeg',
  './images/murals/2020/kenny-coil-and-marc-berenguer.jpeg',
  './images/murals/2020/lili-yuan.jpeg',
  './images/murals/2020/palehorse.jpeg',
  './images/murals/2021/aurailieus-artist.jpeg',
  './images/murals/2021/bakpak-durden.jpeg',
  './images/murals/2021/case-maclaim.jpeg',
  './images/murals/2021/emily-ding.jpeg',
  './images/murals/2021/gleo.jpeg',
  './images/murals/2021/greg-mike.jpeg',
  './images/murals/2021/jared-wright.jpeg',
  './images/murals/2021/jason-harvin.jpeg',
  './images/murals/2021/leo-gomez.jpeg',
  './images/murals/2021/michael-fatutoa.jpeg',
  './images/murals/2021/miss-crit.jpeg',
  './images/murals/2021/mwanel-pierre-louis.jpeg',
  './images/murals/2021/ricky-watts.jpeg',
  './images/murals/2021/woes-martin.jpeg',
  './images/murals/2022/ashley-cantero.jpeg',
  './images/murals/2022/ben-johnston.jpeg',
  './images/murals/2022/dreamweaver.jpeg',
  './images/murals/2022/egypt-hagan.jpeg',
  './images/murals/2022/imagine.jpeg',
  './images/murals/2022/james-bullough.jpeg',
  './images/murals/2022/jeff-williams.jpeg',
  './images/murals/2022/madc.jpeg',
  './images/murals/2022/marina-capdevila.jpeg',
  './images/murals/2022/reginald-oneal.jpeg',
  './images/murals/2022/sydney-prusso.jpeg',
  './images/murals/2022/the-happy-mural-project.jpeg',
  './images/murals/2022/vitale-bros.jpeg',
  './images/murals/2023/bryan-beyung-james-lee-chiahan.jpeg',
  './images/murals/2023/bunnie-reiss.jpeg',
  './images/murals/2023/chenlin-cai.jpeg',
  './images/murals/2023/chris-dyer.jpeg',
  './images/murals/2023/fabstraq.jpeg',
  './images/murals/2023/greater-public-studio.jpeg',
  './images/murals/2023/hoxxoh.jpeg',
  './images/murals/2023/loretta-lizzio.jpeg',
  './images/murals/2023/max-sansing.jpeg',
  './images/murals/2023/michael-vasquez.jpeg',
  './images/murals/2023/sarah-sheppard.jpeg',
  './images/murals/2024/abys.jpeg',
  './images/murals/2024/dwayne-shepherd-brian-mcallister.jpeg',
  './images/murals/2024/emmanuel-jarus.jpeg',
  './images/murals/2024/fintan-magee.jpeg',
  './images/murals/2024/frankie-gonzalez.jpeg',
  './images/murals/2024/george-f-baker-iii.jpeg',
  './images/murals/2024/kris-markovich-johnny-vitale.jpeg',
  './images/murals/2024/nespoon.jpeg',
  './images/murals/2024/quinn-cale.jpeg',
  './images/murals/2024/stevie-shao.jpeg',
  './images/murals/2024/up-and-over.jpeg',
  './images/murals/2024/zulu-painter.jpeg',
  './images/murals/2025/aaron-tullo.jpeg',
  './images/murals/2025/amy-ilic-volpe.jpeg',
  './images/murals/2025/brain-the-genius.jpeg',
  './images/murals/2025/cecilia-lueza.jpeg',
  './images/murals/2025/derek-donnelly-1847.jpeg',
  './images/murals/2025/derek-donnelly-hollander.jpeg',
  './images/murals/2025/dreamweaver.jpeg',
  './images/murals/2025/elizabeth-barenis.jpeg',
  './images/murals/2025/isac-gres.jpeg',
  './images/murals/2025/jenipher-chandley.jpeg',
  './images/murals/2025/john-vitale-600.jpeg',
  './images/murals/2025/john-vitale-601.jpeg',
  './images/murals/2025/john-vitale-factory.jpeg',
  './images/murals/2025/karel-garcia.jpeg',
  './images/murals/2025/rebekah-lazaridis.jpeg',
  './images/murals/2025/reid-jenkins.jpeg',
  './images/murals/2025/sara-salem.jpeg',
  './images/murals/2025/zulu-painter.jpeg',
  './images/murals/2020/tatiana-suarez.jpeg',
  './images/murals/2021/jenipher-chandley.jpeg',
  './images/murals/2021/nicole-salgar.jpeg',
  './images/murals/2021/ya-la-ford.jpeg',
  './images/murals/2022/123klan.jpeg',
  './images/murals/2022/van-der-luc.jpeg',
  './images/murals/2023/artist-jones.jpeg',
  './images/murals/2023/dave-bonzai.jpeg',
  './images/murals/2023/hannah-eddy.jpeg',
  './images/murals/2023/kelly-quinn.jpeg',
  './images/murals/2024/cristi-lopez.jpeg',
  './images/murals/commercial/chad-mize-hollander.jpeg',
  './images/murals/commercial/ernesto-maranje-wildlife-corridor.jpeg',
  './images/murals/commercial/melanie-posner-hollander.jpeg',
  './images/murals/commercial/palehorse-bayboro.jpeg',
  './images/murals/commercial/raisa-nosova-museum-of-motherhood.jpeg',
  './images/murals/commercial/sarah-sheppard-stronger-together.jpeg',
  './images/murals/commercial/the-siren.jpeg',
  './images/murals/commercial/unknown-1498.jpeg',
  './images/murals/commercial/unknown-1503.jpeg',
  './images/murals/commercial/unknown-1506.jpeg',
  './images/murals/pre-shine/chad-mize-twiggy.jpeg',
  './images/field/brian-butler-2.jpeg',
  './images/field/brian-butler-3.jpeg',
  './images/murals/2018/angela-faustina.jpeg',
  './images/murals/2019/jimmy-breen-anthony-freese.jpeg',
  './images/murals/2016/dasic-fernandez.jpeg',
  './images/murals/2016/michael-reeder.jpeg',
  './images/murals/pre-shine/bask-make-history.jpeg',
  './images/murals/2018/look-the-weird.jpeg',
  './images/murals/commercial/ya-la-ford-power-moves.jpeg',
  './images/murals/commercial/sydney-prusso-fairgrounds.jpeg',
  './images/murals/commercial/phybr-neon-lunchbox.jpeg',
  './images/murals/commercial/melanie-posner-irina.jpeg',
  './images/murals/commercial/cecilia-lueza-encounter.jpeg',
  './images/murals/2019/vitale-bros.jpeg',
  './images/murals/2019/reda3sb.jpeg',
  './images/murals/2021/reid-jenkins-distillery.jpeg',
  './images/murals/2023/happy-mural-project.jpeg',
  './images/murals/2023/rhys-meatyard.jpeg',
  './images/murals/commercial/gibbs-mural-club-distillery.jpeg'
];

// Install: precache shell + all mural images (~16MB total after compression).
// Images cached individually so one failure doesn't block the rest.
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(SHELL_ASSETS))
      .then(() => caches.open(IMG_CACHE))
      .then(cache =>
        Promise.all(MURAL_IMAGES.map(url =>
          cache.add(url).catch(err => console.warn('SW: failed to cache', url, err))
        ))
      )
      .then(() => self.skipWaiting())
  );
});

// Activate: delete any old caches not in the current version list
// Then tell all open tabs to reload so they get fresh files
self.addEventListener('activate', (e) => {
  const keep = [CACHE_NAME, TILE_CACHE, IMG_CACHE, FONT_CACHE];
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
     .then(() => self.clients.matchAll({ type: 'window' }))
     .then(clients => clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' })))
  );
});

// Fetch: route requests to the appropriate caching strategy based on URL
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip non-GET requests
  if (e.request.method !== 'GET') return;

  // Google Fonts + Leaflet CDN — cache first (rarely changes)
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com') || url.hostname.includes('unpkg.com')) {
    e.respondWith(cacheFirstCDN(e.request));
    return;
  }

  // Map tiles — network first so you get current tiles, fall back to cached for offline
  if (url.hostname.includes('tile') || url.hostname.includes('carto') || url.hostname.includes('basemaps')) {
    e.respondWith(networkFirstTile(e.request));
    return;
  }

  // Mural images — cache first (precached on install, plus any new ones cached on fetch)
  if (url.pathname.includes('/images/') || e.request.destination === 'image') {
    e.respondWith(cacheFirstImage(e.request));
    return;
  }

  // App shell — cache first, stripping query strings for matching
  e.respondWith(cacheFirst(e.request));
});

/** Cache-first for app shell. Strips query strings so ?v=14 matches the precached entry. */
async function cacheFirst(req) {
  // Try exact match first, then try without query string
  let c = await caches.match(req);
  if (!c) {
    const url = new URL(req.url);
    if (url.search) {
      url.search = '';
      c = await caches.match(url.href);
    }
  }
  if (c) return c;
  try {
    const r = await fetch(req);
    if (r.ok) { const cache = await caches.open(CACHE_NAME); cache.put(req, r.clone()); }
    return r;
  } catch {
    return req.mode === 'navigate' ? caches.match('./index.html') : new Response('Offline', {status:503});
  }
}

/** Cache-first for CDN assets (fonts, Leaflet). Stored in separate FONT_CACHE. */
async function cacheFirstCDN(req) {
  const c = await caches.match(req);
  if (c) return c;
  try {
    const r = await fetch(req);
    if (r.ok) { const cache = await caches.open(FONT_CACHE); cache.put(req, r.clone()); }
    return r;
  } catch { return new Response('', {status:503}); }
}

/** Cache-first for images. Most are precached; new ones get cached on first fetch. */
async function cacheFirstImage(req) {
  const c = await caches.match(req);
  if (c) return c;
  try {
    const r = await fetch(req);
    if (r.ok) { const cache = await caches.open(IMG_CACHE); cache.put(req, r.clone()); }
    return r;
  } catch { return new Response('', {status:503}); }
}

/** Network-first for map tiles. Caches successful fetches; serves stale cache when offline. */
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
