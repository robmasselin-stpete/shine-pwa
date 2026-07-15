// mural-quest ig-feed — proxies + caches the Mural Quest Instagram feed (v1.5).
//
//   GET /feed  → { items: [{ id, caption, type, image, permalink, timestamp }], fetched }
//
// The IG token stays server-side (env.IG_TOKEN secret) — the app never sees it.
// Responses are edge-cached ~20 min so IG rate limits are never a concern and the
// app loads instantly. Errors return 200 with items:[] so the app degrades quietly.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extra },
  });

const FIELDS = 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp';
const CACHE_TTL = 1200; // 20 min

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === '/feed') {
      const cacheKey = new Request('https://ig.muralquest.app/feed');
      const cache = caches.default;
      const hit = await cache.match(cacheKey);
      if (hit) return hit;

      if (!env.IG_TOKEN) return json({ error: 'no token configured', items: [] });
      try {
        const api = `https://graph.instagram.com/me/media?fields=${FIELDS}&limit=12&access_token=${env.IG_TOKEN}`;
        const r = await fetch(api);
        const d = await r.json();
        if (!r.ok || !Array.isArray(d.data)) {
          return json({ error: (d.error && d.error.message) || 'ig error', items: [] });
        }
        const items = d.data
          .map((m) => ({
            id: m.id,
            caption: (m.caption || '').slice(0, 500),
            type: m.media_type,
            image: m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url,
            permalink: m.permalink,
            timestamp: m.timestamp,
          }))
          .filter((m) => m.image);
        const resp = json({ items, fetched: Date.now() }, 200, {
          'Cache-Control': `public, max-age=${CACHE_TTL}`,
        });
        ctx.waitUntil(cache.put(cacheKey, resp.clone()));
        return resp;
      } catch (e) {
        return json({ error: String((e && e.message) || e), items: [] });
      }
    }

    return new Response('mural-quest ig-feed', { status: 200, headers: CORS });
  },
};
