# Session Summary — 2026-05-04 → 2026-05-04

## Build status
- **iOS Build 119** uploaded to TestFlight (POI feature live: Soft Water Studios proximity popup; ~30 more searchBio expansions; dozens of display-bio rewrites with stronger hooks; addresses backfilled from GPS reverse-geocode; #145 + #170 reclassified shine; #193 attribution downgraded to Unknown)
- Pelican icon **regenerated white-background, ~88% width fill** — saved into appiconset + 15 PWA sizes, queued for next build (build 120)

## Bio + research work
- Hooks tightened across many murals. New rule established: hooks should be **uplifting/fun**, anchored to the wall, never over-promise (no leads with survival, funeral homes, etc.)
- New rule established: **never add unverified facts** (e.g., relationships, ages, roles) — facts only, with sources
- New rule established: **every YAML must have URL sources in sourceNotes** — field-note observations alone do not count
- New rule established: **HARD RULE — research must list sources** (URLs) every time, no exceptions
- New rule established: **GPS over address** — photo GPS is the source of truth for mural location
- Project memory: **artists are now reaching out directly** with corrections (Sol, others) — treat artist-direct edits as authoritative
- Many searchBio expansions completed for ~38 artists via parallel agent fan-out (rate limits hit often; smaller batches more reliable)
- Display bios refreshed for: #10 Sionna+Vitale (no "survival" lead, MacLeish-weighted, no unverified relationships), #12, #15 (no funeral-home lead), #17 (Sol), #22 Dwayne Shepherd, #28, #29 (30-year project pulled in), #58, #64, #68 (Reginald O'Neal — subject identified as historian John Henrik Clarke), #69, #74, #78, #84 (giant lemons hook), #87 (Fatutoa expansion via michaelfatutoa.com), #91 (St. Pete Distillery tie-in), #102, #104, #116 (Chad Mize — separated commercial bio from twiggy bio), #120

## Tooling additions
- `tools/print-yamls.html` — 2-page-cap PDF printer with range parsing, page-count summary, gone banners, screen-only page-break guides; cache-busting on data fetches
- `tools/yaml-editor.html` — cache-busting query param to bypass service worker (was blocking live YAML reloads)
- `scripts/build-data.py` — `muralDescription` → `searchMuralDescription` rename; `gone`/`goneDate`/`goneReason` export

## App + UI
- **About dialog** added (tap any tab title row); "support@muralquest.app" mailto baked in
- `.tab-title-row` clickable across all 4 tabs

## Field updates
- Reverse-geocoded ~21 missing addresses via Nominatim
- `muralDescription` → `searchMuralDescription` migration across 185 YAMLs
- #105 marked `gone: true` (no goneDate known)
- #56 yaml deleted (duplicate / not shown)
- Renames: 038 + 129; 193 Chris Dyer → Unknown after agent verification (style/location/no docs)

## Marketing site (muralquest.app)
- `/support` deployed (FAQ-style, mailto links)
- `/privacy` deployed
- `index.html` updated; copy refresh
- All `hello@` ↔ `support@` swaps applied per request
- Cloudflare Email Routing set up for **both** support@muralquest.app and hello@muralquest.app

## App Store Connect (v1.1 metadata pushed via API)
- Description rewritten — Mural Quest as $6.99 paid app, 175+ murals, 10 years SHINE catalog (+ commercial/historic/one-offs); discovery-mode language stripped
- Subtitle, promotional text, keywords, marketing/support URLs, copyright all set
- Categories pushed
- Build 119 attached
- **USA-only availability** flipped (manual — API does not allow updates)
- Banking/business onboarding done via top-level https://appstoreconnect.apple.com/business
- **Remaining for submission**: screenshots (still required from Rob), final "Add for Review" click

## New murals added this session
- **#195 Sam Yong** (SHINE 2017, Grayspeed) — initially mis-attributed Angela Delaplane SHINE 2016; corrected per samyong.art primary source. YAML fully rewritten with Sam Yong bio + sources. **Cleanup left**: image still at `images/murals/2016/angela-delaplane-ospreys.jpeg` — needs rename to `images/murals/2017/sam-yong-ospreys.jpeg`. Stale duplicate `195-angela-delaplane-2016.yaml` removed today.
- **#196 Chad Mize** — Eye Love St Pete commercial wall, fully written
- **#197 Quinn Cale** (SHINE Origins 2025, Tyrone Middle School) — added today, fully written, image copied (GPS 27.79366, -82.72751)
- **#198 James Oleson** (Stonehenge Park, neo-surrealist face under Tyrone Blvd overpass on Pinellas Trail) — image staged (`images/murals/unknown/james-oleson-stonehenge-park.jpeg`); research agent dispatched; YAML pending agent return

## Known cleanup pending
- #195 image path migration (2016/angela-delaplane-ospreys.jpeg → 2017/sam-yong-ospreys.jpeg)
- _index.json regen (after #197 + #198 land)
- `python3 scripts/build-data.py` regen
- Bump CACHE_NAME (sw.js v140 → v141), `app.js?v=140` → v141 — for next build
- Bump CFBundleVersion + CURRENT_PROJECT_VERSION 119 → 120 — for next build
- Final App Store screenshots upload + "Add for Review"
