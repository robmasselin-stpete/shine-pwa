// mural-quest-ig — Instagram integration Worker (v1.5).
//
//   POST /post   { image_url, caption }  (x-post-key: <POST_KEY>)  → publish to IG
//                 ?dry=1 creates the media container but does NOT publish (test).
//   GET  /feed                                                     → recent media
//
// The IG token stays server-side (env.IG_TOKEN secret); posting is gated by
// env.POST_KEY. Instagram Login flow → graph.instagram.com. Errors return detail
// so the CLI can show what happened.

const IG = 'https://graph.instagram.com';
const FIELDS = 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp';
const CACHE_TTL = 1200;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-post-key',
  'Access-Control-Max-Age': '86400',
};
const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extra },
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    // ── Publish a mural to Instagram ─────────────────────────────────────────
    if (request.method === 'POST' && url.pathname === '/post') {
      const key = request.headers.get('x-post-key') || url.searchParams.get('key');
      if (!env.POST_KEY || key !== env.POST_KEY) return json({ error: 'unauthorized' }, 401);
      if (!env.IG_TOKEN) return json({ error: 'no IG token configured' }, 500);

      let body;
      try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
      const image_url = body && body.image_url;
      const caption = (body && body.caption) || '';
      if (!image_url) return json({ error: 'image_url required' }, 400);
      const dry = url.searchParams.get('dry') === '1';

      // 1. Create the media container.
      const cRes = await fetch(`${IG}/me/media`, {
        method: 'POST',
        body: new URLSearchParams({ image_url, caption, access_token: env.IG_TOKEN }),
      });
      const cData = await cRes.json();
      if (!cRes.ok || !cData.id) return json({ error: 'container create failed', detail: cData }, 502);

      // Poll until the container is FINISHED (images are usually instant).
      let status = '';
      for (let i = 0; i < 6; i++) {
        const sRes = await fetch(`${IG}/${cData.id}?fields=status_code&access_token=${env.IG_TOKEN}`);
        const sData = await sRes.json();
        status = sData.status_code || '';
        if (status === 'FINISHED' || status === 'ERROR') break;
        await sleep(1200);
      }
      if (status === 'ERROR') return json({ error: 'container processing error', creation_id: cData.id }, 502);

      if (dry) return json({ ok: true, dry: true, creation_id: cData.id, status });

      // 2. Publish.
      const pRes = await fetch(`${IG}/me/media_publish`, {
        method: 'POST',
        body: new URLSearchParams({ creation_id: cData.id, access_token: env.IG_TOKEN }),
      });
      const pData = await pRes.json();
      if (!pRes.ok || !pData.id) return json({ error: 'publish failed', detail: pData }, 502);
      return json({ ok: true, id: pData.id });
    }

    // ── Recent media (kept from the feed build; unused by the app) ────────────
    if (url.pathname === '/feed') {
      const cacheKey = new Request('https://ig.muralquest.app/feed');
      const cache = caches.default;
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
      if (!env.IG_TOKEN) return json({ error: 'no token', items: [] });
      try {
        const r = await fetch(`${IG}/me/media?fields=${FIELDS}&limit=12&access_token=${env.IG_TOKEN}`);
        const d = await r.json();
        if (!r.ok || !Array.isArray(d.data)) return json({ error: (d.error && d.error.message) || 'ig error', items: [] });
        const items = d.data
          .map((m) => ({ id: m.id, caption: (m.caption || '').slice(0, 500), type: m.media_type, image: m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url, permalink: m.permalink, timestamp: m.timestamp }))
          .filter((m) => m.image);
        const resp = json({ items, fetched: Date.now() }, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL}` });
        ctx.waitUntil(cache.put(cacheKey, resp.clone()));
        return resp;
      } catch (e) {
        return json({ error: String((e && e.message) || e), items: [] });
      }
    }

    return new Response('mural-quest-ig', { status: 200, headers: CORS });
  },
};
