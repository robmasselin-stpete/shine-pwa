const CACHE_NAME = 'shine-v9';
const TILE_CACHE = 'shine-tiles-v1';
const IMG_CACHE = 'shine-images-v2';
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

// All mural images — precached for offline use
const MURAL_IMAGES = [
  './images/2020/alex-yanes.jpg',
  './images/2022/amy-ilic-volpe.jpg',
  './images/2022/imagine.jpg',
  './images/2022/james-bullough.jpg',
  './images/2022/jason-harvin.jpg',
  './images/2022/jeff-williams.jpg',
  './images/2022/madc.jpg',
  './images/2022/marina-capdevila.jpg',
  './images/2022/nneka-jones.jpg',
  './images/2022/reginald-oneal.jpg',
  './images/2023/rhys-meatyard.jpg',
  './images/murals/2020/2020_SHINE_Mural_Festival_BASK.jpg',
  './images/murals/2020/2020_SHINE_Mural_Festival_Brain_Storm.jpeg',
  './images/murals/2020/2020_SHINE_Mural_Festival_Brian_Butler.jpg',
  './images/murals/2020/2020_SHINE_Mural_Festival_Elle_LeBlanc.jpg',
  './images/murals/2020/2020_SHINE_Mural_Festival_Happy_Mural_Project.png',
  './images/murals/2020/2020_SHINE_Mural_Festival_IBOMS.jpg',
  './images/murals/2020/2020_SHINE_Mural_Festival_Kenny_Coil_and_Marc_Berenguer.jpg',
  './images/murals/2020/2020_SHINE_Mural_Festival_Lili_Yuan.jpg',
  './images/murals/2020/2020_SHINE_Mural_Festival_Mason_Schwacke.jpg',
  './images/murals/2020/2020_SHINE_Mural_Festival_Nneka_Jones_and_Bianca_Burrows.jpg',
  './images/murals/2020/2020_SHINE_Mural_Festival_Tatiana_Suarez.jpg',
  './images/murals/2021/aurailieus.jpg',
  './images/murals/2021/bakpak-durden.jpg',
  './images/murals/2021/case-maclaim.jpg',
  './images/murals/2021/chad-mize.jpg',
  './images/murals/2021/emily-ding.jpg',
  './images/murals/2021/gleo.jpg',
  './images/murals/2021/greg-mike.jpg',
  './images/murals/2021/iboms.jpg',
  './images/murals/2021/jared-wright.jpg',
  './images/murals/2021/jason-harvin.jpg',
  './images/murals/2021/jenipher-chandley.jpg',
  './images/murals/2021/jujmo.jpg',
  './images/murals/2021/leo-gomez.png',
  './images/murals/2021/michael-fatutoa.jpg',
  './images/murals/2021/miss-crit.jpg',
  './images/murals/2021/mwanel-pierre-louis.jpg',
  './images/murals/2021/nicole-salgar.jpg',
  './images/murals/2021/reid-jenkins.jpg',
  './images/murals/2021/ricky-watts.jpg',
  './images/murals/2021/woes.jpg',
  './images/murals/2021/ya-la-ford.jpg',
  './images/murals/2022/123Klan-SHINE-Day-9.jpg',
  './images/murals/2022/Ashley-Cantero-SHINE-Day-13.jpg',
  './images/murals/2022/Baghead-Final-Shot.jpg',
  './images/murals/2022/Ben-Johnston-SHINE-Day-11.jpg',
  './images/murals/2022/Chad-Mize-and-Friends-SHINE-Day-11.jpg',
  './images/murals/2022/Dreamweaver-SHINE-Day-12.jpg',
  './images/murals/2022/Egypt-Hagan-SHINE-Day-9.jpg',
  './images/murals/2022/Happy-Mural_Project-SHINE-Day-5.jpg',
  './images/murals/2022/Sydney-Prusso-SHINE-Day-8.jpg',
  './images/murals/2022/Tasko-SHINE-Day-9.jpg',
  './images/murals/2022/VITALE_BROS.jpg',
  './images/murals/2022/Van-Der-Luc-SHINE-Day-10.jpg',
  './images/murals/2023/Andrea-Wan-20231020-144359-MAR7308.jpg',
  './images/murals/2023/Bryan-Beyung-20231022-084623-MAR8962-Pano.jpg',
  './images/murals/2023/Bunnie-Reiss-20231019-181936-MAR7181.jpg',
  './images/murals/2023/Chris-Dyer-20231021-140845-MAR7909-Pano-Edit.jpg',
  './images/murals/2023/Dave-Bonzai-20231020-180757-MAR7845-HDR.jpg',
  './images/murals/2023/Fabstraq-20231022-091127-MAR9128.jpg',
  './images/murals/2023/GreaterPublicStudio-final-USF.jpg',
  './images/murals/2023/Hannah-Eddy-20231019-121609-MAR6021-Edit.jpg',
  './images/murals/2023/Happy-Mural-Project-20231022-090924-MAR9085.jpg',
  './images/murals/2023/Hoxxoh-20231019-113041-MAR5715-Edit.jpg',
  './images/murals/2023/Kelly-Quinn-20231020-135933-MAR7301-HDR.jpg',
  './images/murals/2023/Loretta-Lizzio-20231022-083940-MAR8913-Pano.jpg',
  './images/murals/2023/Max-Sansing-20231021-180720-MAR8497.jpg',
  './images/murals/2023/MichaelVasquez_MRapien.jpg',
  './images/murals/2023/Path-We-Came-Chenlin-Cai-20231022-092309-MAR9266.jpg',
  './images/murals/2023/Sarah-Shepard-20231021-150335-MAR8268.jpg',
  './images/murals/2023/The-Artist-Jones-20231020-173744-MAR7818.jpg',
  './images/murals/2024/Abys-FinalShot-SHINE24.jpg',
  './images/murals/2024/BrightSpot-YaLaFord-stories.jpg',
  './images/murals/2024/BrightSpot-Zulu-Stories.jpeg',
  './images/murals/2024/CristiLopez-FinalShot-SHINE24.jpg',
  './images/murals/2024/FintanMagee-FinalShot-SHINE2024-Image3.jpg',
  './images/murals/2024/FrankieG-FinalShot-SHINE24.jpg',
  './images/murals/2024/GeorgeFBakerIII-FinalShot-SHINE24.jpg',
  './images/murals/2024/Jarus-FinalShot-SHINE24-Image2.jpg',
  './images/murals/2024/KrisMandJohnnyVitale-FinalShot-SHINE24.jpg',
  './images/murals/2024/NaomiHaverland-stories.jpeg',
  './images/murals/2024/NeSpoon-FinalShot-SHINE24-Image1.jpg',
  './images/murals/2024/QuinnCale-FinalShot-SHINE24.jpg',
  './images/murals/2024/StevieShao-FinalShot-SHINE24.jpg',
  './images/murals/2024/UpandOver-FinalShot-SHINE24.jpg',
  './images/murals/2024/shephard-mccallister.jpg',
  './images/murals/2025/aaron-tullo.jpg',
  './images/murals/2025/amy-ilic-volpe.jpg',
  './images/murals/2025/brain-the-genius.jpg',
  './images/murals/2025/cecilia-lueza.jpg',
  './images/murals/2025/derek-donnelly-1847.jpg',
  './images/murals/2025/derek-donnelly-hollander.jpg',
  './images/murals/2025/dreamweaver.jpg',
  './images/murals/2025/elizabeth-barenis.jpg',
  './images/murals/2025/isac-gres.jpg',
  './images/murals/2025/jenipher-chandley.jpg',
  './images/murals/2025/john-vitale-600.jpg',
  './images/murals/2025/john-vitale-factory.jpg',
  './images/murals/2025/karel-garcia.jpg',
  './images/murals/2025/quinn-cale.jpg',
  './images/murals/2025/rebekah-lazaridis.jpg',
  './images/murals/2025/reid-jenkins.jpg',
  './images/murals/2025/sara-salem.jpg',
  './images/murals/2025/sio-macleish.jpg',
  './images/murals/2025/zulu-painter.jpg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then(c => c.addAll(SHELL_ASSETS)),
      caches.open(IMG_CACHE).then(c => c.addAll(MURAL_IMAGES))
    ]).then(() => self.skipWaiting())
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
