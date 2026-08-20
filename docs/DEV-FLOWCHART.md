# Mural Quest — Dev Flowchart & System Map

A map of how data flows, which program touches it, and where everything lives.
Companion to `CLAUDE.md` (rules/gotchas) and `docs/ARCHITECTURE.md` (deeper design).

---

## 0. The mental model — two delivery channels

Everything ships to users through **one of two channels**. Knowing which one a
change uses tells you whether it needs an app-store build or goes live in a minute.

```
                         ┌────────────────────────────────────────────┐
  A change is either …   │                                            │
                         ▼                                            ▼
   ┌───────────────────────────────┐          ┌───────────────────────────────────┐
   │  BUNDLED  (needs a BUILD +     │          │  OTA  (no build, live in ~1 min)  │
   │           store review)       │          │                                   │
   ├───────────────────────────────┤          ├───────────────────────────────────┤
   │ • app code: js/app.js,        │          │ • mural DATA (content.json):      │
   │   content.js, css, index.html │          │   metadata, routes, photos (ph),  │
   │ • bundled FALLBACK data:      │          │   narration URLs, YEARS, pois     │
   │   data.js, routes.js, cards   │          │ • full-res images (CDN)           │
   │ • native shell (Capacitor)    │          │ • audio clips (CDN)               │
   └───────────────────────────────┘          └───────────────────────────────────┘
        ships via App Store / Play                serves from Cloudflare R2 /
        (mq_build.sh, mq_play_upload.py)          cdn.muralquest.app (publish-*.py)
```

The bundled data is only a **first-paint / offline fallback**; on launch the app
fetches `content.json` from the CDN and overlays anything newer (see §8).

---

## 1. Content pipeline — the core loop

Source of truth is YAML on disk. One script fans it out to every artifact.

```
 data/murals/*.yaml   ── mural metadata (id, artist, lat/lng, bio, audio:, photos:, status…)
 data/routes.json     ── tour defs + tagged paths  (see §2)
 data/pois/*.yaml     ── map-only points of interest
 data/config.yaml     ── YEARS, categories, colors
        │
        ▼
 ┌──────────────────────────┐
 │  scripts/build-data.py   │   the hub. reads all of the above and writes:
 └──────────────────────────┘
        │
        ├─►  js/data.js         BUNDLED murals/pois/YEARS (offline fallback)      [tracked]
        ├─►  js/routes.js       BUNDLED ROUTE_DEFS + ROUTE_PATHS                  [tracked]
        ├─►  js/content.json    OTA MANIFEST (same short-key shape as data.js)    [gitignored → R2]
        ├─►  js/content-meta.js BUNDLED version marker (epoch-ms of this build)   [tracked]
        └─►  audio-manifest.json list of narration URLs (SW precaches these)      [tracked]

  Excludes murals with status: painted-over | research. Only murals with
  source: claude-enhanced OR a revisionLog are considered "reviewed".
```

Publish the OTA manifest live (no build):

```
 scripts/publish-content.py   =  build-data.py  +  upload content.json → R2
        │
        ▼
   Cloudflare R2 bucket  "muralquest-content"   ──served at──►  https://cdn.muralquest.app/content.json
```

---

## 2. Routes  (canonical = data/routes.json — routes-over-OTA, v1.7)

```
 tools/route-editor.html  ──(edit stops/paths; ⚡ Generate Paths = Valhalla walking)
        │  Export Route  →  3 sections:
        │    • GPS updates      → apply lat/lng to data/murals/<id>-*.yaml
        │    • Route Definition → apply ids to that route in  data/routes.json
        │    • Path Changes     → apply segments/distance to  data/routes.json
        ▼
 data/routes.json   (id, name, desc, color, ids[], distance, segments[{from,to,path}])
        │
        ▼  build-data.py
        ├─►  js/routes.js   (ROUTE_DEFS + ROUTE_PATHS, bundled fallback — GENERATED, don't hand-edit)
        └─►  content.json "routes"  → OTA (content.js overlays them at boot)

  ⚠ turn-by-turn needs each leg tagged {from,to,path}; an untagged segment silently
    draws a straight line. Never run build-routes.py / build-routes-osrm.py.
```

---

## 3. Images  (v1.5 split: small bundled "card" tier + full-res on CDN)

