// Mural Quest — SHINE 2026 progress-photo capture endpoint.
//
// POST /photo  (gated by POST_KEY)
//   body: { muralId, date: "YYYY-MM-DD", imageBase64, dry? }
//   → uploads images/murals/2026/<id>-<date>.jpeg to R2, appends {u,d} to the
//     mural's `ph` in content.json, bumps the version. Live over OTA in ~1 min.
//
// The image full-res is served from cdn.muralquest.app; the app's build-viewer
// reads it directly (no bundled card needed — grid thumbnails fall back to full-res).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Capture-Key',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);

    if (request.method === 'GET') {
      return json({ ok: true, service: 'mural-quest-capture', usage: 'POST /photo with X-Capture-Key' });
    }
    if (request.method !== 'POST' || url.pathname !== '/photo') {
      return json({ error: 'not_found' }, 404);
    }

    // ── auth ──
    const key = request.headers.get('X-Capture-Key') || '';
    if (!env.POST_KEY || key !== env.POST_KEY) return json({ error: 'unauthorized' }, 401);

    // ── parse ──
    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
    const muralId = parseInt(body.muralId, 10);
    const date = String(body.date || '').trim();
    const b64 = String(body.imageBase64 || '').replace(/^data:image\/\w+;base64,/, '');
    if (!muralId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !b64) {
      return json({ error: 'need muralId, date (YYYY-MM-DD), imageBase64' }, 400);
    }

    // ── decode image ──
    let bytes;
    try {
      const bin = atob(b64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch { return json({ error: 'bad_base64' }, 400); }
    if (bytes.length > 8 * 1024 * 1024) return json({ error: 'image too large (>8MB)' }, 413);

    // ── load current content.json ──
    const cObj = await env.BUCKET.get('content.json');
    if (!cObj) return json({ error: 'content.json missing on R2' }, 500);
    const data = await cObj.json();
    const mural = (data.murals || []).find(m => m.id === muralId);
    if (!mural) return json({ error: `mural #${muralId} not in content.json` }, 404);

    // Unique key so MULTIPLE photos per day are allowed: first of a date →
    // <id>-<date>.jpeg, then <id>-<date>-2.jpeg, <id>-<date>-3.jpeg, …
    mural.ph = mural.ph || [];
    const sameDate = mural.ph.filter(p => p.d === date).length;
    const imgKey = `images/murals/2026/${muralId}-${date}${sameDate ? '-' + (sameDate + 1) : ''}.jpeg`;

    if (body.dry) {
      return json({ ok: true, dry: true, wouldWrite: imgKey, muralId, currentPhotos: mural.ph.length });
    }

    // ── upload image (immutable) ──
    await env.BUCKET.put(imgKey, bytes, {
      httpMetadata: { contentType: 'image/jpeg', cacheControl: 'public,max-age=31536000,immutable' },
    });

    // ── append to the mural's photos, bump version, write content.json back ──
    mural.ph.push({ u: imgKey, d: date });
    mural.ph.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0)); // oldest→newest
    mural.uc = true; // being painted
    data.version = Date.now();

    await env.BUCKET.put('content.json', JSON.stringify(data), {
      httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' },
    });

    return json({
      ok: true,
      muralId,
      date,
      photoCount: mural.ph.length,
      imageUrl: `https://cdn.muralquest.app/${imgKey}`,
      version: data.version,
    });
  },
};
