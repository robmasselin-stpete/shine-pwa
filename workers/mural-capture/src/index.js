// Mural Quest — SHINE 2026 progress-photo capture endpoint.
//
// POST /photo  (gated by POST_KEY)
//   body: { muralId, date: "YYYY-MM-DD", imageBase64, cardBase64?, caption?, dry? }
//   → uploads images/murals/2026/<id>-<date>-<HHMMSS>.jpeg to R2 (+ its card, see below), appends {u,d,c?} to
//     the mural's `ph` in content.json, bumps the version. Live over OTA in ~1 min.
//
// POST /caption  (gated by POST_KEY)
//   body: { muralId, caption }
//   → amends `c` on that mural's MOST RECENT photo. An empty caption clears it.
//     Never touches an image object — this edits content.json only.
//
// POST /delete  (gated by POST_KEY)
//   body: { muralId, url? }
//   → drops the most recent `ph` entry (or the one matching `url`), clearing `uc`
//     if that was the last photo. Also content.json only — see the note on the
//     handler for why the R2 object is deliberately left in place.
//
// The image full-res is served from cdn.muralquest.app; the app's build-viewer
// reads it directly.
//
// CARDS. The grid card and map pin for a `uc` mural ask for the CARD of its newest
// photo (images/cards/2026/<same name>.webp). Shipped apps (<=1.7.6) do NOT fall back
// to the full-res photo: a missing card falls back to the mural's `img` — the "Coming
// soon" placeholder — so without a card the photo never reaches the grid (found live
// 2026-11-05 on #223). The PWA therefore sends a small `cardBase64` with each photo and
// we store it at that card key. It is usually JPEG bytes under a .webp name (iOS Safari
// can't encode WebP); the Content-Type is set from the data URL and browsers sniff
// image bytes anyway. A card failure never fails the photo.
//
// CAPTIONS ARE FORWARD-COMPATIBLE. Shipped app versions (<=1.7.5) read `u` and `d`
// and ignore unknown keys, so adding `c` breaks nothing. Rob can caption from day one
// of the festival and every caption already sent lights up when the render ships in a
// binary. Nothing here needs to be sequenced with that build.

import { handleReview } from './review.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Capture-Key',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

const CAPTION_MAX = 140;

