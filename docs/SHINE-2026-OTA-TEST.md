# SHINE 2026 — OTA Photo Pipeline Test (stub #900)

A single held mural (`data/murals/900-shine2026-test-stub.yaml`) for proving the
daily-photo pipeline against the **live, shipped app** — no app build needed,
because the binary already carries the build-viewer / construction-badge / photo
client code.

## Status: HELD
- **Not bundled in the binary** — strip #900 (and #999) before cutting the production build.
- **Not published** — nothing is live until you run the publish commands below.
- Placeholder artist/address/coords + a generated placeholder card. It starts with
  **zero progress photos**, so the first OTA publish tests adding the very first one.

## Before you publish (make it real)
OTA publishes to the **live CDN**, so it appears for **all** users (incl. the current
App Store app). Edit the YAML first so it's a real wall, not a placeholder:
- `artist`, `address`, `lat`/`lng` → an actual SHINE 2026 wall.
- Optionally rename the file/id if you want it in the real id range.

## Publish the stub live (OTA — no build)
```bash
python3 scripts/generate-cards.py                 # builds its card
python3 scripts/publish-images.py --cards-only    # card (+ placeholder) to CDN
python3 scripts/publish-content.py                # pushes content.json (the mural) live
```
→ On next launch the shipped app shows the stub with the teal **"Being painted now"**
badge and the placeholder image (no photos yet).

## Add a daily progress photo (the actual test)
1. Drop the photo in `images/murals/2026/` (e.g. `shine2026-day1.jpeg`).
2. Add it to the YAML's `photos:` list, newest last:
   ```yaml
   photos:
     - { url: "images/murals/2026/shine2026-day1.jpeg", dateTaken: "2026-11-08" }
   ```
3. Publish:
   ```bash
   python3 scripts/generate-cards.py
   python3 scripts/publish-images.py --cards-only   # (full-res: drop --cards-only)
   python3 scripts/publish-content.py
   ```

## What to watch on the phone (~1 min after publish)
- **0 photos:** placeholder card + badge.
- **1 photo:** detail hero becomes that photo (static).
- **≥2 photos:** hero becomes the swipeable **build-viewer** (newest first, dates, 1.5s autoplay, dots).
- **Both platforms + an already-open user** both pick it up on next launch.

## Undo a bad photo
Remove its `{ url, dateTaken }` line from `photos:` → `publish-content.py`. Gone in ~1 min.

## When the test/demo is done
Strip #900 the same way as #999 before any production binary build, unless it's
been turned into a real, permanent 2026 wall you want to keep.
