# Content-Driven Architecture — Plan

Goal: decouple **content** (mural data, routes, photos) from the **app binary** so
that (a) the app is small enough for Google Play, (b) the iOS app shrinks
dramatically, and (c) Rob can push **daily content updates during SHINE** — new
murals, titles, stories, GPS nudges, routes — live to everyone with **no App
Store / Play review**.

Status: PLAN (not started). Written 2026-07-07 during the Android spike.

---

## The key insight: thumbnails vs full-res

Current bundle = **415 MB**, of which:

| Asset | Size | Shown | Offline need |
|---|---|---|---|
| `images/thumbs/` | **6.9 MB** | Grid cards + map popups | **Must be instant/offline** |
| `images/murals/` (full-res) | **373 MB** | Detail page only, one at a time | On-demand, cache after first view |
| `images/pois`, `field`, icons | ~1 MB | misc | bundle |
| `js/data.js` (mural metadata) | ~1 MB | everywhere | must work offline |
| `js/routes.js` | small | tour navigation | must work offline |

So the architecture writes itself:

- **Bundle** the thumbnails + data + routes (a ~20–30 MB app). Browsing the grid,
  the map, and tour navigation all work **fully offline** from the bundled copy.
- **Remote-host** the 373 MB of full-res photos. They load on demand when a user
  opens a mural's detail page, and cache on-device after first view.
- **Remote-host** a copy of the data + routes too, fetched at launch to overlay
  the bundled fallback — this is what enables daily updates.

This means the offline risk (a walking-tour app used with spotty signal) is small:
the only thing that needs network is a **full-res detail photo the user hasn't
viewed yet** — and even that degrades gracefully to the bundled thumbnail.

---

## Architecture

### Two things move remote, same pattern

1. **Content data** (`data.js` + `routes.js` → a versioned JSON manifest)
2. **Full-res images** (`images/murals/**`)

Both follow: *bundle a fallback → fetch remote at launch → cache locally → use
remote if newer, fallback if offline.*

### Content manifest

Publish a small `content.json` to the host:

```json
{
  "version": 145,               // bump on every publish
  "generated": "2026-07-07T...",
  "murals": [ ... ],            // same shape as data.js `murals`
  "pois": [ ... ],
  "routes": { ... },           // same shape as routes.js ROUTE_PATHS
  "imageBase": "https://cdn.muralquest.app/full/"
}
```

- Full-res image URLs = `imageBase` + the existing relative path
  (`images/murals/2025/aaron-tullo.jpeg` → `https://cdn.muralquest.app/full/images/murals/2025/aaron-tullo.jpeg`).
  Keeps the existing path structure — no renaming.

### App boot sequence

1. Load **bundled** `data.js` / `routes.js` immediately → render instantly from
   thumbnails. (App is usable in the first frame, offline.)
2. In the background, `fetch(content.json)` (short timeout). If it returns and
   `version > bundledVersion` and `version > cachedVersion`, store it via
   Capacitor Preferences/Filesystem and re-render.
3. On next launch, prefer the cached content if it's newer than bundled.

### Image loading

- Grid + map: bundled thumbnails (`thumbPath(m.img)`), unchanged.
- Detail page: request `imageBase + m.img`. On success, cache to Filesystem;
  on failure/offline, fall back to the thumbnail (already the `onerror` pattern).
- Optional nicety: a "download this tour for offline" button that pre-caches the
  full-res images for a route's murals.

---

## Hosting recommendation: Cloudflare R2

Evaluated against Rob's needs (386 MB images, small JSON, festival traffic
spikes, walking-tour audience, cost sensitivity):

| Option | Storage | Egress | Setup | Verdict |
|---|---|---|---|---|
| **Cloudflare R2** | 10 GB free (386 MB fits) | **$0 — zero egress fees** | New account + bucket + custom domain | **Recommended** |
| Netlify (existing) | fine | 100 GB/mo free, then paid | Rob already knows `netlify deploy` | Good fallback, lower friction |
| S3 + CloudFront | cheap | paid egress | most setup | overkill |