```
 images/murals/**/<name>.jpeg   full-res source (NOT bundled)
        │
        ▼  scripts/generate-cards.py
        ├─►  images/cards/**/<name>.webp   ≤1600px cards (BUNDLED + on CDN)   [tracked]
        └─►  card-manifest.json            SW precache list                    [tracked]
        │
        ▼  scripts/publish-images.py            (--cards-only for just the small tier)
   R2 "muralquest-content"  →  cdn.muralquest.app/images/{cards,murals}/…

  App: cardSrc() → bundled card → (onerror) CDN card → CDN full → grey.
       fullSrc()  → CDN full-res (detail hero, build-viewer).
```

---

## 4. Narration / audio  (Rob's cloned ElevenLabs voice, delivered OTA)

```
 scripts/gen-narration.py  ──(Claude API drafts, MQ voice)──►  data/narration/<id>-*.txt
        │
        ▼  build-narration-review.py  →  tools/narration-review.html  (Rob reviews/edits text + hears audio)
        │
        ▼  scripts/gen-audio.py   (ElevenLabs, voice MbDP6IqOIFzS6HLtx2BX)  →  audio/<id>.mp3
        │
        ▼  scripts/publish-audio.py   →  R2 audio/  →  cdn.muralquest.app/audio/<id>.mp3
        │
        ▼  set  audio: "…/<id>.mp3?v=N"  in the YAML   (bump ?v to bust the SW cache)
        │
        ▼  build-data.py → content.json (aud field)  →  publish-content.py  →  OTA live

  SW precaches every audio URL (audio-manifest.json) on install → tours play offline.
```

---

## 5. SHINE 2026 field capture  (photo in the field → live app, no Mac, no build)

```
 tools/mural-capture.html  (iPad, on mural-tools.pages.dev)
   pick uc mural → 4K camera + onion-skin overlay of previous photo → capture ≤1600px
        │  POST /photo  (X-Capture-Key from .mq-capture-key)
        ▼
 workers/mural-capture  →  capture.muralquest.app   (R2 binding to muralquest-content)
        ├─►  put  images/murals/2026/<id>-<date>[-N].jpeg   (multiple/day allowed)
        └─►  append {u,d} to that mural's ph[] in content.json + bump version
        │
        ▼  cdn.muralquest.app/content.json  (updated)
        │
        ▼  app fetches → build-viewer shows the new frame.  v1.7.3: pops in live within
           ~15s while any uc mural exists (poll gated on festival mode).

  ⚠ Worker writes content.json DIRECTLY (not the YAML). A Mac publish-content.py would
    overwrite Worker photos → build sync-photos-from-live.py before the festival.
```

---

## 6. Ship a binary  (bundled app code — needs store review)

```
 edit app.js / content.js / css / native  →  git commit
        │
        ▼  npm run cap:sync           (copy www/ → ios & android, with excludes)
        │
        ├── iOS ────────────────────────────────────────────────────────────────┐
        │   bump Info.plist + project.pbxproj                                     │
        │   bash assets/wip/mq_build.sh   → archive → export → UPLOAD to TestFlight│
        │   python3 assets/wip/mq_submit.py --submit  → App Store review          │
        │   (auth: ASC API key AuthKey_FRBV835469.p8)                             │
        │                                                                          │
        └── Android ──────────────────────────────────────────────────────────────┤
            bump versionCode/Name in android/app/build.gradle                      │
            gradlew bundleRelease  → app-release.aab                               │
            python3 assets/wip/mq_play_upload.py  → uploads + rolls out to Play    │
            (auth: service account .mq-play-key.json)                             ─┘

  Keep iOS/Android version NAMES aligned. Strip test murals (#900/#999 → .mq-held/).
```

---

## 7. commit = live  (GitHub Action — the OTA autopilot)

```
 git push origin v1.5   (touching data/murals, data/config.yaml, images/*, build-data.py)
        │
        ▼  .github/workflows/publish-content.yml   (runs on branch v1.5 ONLY)
        │    build-data.py  +  upload content.json + changed images → R2
        ▼
   cdn.muralquest.app  updated  (~40s)   →  users get it next launch

  Secrets: CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (in the GitHub repo).
  ⚠ main is stale — never trigger against main (would publish old data).
```

