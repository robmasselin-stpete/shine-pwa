# SHINE 2026 — Feature Spec (finalized 2026-08-16)

Daily construction-photo capture during SHINE (Nov 8–17, 2026 + lead-up), shown as a
swipeable build-viewer in the app. Two workstreams:

1. **Mural Quest app changes** — additive schema, "Shine 2026" filter chip, construction
   badge, build-viewer on the detail page. (App code → needs a build + store review.)
2. **Capture PWA** — a separate standalone iPad PWA that publishes daily photos straight
   to this GitHub repo. (No native build.)

**Design rule:** every mural uses the SAME schema and SAME detail component. Construction
murals just populate more of it. No separate "under construction" type or detail view.

---

## Locked decisions (Rob, 2026-08-16)
- **Publish pipeline = GitHub Action on push.** A commit to `data/murals/**` or
  `images/murals/**` triggers CI that runs `build-data.py`, uploads `content.json` to R2,
  and uploads images to R2 — so "one button → live" is real. (Today NO CI exists;
  `content.json` is gitignored/R2-only and only `publish-content.py`/`publish-images.py`
  push live. This Action is the linchpin that makes the capture PWA work.)
- **Additive schema.** Keep existing single `img`; add optional `photos[]`. 189 existing
  murals untouched — no migration, no invented dates.
- **Reuse `year` + `category`** for the SHINE tag. No new `festivalYear` field. "Shine
  2026" = `category === 'shine' && year === 2026`.
- **No tour / no routes** for these murals (supersedes the old compass-tour idea).
  Discoverability = filter chip + badge only.
- **Alignment = live 40%-opacity ghost overlay** in the capture PWA (align by eye
  in-camera). Supersedes the earlier OpenCV auto-align tool idea.

---

## 1. Schema (additive)
Add to a mural's YAML (`data/murals/*.yaml`) only where relevant:

```yaml
photos:                                  # optional; construction murals populate it
  - { url: "images/murals/2026/207/2026-11-08.webp", dateTaken: "2026-11-08" }
  - { url: "images/murals/2026/207/2026-11-09.webp", dateTaken: "2026-11-09" }
underConstruction: true                  # drives badge + filter; Rob flips to false when done
# SHINE tag reuses existing fields: category: shine + year: 2026 (no new field)
```

- `build-data.py` exports `photos` + `underConstruction` into `data.js`/`content.json`
  (short keys TBD, avoid collisions with existing a/t/img/aud/y/…).
- **Hero image logic:** `photos.length ? photos[last].url : img`. So the newest photo is
  the hero once construction has photos; existing murals keep `img`. Post-festival Rob
  flips `underConstruction:false` — the latest photo stays the hero, it's just a normal
  record with a photo history.
- OTA note: `content.js` replaces mural objects wholesale, so seeding `photos`/
  `underConstruction` via OTA is safe — old app builds ignore unknown fields; the new
  build (with the build-viewer) renders them. No crash risk during the transition.

## 2. Explore: filter chip + badge (app build)
- New **"Shine 2026"** filter chip alongside Vintage/Commissioned → shows
  `category==='shine' && year===2026`. **Temporary festival chip**; post-festival fold
  back into the existing year/shine grouping (manual follow-up, not dynamic logic).
- Murals with `underConstruction===true` get a **distinct static badge/dot** on the map
  pin and list — reuse the existing badge/icon pattern (e.g. the SHINE book icon) for
  consistency, don't invent a new style.

## 3. Build-viewer (mural detail page, app build)
Replaces the single hero at the top of the detail view — visually different only when
`photos.length > 1`.
- Swipeable strip through `photos`, oldest → newest, **date stamp overlaid** per frame.
- **Opens on the most recent photo** (current state), not the oldest.
- Optional autoplay/loop toggle (NOT on by default); when tapped, ~1/3 sec per frame,
  looping. Manual forward/back controls.
- `photos.length === 1` (or 0 → `img`) collapses to a plain static image — same component,
  no special-cased branch elsewhere.
- Rest of the detail view (bio, description) unchanged; renders whatever's available
  day-to-day even if incomplete.

## 4. Capture PWA (separate project; publishes to this repo)
On-site iPad tool: pick mural → camera with yesterday's photo ghosted at 40% for framing
→ capture → optional note → **Publish** = commit to the repo → GitHub Action makes it live.

**Flow:** select active construction mural (or create day-1 record) → camera (ghost overlay
if a prior photo exists) → capture → note + auto date (today) → Publish. Supports a
lightweight multi-mural session (capture several sites in one outing).

**Publish (per the GitHub Action decision):**
- Fetch current mural YAML via GitHub contents API; append `{url, dateTaken}` to `photos`
  (or create the record for a new mural).
- **Downscale the capture client-side** (~1080px WebP) before committing — camera files are
  large; build-viewer frames should be light. (Default; flag if you want full-res kept.)
- Commit the image + YAML in one push. The **Action** then rebuilds + uploads content.json
  and the image (and a card for the newest photo) to R2 → live in ~1–2 min.
- **Fail loudly** in the UI (this runs on festival days) — clear success/failure.

