# SHINE 2026 — Live Festival Plan (progress loops + 2026 tour)

Two features for SHINE 2026 (~25 murals, festival ~early–mid Oct 2026):

- **A. Daily progress loops** — a photo a day per mural, auto-aligned into a
  client-side time-lapse on the mural detail page ("watch it come together").
- **B. A compass-guided 2026 tour** — walk to the in-progress murals; no baked
  street path (compass/GPS to each stop), so it can populate live over OTA.

**Locked decisions (Rob):** ~25 murals · client-side loop · auto-align in a tool
(OpenCV) · compass-guided tour · loop lives on the **mural detail page**, which
should carry *every* bit of info for the artist.

---

## The one rule that shapes everything: build vs OTA

- **OTA (live during the festival, ~1 min, NO App Store review):** mural data,
  GPS locations, images, audio, the daily progress frames, status flips. Runs
  through the existing pipeline: `data/murals/*.yaml → build-data.py →
  content.json on cdn.muralquest.app → js/content.js applies it at launch`.
- **App build + Apple review (must be APPROVED before ~Sept, buffer for a
  rejection like the v1.6 EULA one):** any new *app UI*, any new *field the app
  must render*, and tour route logic. `ROUTE_DEFS`/`routes.js` are bundled, not OTA.

**Strategy: ship the new app *code* in a build before the festival; feed it
*data* live during the festival.**

---

## Data model (YAML → content.json, OTA)

Add to each 2026 mural's YAML:

```yaml
# ordered daily frames; aligned + web-optimized, hosted on the CDN
progress:
  - { d: "2026-10-05", img: "images/murals/2026/progress/207/2026-10-05.webp" }
  - { d: "2026-10-06", img: "images/murals/2026/progress/207/2026-10-06.webp" }
status: in-progress        # in-progress | complete  (drives the "being painted now" badge)
festival: 2026             # marks it as a SHINE-2026 tour stop (so the tour auto-populates)
tourOrder: 3               # optional: fixed walk order; else the tour orders by proximity
```

- `build-data.py` exports these as short keys (e.g. `prg`, `stat`, `fest`,
  `ord`) alongside the existing ones (`a`, `t`, `img`, `aud`, …). `content.js`
  applies them in place — no client change needed to *receive* them.
- Progress frames are **CDN-hosted and streamed** (like full-res photos via
  `fullSrc()`), NOT bundled — they're added daily after the app ships. The SW
  caches each on first view.

---

## Feature A — the progress loop

### The hard part: alignment
Freehand day-to-day photos won't line up; an unaligned loop looks like jitter.
Approach = **physical consistency + auto-align tool**:
1. Shoot from a marked spot / same stance each day, keeping the **wall edges and
   surroundings in frame** (those are the fixed features the aligner locks onto —
   the painting itself changes and can't be the anchor).
2. The tool feature-matches (ORB/SIFT) each day's photo to a **reference frame**
   (day 1, or a designated frame), estimates a homography, warps + crops to the
   reference. Day-1 blank-wall → day-7 full-mural matching is the risky case;
   matching on the fixed border/context handles it. If it can't get a confident
   fit, it **falls back to the raw photo and flags it** for a manual crop.

### Tool: `scripts/add-progress-photo.py`
`add-progress-photo.py <mural_id> <photo.jpg> [--date YYYY-MM-DD] [--ref <first-frame>]`
1. Align + crop the photo to the mural's reference frame (OpenCV).
2. Encode to WebP (~900–1080px; ample for the detail-page loop, light to stream).
3. Save to `images/murals/2026/progress/<id>/<date>.webp`.
4. Append `{d, img}` to the mural's YAML `progress` list.
5. Chain the existing publish steps: `publish-images.py --cards-only`-style
   upload of the new frame to R2 + `publish-content.py` → **live in ~1 min.**
- Dependency: `pip install opencv-python` (note in the tool's header).
- One command per day per mural to add today's frame.

### App UI (needs a build)
- On the **mural detail page**, when `prg` has ≥2 frames: a **"Watch it come
  together"** player — cycles the frames (play/pause, day/date label, optional
  scrub bar), cross-fade or hard-cut, preloading the next frame. Pure client-side
  animation over the OTA image list.
- The detail page is the hub: full artist bio/awards/links (already there) + the
  loop + status. "Every bit of info for the artist" lives here.

---

## Feature B — compass-guided 2026 tour

- **Free discovery already exists:** add the 25 murals with `y: 2026` and they
  appear under the **2026 year filter** on Map + Explore. Zero new code.
- **The guided tour (needs a build):** a **dynamic "SHINE 2026" tour** whose stops
  are sourced from the *current data* — every mural with `festival: 2026` — rather
  than a hardcoded `ROUTE_DEFS` id list. That way stops appear as murals are added
  OTA, with no app update.
  - **Compass-only:** guidance uses GPS→mural bearing + arrival (already how the
    compass/arrival work); no `routes.js` street path required. You lose only the
    drawn route line — acceptable for a "find them" festival tour.
  - **Order:** by `tourOrder` if set, else nearest-neighbor by proximity.
  - **"In the making":** `status: in-progress` badges the stop ("Being painted
    now") on the tour/map/detail.

---

## What must ship in the app build (before Apple review, ~early Sept)
1. `build-data.py` — export `progress`, `status`, `festival`, `tourOrder`.
2. Detail-page **progress-loop player** (app.js + app.css).
3. **Dynamic SHINE-2026 compass tour** (stops from `festival: 2026`, compass-only,
   proximity/`tourOrder` ordering).
4. **Status badge** ("Being painted now") on detail/map/tour.
5. SW: cache the progress-frame CDN path (fits the existing image caching).

## What stays OTA (live during the festival, no review)
- The 25 murals' data + locations (as walls firm up).
- **Daily progress frames** (the ingest tool).
- Status flips (in-progress → complete).
- The tour auto-populates from `festival: 2026` murals.

---

## Timeline / critical path
- **Aug–early Sept:** build the app code (above) + the `add-progress-photo.py`
  tool; test the loop + tour with a couple of dummy 2026 murals.
- **~Early/mid Sept:** submit the app version. **Budget for a rejection + resubmit**
  (v1.6 got bounced once). Aim for approval with weeks to spare before Oct 10.
- **Pre-festival:** add 2026 mural stubs (artist, tentative wall) via OTA.
- **During festival:** one `add-progress-photo.py` run per mural per day; confirm
  locations; flip statuses. All OTA — no deadline pressure once the app is live.

## Open items to nail before building
- Reference-frame choice per mural (day 1 vs a designated clean shot) and the
  alignment confidence threshold / manual-fallback UX.
- Loop playback feel: auto-play on detail open vs tap-to-play; speed; cross-fade.
- Exact short keys in build-data.py (avoid collisions with existing a/t/img/…).
- Whether progress frames also want a tiny bundled "poster" (first frame) so the
  loop has something to show instantly offline before the CDN frames load.