---

## 8. Runtime — how the app loads content  (js/content.js)

```
 launch
   1. import data.js / routes.js        → BUNDLED baseline in memory
   2. content.js applyCachedAtBoot()    → if localStorage cache > bundle, apply it
   3. app renders from murals/ROUTE_DEFS/… (mutated in place, same array identity)
   4. content.js hydrateContent()       → fetch cdn/content.json (ETag → cheap 304)
        if newer: apply live (v1.7.3) + re-render, and cache for next launch
   5. (festival) poll every 15s while any uc mural exists → new photos pop in live

  Service worker (sw.js): caches the app shell; BYPASSES content.json (so OTA is never
  shadowed); precaches all audio on install (offline tours).
```

---

## 9. Backend services  (Cloudflare Workers)

```
 capture.muralquest.app   workers/mural-capture   POST /photo (POST_KEY) → R2 + content.json   (§5)
 analytics.muralquest.app workers/analytics       POST /e → D1 "mural-quest-analytics";
                                                   GET /stats?key=… → aggregates (STATS_KEY)
 ig.muralquest.app        workers/ig-feed         POST /post (POST_KEY) → publish to Instagram

 app  →  js/analytics.js  track(event,props)  → POST /e  → D1  → tools/stats.html (heat map)
 Rob  →  scripts/ig_post.py  → ig.muralquest.app → Instagram (mural_quest_st_pete)
```

---

## 10. Tools (editor PWAs) + deployment

```
 tools/*.html   (yaml-editor, route-editor, mural-capture, narration-review, stats,
                 overview-map, artist-outreach, print-yamls, index dashboard)
        │
        ▼  scripts/deploy-tools.sh   (bundles tools + a snapshot of data.js/routes.js/YAMLs)
   Cloudflare Pages  →  https://mural-tools.pages.dev   (dashboard at /, tools at /tools/)

 Also: get.html → muralquest-app.pages.dev (QR lead-source redirect: ?s=source → app store).
```

---

## 11. Where does X live?  (quick reference)

| Thing | Location |
|---|---|
| Mural source of truth | `data/murals/*.yaml` |
| Route source of truth | `data/routes.json` |
| Full-res photos (source) | `images/murals/**` (NOT bundled) |
| Bundled data (fallback) | `js/data.js`, `js/routes.js`, `images/cards/**` |
| OTA manifest | `js/content.json` (gitignored) → R2 → `cdn.muralquest.app/content.json` |
| CDN (images/audio/content) | Cloudflare R2 bucket `muralquest-content` → `cdn.muralquest.app` |
| Analytics DB | Cloudflare D1 `mural-quest-analytics` |
| Tools hosting | Cloudflare Pages `mural-tools.pages.dev` |
| Workers | `capture` / `analytics` / `ig` .muralquest.app |
| iOS build/submit | `assets/wip/mq_build.sh`, `mq_submit.py` |
| Android upload | `assets/wip/mq_play_upload.py` |
| Held test murals | `.mq-held/` (gitignored) |
| Dev branch | `v1.5` (main is stale) · remote `github.com/robmasselin-stpete/shine-pwa` |

---

## 12. Keys & secrets  (all gitignored / Worker secrets — never in the repo)

| Key | Where | Used by |
|---|---|---|
| `.mq-anthropic-key` | repo root | gen-narration.py (Claude API) |
| `.mq-elevenlabs-key` | repo root | gen-audio.py (voice render) |
| `.mq-play-key.json` | repo root | mq_play_upload.py (Play service account) |
| `.mq-capture-key` | repo root | capture PWA POST key (= Worker POST_KEY) |
| `.mq-stats-key` | repo root | stats dashboard (= Worker STATS_KEY) |
| `.mq-ig-post-key` | repo root | ig_post.py (= Worker POST_KEY) |
| ASC `AuthKey_FRBV835469.p8` | `~/.appstoreconnect/` | mq_build.sh / mq_submit.py |
| `POST_KEY` / `STATS_KEY` / `IG_TOKEN` | Cloudflare Worker secrets | the three Workers |
| `CLOUDFLARE_API_TOKEN` / `_ACCOUNT_ID` | GitHub repo secrets | commit=live Action |