**Undo / revert (festival-day safety — required):**
- Because every publish is a git commit, undo = a commit that removes the bad entry, which
  re-triggers the Action → corrected state live in ~1–2 min. Nothing is ever truly lost
  (full git history).
- The capture PWA needs a clear **"Undo last publish"** button per mural: fetch the YAML,
  pop the most recent `photos[]` entry, commit → republish. One tap, with a confirm.
- Also support **removing a specific frame** from a mural's strip (not just the last), for
  the "wrong photo three entries back" case.
- Leaving the orphaned image file in the repo is harmless (removing the `photos[]` entry
  hides it from the app); optional cleanup later. The revert only needs to edit the YAML.
- Caveat to state in the UI: users who already launched and cached the bad photo keep it
  until their next app launch (~1 min edge cache after republish). New/relaunching users
  get the corrected data immediately.
- **Dedupe guard (complementary):** before publishing, warn if `dateTaken` already exists
  for that mural, or if the new image matches the previous one (hash), to catch the
  "same photo went out twice" case *before* it ships.

**Tech:** `getUserMedia` for camera; installable PWA on the iPad home screen. GitHub REST
contents API (base64 + prev-SHA) for create-or-update. Auth = a **fine-grained GitHub PAT**
scoped to this repo's contents (read/write), stored in the iPad's localStorage — acceptable
for a single-user tool on Rob's own device.

---

## App-code vs OTA (the deadline that matters)
- **Needs an app build + store review (target: submit ~early Sept):** build-viewer,
  "Shine 2026" chip, construction badge, `build-data.py` photos/underConstruction export.
- **OTA / no build (live during the festival):** the daily `photos[]` data and
  `underConstruction` flips — *once the rendering code above is already shipped.*

## Open implementation defaults (I'll assume these unless you object)
- Frame path: `images/murals/2026/<id>/<ISO-date>.webp`.
- Capture PWA downscales to ~1080px WebP before commit.
- The Action generates a **card** for the newest photo so the Explore grid / map pin look
  right for OTA-added construction murals.
- ~25 SHINE 2026 murals, artists/locations TBD — seed placeholder records over time; the
  capture tool creates a record on the fly on day 1.

## 5. Distance-aware directions (app-wide improvement; scoped 2026-08-16)
The 2026 murals are spread across town, so on-foot compass guidance is wrong for
cross-town hops — and a compass pinned to the screen while driving is unsafe. Positioning
principle: **the app is a discovery + on-foot proximity guide, not a turn-by-turn
navigator.** So gate the in-app directions by straight-line distance from the user's GPS:
- **Under 1 mile:** in-app walking guidance as today. No change, no map buttons.
- **Over 1 mile:** replace walking guidance with a nudge — *"That's about X miles away —
  better by car"* — and THREE buttons: **Apple Maps**, **Google Maps**, and **Walk anyway**
  (proceeds to the normal in-app compass for the committed walker).
- Rob's calls: do NOT always show map buttons (leaving the app is friction / hard to get
  back) — only when far. Keep the walk-anyway escape hatch (not paternalistic).
- Handoff = simple deep links (Apple `maps.apple.com/?daddr=lat,lng`, Google
  `google.com/maps/dir/?api=1&destination=lat,lng`). Small effort; rides the SHINE build.
- To check when building: what the current detail-page "Directions" button does today
  (in-app compass vs already a handoff); whether the threshold should also affect the
  compass tour for any far stops.

### 5a. 2026 mural-to-mural navigation flow (scoped 2026-08-16)
Primary flow (Rob): Map page → turn on the **"Shine 2026"** filter → 2026 pins show → tap
the next mural → app computes distance **from current GPS** → the 1-mile rule (above) applies.
Reframe: it's **"from wherever you are → selected mural,"** not literally "at a mural" — same
logic works planning from home or across town, so no need to detect which mural you're at.

Refinements to include:
- **Distance on the pin callout.** Tapping a 2026 pin shows a light popup — e.g. *"Cecilia
  Lueza · 0.4 mi"* — with the walk/maps choice inline, so you can compare several pins and
  pick the next without diving into full detail pages each time (better for festival hopping).
- **"Nearest 2026 murals" sorted list** as a complement to the map — sorted by distance from
  current GPS ("0.3 mi, 1.1 mi, 2.4 mi…"). Directly answers "what's closest to me right now?"
  Consider a toggle on the filtered view.
- **Straight-line distance is a rough proxy.** The rule uses haversine (no routing); St. Pete
  water/barriers mean a 0.9 mi straight-line hop can be ~1.4 mi by road. Accept as rough for
  v1 (optionally nudge threshold to ~0.8 mi to compensate).
- **No-GPS fallback.** If location is denied/unavailable, skip the distance calc and just show
  the maps buttons (the maps app resolves "from here" itself).

## Timeline
- **Aug–early Sept:** GitHub Action + `build-data.py` changes + app UI (build-viewer, chip,
  badge, distance-aware directions) + capture PWA. Test with 1–2 dummy construction murals.
- **~Early/mid Sept:** submit the app build (budget for a rejection + resubmit).
- **During festival (Nov 8–17):** daily captures via the PWA → live over OTA, no build.