**Recommend Cloudflare R2** with a custom domain (`cdn.muralquest.app`):
- **Zero egress fees** is the killer feature — a festival traffic spike or the app
  getting popular never produces a surprise bandwidth bill. Netlify's free 100 GB
  could be exceeded if many users load many full-res photos.
- 386 MB fits comfortably in the 10 GB free storage tier.
- One bucket holds both `content.json` and `full/images/**`.
- Publish via an S3-compatible CLI (`rclone` / `aws s3 cp` / `wrangler r2`).

**Lower-friction alternative:** if Rob would rather not open a Cloudflare account,
host everything on Netlify under muralquest.app — he already deploys there. Accept
the 100 GB/mo bandwidth ceiling (likely fine at current scale, since only
on-demand full-res photos egress — thumbnails are bundled). Easy to start on
Netlify and migrate to R2 later if bandwidth becomes a concern.

---

## Publish workflow (the "instant update" win)

Today: edit YAML → `build-data.py` → `data.js` → commit → **cap:sync → build →
submit → Apple/Google review → days**.

New: edit YAML → `build-data.py` → **publish content** → **live in minutes, no
review**.

Add a `scripts/publish-content.py` (or `mq_publish.sh`) that:
1. Runs `build-data.py` to regenerate data.
2. Emits `content.json` (murals + pois + routes + bumped version).
3. Uploads `content.json` + any new/changed full-res images to R2.
4. Purges the CDN cache for `content.json` (so clients see it immediately).

Rob's editor PWAs (`yaml-editor.html`, `route-editor.html`) are unchanged — their
output still feeds `build-data.py`; only the final step changes from "rebuild app"
to "publish."

Guardrail: keep a bundled fallback snapshot in the app so a bad publish can't
brick offline users — worst case they see slightly stale content until fixed.

---

## Offline & caching design (the careful part)

- **Bundled fallback**: thumbnails + a snapshot of `content.json` ship in the app.
  App is fully functional offline on first launch, before any network.
- **Data cache**: fetched `content.json` stored via Capacitor Preferences (small)
  or Filesystem. Versioned; only replaces bundled data when strictly newer.
- **Image cache**: full-res photos cached to Filesystem after first view (or rely
  on WebView HTTP cache with long `Cache-Control` + immutable URLs). Consider
  content-hashed or path-stable URLs so caching is safe.
- **Failure handling**: every remote fetch has a short timeout and a fallback.
  Network is an enhancement, never a requirement, for anything already bundled.
- **First-launch cellular**: because thumbnails are bundled, first launch is light.
  Full-res only downloads when a user actually opens a detail — naturally lazy.

---

## Phased rollout

**Phase 0 — Foundations (no user-visible change)**
- Stand up the host (R2 bucket + `cdn.muralquest.app`).
- Upload current full-res images + first `content.json`.
- Write `publish-content` script.

**Phase 1 — iOS: remote full-res images**
- App loads detail photos from `imageBase`, falls back to bundled thumb.
- Remove full-res `images/murals/**` from the iOS bundle (keep thumbnails).
- iOS app drops from 415 MB → ~25 MB. Ship as a normal iOS update.
- **Validate**: photos load, cache, and degrade offline correctly, in the field.

**Phase 2 — iOS: remote data + routes (daily updates)**
- App overlays bundled data with fetched `content.json`.
- Test the publish flow: change a title, publish, confirm it appears with no
  rebuild. This unlocks the festival workflow on iOS.

**Phase 3 — Android**
- With the app now ~25 MB, the Play size problem is gone.
- Do the remaining Android platform work (below) and submit to Play.

Rationale: prove the remote-content architecture on the platform that already
ships (iOS) before adding the second platform. Lower risk, faster validation.

---

## Android platform work (separate track, needed regardless)