// Normalise a caption. Returns {ok:true, caption} where caption is '' for "no caption",
// or {ok:false, error} to reject. Rejecting on length rather than truncating is
// deliberate: Rob finds out at the wall, not later in the app.
function readCaption(raw) {
  if (raw === undefined || raw === null) return { ok: true, caption: '' };
  // Strip control characters: this string is rendered into HTML by the app.
  let c = String(raw)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!c) return { ok: true, caption: '' };
  if ([...c].length > CAPTION_MAX) {
    return { ok: false, error: `caption_too_long (max ${CAPTION_MAX} chars, got ${[...c].length})` };
  }
  return { ok: true, caption: c };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);

    // Bio review tool (tools/bio-review.html) — see review.js. Same key as photos.
    if (url.pathname.startsWith('/review/')) {
      const rkey = request.headers.get('X-Capture-Key') || '';
      if (!env.POST_KEY || rkey !== env.POST_KEY) return json({ error: 'unauthorized' }, 401);
      try { return await handleReview(request, env, url, json); }
      catch (e) { return json({ error: e.message || String(e) }, 500); }
    }

    if (request.method === 'GET') {
      return json({
        ok: true, service: 'mural-quest-capture',
        usage: 'POST /photo, /caption or /delete with X-Capture-Key',
      });
    }
    const ROUTES = ['/photo', '/caption', '/delete'];
    if (request.method !== 'POST' || !ROUTES.includes(url.pathname)) {
      return json({ error: 'not_found' }, 404);
    }

    // ── auth ──
    const key = request.headers.get('X-Capture-Key') || '';
    if (!env.POST_KEY || key !== env.POST_KEY) return json({ error: 'unauthorized' }, 401);

    // ── parse ──
    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }

    // ── POST /delete — remove a bad frame shot in the field ──
    // Without this a blurry capture is live until Rob is back at the Mac, and
    // publish-content.py would wipe ALL of that mural's photos rather than one.
    //
    // The R2 object is intentionally NOT deleted. Progress photos are stored
    // immutable for a year and the Cloudflare edge cache outlives the object: on
    // 2026-08-24 a reclaimed key served a deleted frame from cache with no error.
    // Dropping the ph entry is what the app reads; the orphan object is harmless.
    if (url.pathname === '/delete') {
      const mid = parseInt(body.muralId, 10);
      if (!mid) return json({ error: 'need muralId' }, 400);

      const dObj = await env.BUCKET.get('content.json');
      if (!dObj) return json({ error: 'content.json missing on R2' }, 500);
      const dData = await dObj.json();
      const dM = (dData.murals || []).find(m => m.id === mid);
      if (!dM) return json({ error: `mural #${mid} not in content.json` }, 404);
      if (!dM.ph || !dM.ph.length) return json({ error: `mural #${mid} has no photos` }, 404);

      let removed;
      if (body.url) {
        // Allow targeting a specific frame; accept a full CDN URL or a bare key.
        const want = String(body.url).replace('https://cdn.muralquest.app/', '');
        const i = dM.ph.findIndex(p => p.u === want);
        if (i < 0) return json({ error: `photo not found on #${mid}`, url: want }, 404);
        removed = dM.ph.splice(i, 1)[0];
      } else {
        removed = dM.ph.pop();          // ph is sorted oldest→newest
      }

      // Last photo gone → the wall is no longer "being painted now".
      if (!dM.ph.length) { delete dM.ph; delete dM.uc; }
      dData.version = Date.now();

      await env.BUCKET.put('content.json', JSON.stringify(dData), {
        httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' },
      });
      return json({
        ok: true, muralId: mid, removed,
        remaining: dM.ph ? dM.ph.length : 0,
        stillUnderConstruction: !!dM.uc,
        note: 'R2 object left in place by design (immutable cache); the app reads ph.',
        version: dData.version,
      });
    }

    // ── POST /caption — amend the caption on the most recent photo ──
    // Exists so a typo spotted ten seconds later is fixable on the spot. Without it the
    // only remedy would be sending a duplicate photo.
    if (url.pathname === '/caption') {
      const mid = parseInt(body.muralId, 10);
      if (!mid) return json({ error: 'need muralId' }, 400);
      const cap = readCaption(body.caption);
      if (!cap.ok) return json({ error: cap.error }, 400);

      const cObj0 = await env.BUCKET.get('content.json');
      if (!cObj0) return json({ error: 'content.json missing on R2' }, 500);
      const data0 = await cObj0.json();
      const m0 = (data0.murals || []).find(m => m.id === mid);
      if (!m0) return json({ error: `mural #${mid} not in content.json` }, 404);
      if (!m0.ph || !m0.ph.length) return json({ error: `mural #${mid} has no photos` }, 404);

      // ph is kept sorted oldest→newest, so the last entry is the most recent photo.
      const last = m0.ph[m0.ph.length - 1];
      if (cap.caption) last.c = cap.caption; else delete last.c;
      data0.version = Date.now();

      await env.BUCKET.put('content.json', JSON.stringify(data0), {
        httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' },
      });
      return json({
        ok: true, muralId: mid, photo: last,
        cleared: !cap.caption, version: data0.version,
      });
    }
    const muralId = parseInt(body.muralId, 10);
    const date = String(body.date || '').trim();
    const b64 = String(body.imageBase64 || '').replace(/^data:image\/\w+;base64,/, '');
    // Optional card (see CARDS above). Keep its data-URL type for the Content-Type.
    const cardRaw = String(body.cardBase64 || '');
    const cardType = (cardRaw.match(/^data:(image\/(?:jpeg|webp|png));base64,/) || [])[1] || 'image/jpeg';
    const cardB64 = cardRaw.replace(/^data:image\/\w+;base64,/, '');
    if (!muralId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !b64) {
      return json({ error: 'need muralId, date (YYYY-MM-DD), imageBase64' }, 400);
    }
    const cap = readCaption(body.caption);
    if (!cap.ok) return json({ error: cap.error }, 400);

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

    // Key carries a UTC time token, so MULTIPLE photos per day are allowed AND no
    // name is ever written twice: <id>-<date>-<HHMMSS>.jpeg.
    //
    // It used to be derived from ph.length (<id>-<date>.jpeg, then -2, -3, …). That
    // breaks whenever photos are removed from `ph` while their objects remain: the
    // counter walks back over names that already exist, R2 takes the new bytes, but
    // the CDN keeps serving the old frame — these objects are cached `immutable` for
    // a year. Silent, and it bit us live in the field on 2026-08-24: fresh captures
    // displayed as the previous day's photos with no error anywhere.
    //
    // Indexing off the bucket instead of ph.length is NOT enough on its own — the
    // edge cache outlives the object, so a deleted photo's name can be reclaimed by
    // a later capture and resurrect the deleted frame from cache. Only a never-reused
    // key is safe, hence the time token.
    mural.ph = mural.ph || [];
    const now = new Date();
    const hhmmss = [now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()]
      .map(n => String(n).padStart(2, '0')).join('');
    const baseKey = `images/murals/2026/${muralId}-${date}-${hhmmss}`;
    // Belt-and-braces for two sends inside the same second.
    const listed = await env.BUCKET.list({ prefix: baseKey });
    const taken = new Set((listed.objects || []).map(o => o.key));
    let imgKey = `${baseKey}.jpeg`;
    for (let n = 1; taken.has(imgKey); ) imgKey = `${baseKey}-${++n}.jpeg`;

    // Same name as the photo under images/cards/, .webp — what the app's cardPath() asks for.
    const cardKey = imgKey.replace('images/murals/', 'images/cards/').replace(/\.jpeg$/, '.webp');

    if (body.dry) {
      return json({ ok: true, dry: true, wouldWrite: imgKey, wouldWriteCard: cardB64 ? cardKey : null, muralId,
                   currentPhotos: mural.ph.length, caption: cap.caption });
    }

    // ── upload image (immutable) ──
    await env.BUCKET.put(imgKey, bytes, {
      httpMetadata: { contentType: 'image/jpeg', cacheControl: 'public,max-age=31536000,immutable' },
    });

    // ── upload card BEFORE content.json, so the app never sees a ph entry without one ──
    let cardWritten = null, cardError = null;
    if (cardB64) {
      try {
        const cbin = atob(cardB64);
        if (cbin.length > 2 * 1024 * 1024) throw new Error('card too large (>2MB)');
        const cbytes = new Uint8Array(cbin.length);
        for (let i = 0; i < cbin.length; i++) cbytes[i] = cbin.charCodeAt(i);
        await env.BUCKET.put(cardKey, cbytes, {
          httpMetadata: { contentType: cardType, cacheControl: 'public,max-age=31536000,immutable' },
        });
        cardWritten = cardKey;
      } catch (e) { cardError = e.message || String(e); }
    }

    // ── append to the mural's photos, bump version, write content.json back ──
    const entry = { u: imgKey, d: date };
    if (cap.caption) entry.c = cap.caption;  // omitted when empty, never c:''
    mural.ph.push(entry);
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
      caption: cap.caption,
      imageUrl: `https://cdn.muralquest.app/${imgKey}`,
      cardUrl: cardWritten ? `https://cdn.muralquest.app/${cardWritten}` : null,
      cardError,
      version: data.version,
    });
  },
};