From the spike, all contained and standard:
- **Back button** — wire Capacitor `App` backButton to the view stack (navigate,
  not quit).
- **Location permission** — add `ACCESS_FINE_LOCATION` / `COARSE` to the manifest;
  test the runtime prompt flow.
- **Safe areas / status bar** — tune Android insets (nav bar, punch-hole) against
  existing safe-area CSS vars.
- **Ads** — configure the ad SDK for Android + Play Data Safety disclosure.
- **Play Console** — $25 account, store listing, content rating, data safety,
  Play App Signing.
- **Build/ship pipeline** — an `mq_build`/`mq_submit` equivalent for Play (Gradle
  → signed AAB → Play Developer API upload).

---

## Effort & risk (rough)

- Phase 0–1 (host + remote images, iOS): the meat. Moderate — mostly the
  caching/fallback logic + the publish script + testing offline in the field.
- Phase 2 (remote data): smaller — same pattern applied to JSON; main work is the
  boot-time overlay + versioning.
- Phase 3 (Android): the platform gaps above + Play setup. Mechanical but broad.

Biggest risk: **offline correctness** for a walking-tour app. Mitigated by
bundling thumbnails + a data snapshot so the app never *depends* on network for
anything already on device.

---

## Analytics (self-hosted, first-party — decided 2026-07-11)

Goal (Rob): **general usage patterns** — what screens people use, how they move
through the app. Approach: **self-hosted on Cloudflare** (full data ownership, same
infra as the content hosting, no third party). Fold into v1.5.

**Architecture** (all Cloudflare, same account as R2):
- **Collector:** a Cloudflare **Worker** at e.g. `analytics.muralquest.app/e` that
  accepts small JSON event POSTs.
- **Storage:** **Cloudflare D1** (SQLite) for the event log — simple SQL queries
  ("sessions/day, screen views, top murals"), free tier, full row-level ownership.
  (Cloudflare **Analytics Engine** is the alternative if event volume ever gets
  large — better at high-write aggregation; D1 is the pragmatic pick at St. Pete
  scale and lets you run arbitrary queries.)
- **Client:** `js/analytics.js` in the web bundle:
  - Anonymous **install/session id** (random, stored locally — NOT a device id).
    Keeps it first-party: no PII, no ad IDs, no cross-app tracking.
  - Events to capture: `app_open`, `screen_view` (map/explore/tours/detail/
    cheatsheet), `mural_open` (id), `filter_used` (which), `tour_start` /
    `tour_complete` (id), `book_card_tap`, `book_buy_click`, `search` (term).
  - **Offline-resilient:** queue events in localStorage, flush via
    `navigator.sendBeacon` when online (walking-tour app, spotty signal).
  - Payload shape: `{ sid, ts, event, props }`.
- **Dashboard:** small admin Worker endpoint (or Cloudflare dashboard / direct SQL)
  for "sessions per day, top murals, filter usage, book-buy conversions."

**Privacy / App Store:** anonymous session id + usage-only data, not linked to
identity, no ATT prompt needed. Requires a simple privacy-label update ("Usage
Data, not linked to you"). Stay strictly first-party to keep it that way.

**Effort:** Worker + D1 schema ~½ day; client events + offline queue ~½ day; a
basic query/dashboard ~½ day. Ships with v1.5 (needs an app update to add the
client instrumentation).

**Note:** even though "general usage" is the stated goal, capturing
`book_buy_click` is nearly free and gives SPAA a conversion number — worth
including from day one.

## Open decisions

1. Hosting: R2 (recommended) vs Netlify (lower friction). Rob to confirm.
2. Custom domain: `cdn.muralquest.app`? (needs a DNS record.)
3. Image cache strategy: rely on WebView HTTP cache vs explicit Filesystem cache
   (Filesystem gives a "download for offline" feature; more code).
4. Whether to also move thumbnails remote later (probably not — 6.9 MB is cheap to
   bundle and guarantees offline browsing).
