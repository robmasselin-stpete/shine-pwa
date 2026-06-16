# Mural Quest — Session Handoff

## 2026-06-16 update (latest)

- **v1.3 / build 128 submitted to App Store review** (state WAITING_FOR_REVIEW),
  auto-release on approval. Rob checks ASC daily; no monitoring needed.
- **Git working tree is now COMMITTED + PUSHED** (`3ec8086`) — supersedes the
  June 5 note below about the tree being "dirty but pre-existing." First commit
  since Apr 7; ~2 months of work (70 new murals, images, routes) now in history
  on the public GitHub `robmasselin-stpete/shine-pwa`.
- Build env + signing were fixed headlessly (CoreSimulator/platform install;
  created the account's first Apple Distribution cert + App Store profile).
  Build flow now wrapped in `assets/wip/mq_build.sh` (gitignored) with an
  uncommitted-work guard. Full detail: memory `project_v13_submission_staged.md`.
- Ads are now live in the **downtown guide**; observing v1.3 + ads for ~1 month.

## 2026-06-05 update

### How to resume

For the **app** (shine-pwa): `cd ~/shine-pwa && claude`, then "Read HANDOFF.md."
For the **marketing site** (muralquest.app): `cd ~/muralquest-website && claude`, then point at this file: "Read ~/shine-pwa/HANDOFF.md."

`~/shine-pwa/CLAUDE.md` auto-loads in the app dir. The auto-memory (always loaded) now includes pointers to the corrected marketing-site path and the "mockups are to-scale" feedback rule, so a fresh session won't re-discover those.

### Marketing site (muralquest.app) — shipped today, live

Full hero redesign deployed at https://muralquest.app:
- Replaced the Poseidon full-bleed photo with a **cream split layout**: headline left (ink, brick accents preserved: *can / can't / front*), three app screenshots fanned right (`app-map` → `app-explore` → `app-tours`, native 1179×2556 aspect ratio enforced via `aspect-ratio: 1179/2556`).
- Eyebrow `St. Petersburg, Florida · 175+ murals · 128 artists` is **full-width on top**, `white-space: nowrap`, 11px to match the `.section-eyebrow` below.
- Phones are **top-anchored** (`align-items: flex-start`, `transform-origin: top center`) so they never clip when the window narrows.
- Stats row holds 4-up at every width — both number (`clamp(28px, 4.4vw, 64px)`) and label (`clamp(9px, 1.05vw, 16px)`) scale with window width; 2×2 collapse rules at 1024px and 640px removed.
- Artist cards stay side-by-side down to 640px (was collapsing at 1024px). Map iframe reverted to the original `ensureSized` behavior (don't re-introduce `fitBounds` unless explicitly asked).
- Source files: `/Users/robasselin/muralquest-website/index.html`, `map.html`, `js/`, `images/app-*.jpeg`. **NOT a git repo** — reverts are by hand or via Netlify deploy history.
- Deploy: `cd ~/muralquest-website && netlify deploy --prod --dir . --site d3f1178c-10b7-4d75-92eb-da83096a7fee`
- Stale sibling at `/Users/robasselin/muralquest/` (Apr 27) — do NOT edit or deploy from it.

### Open / parked threads (no commitments)

1. **Mobile vs. desktop refinement** — Rob's call: "looks good for now, need to think about it." The hero body collapses to stacked at ≤760px, artists at ≤640px, stats stay 4-up via clamp. The decision left is whether the phone fan should shrink-and-stay or drop below the headline on small screens.
2. **SPAA mural titles** — parsed all 199 SPAA directory entries against the local YAMLs and produced an approval table grouped by ADD / CHANGE / SAME / NEEDS-MANUAL. **Nothing applied to YAMLs.** Rob hasn't said go. SPAA's `/find-arts/shine-mural-festival/` requires clicking "Load all"; the raw paste was in chat. ⚠ Flag two SPAA typos to NOT import: "Exsistence is Absurd" (LOOK the Weird #135) and "Estatic Rhythm" (Taylor White #180).
3. **Narrated routes / ElevenLabs voice clone** — Rob said he'd record a 60-sec voice sample for Instant Voice Clone. Status unknown. Scripts (opener + Donnelly snippet, rewritten for ElevenLabs natural pacing) preserved in the older handoff section below.
4. **Icon variant pick** — 4 variants saved at `~/shine-pwa/assets/wip/icon-variants/` (A/B/C/D). Rob hasn't picked.
5. **Recover {from, to, path} segments for 5 other routes** — downtown-north and the-edge have them; arts-district, central-ave, methodist-town, tropicana-field, chna-bike are flat-format only after a build-routes.py mishap. Per-leg navigation silently no-ops on those routes. Fix is to re-export from `tools/route-editor.html`.

### What's at risk on this reboot

- **/tmp is essentially empty already** — the SPAA raw file from this session was cleaned up; original paste is in chat history if needed.
- All marketing-site source is in `~/muralquest-website/` (durable) and live on Netlify (durable).
- shine-pwa's git working tree is dirty but pre-existing (none of today's work touched the app).
- Memory entries are under `~/.claude/projects/-Users-robasselin/memory/` — durable.

Nothing else to do before reboot. Close cleanly.

---

# Historical handoff (2026-05-26)

## How to resume (legacy notes)

In the new Claude Code session:

```
cd ~/shine-pwa
claude
```

Then say: **"Read HANDOFF.md and pick up where we left off."** The `~/shine-pwa/CLAUDE.md` will already auto-load with the project workflow rules.

---

## What was done this session (committed to disk, survives reboot)

### Mural 154 — Justin Bass / Tru
- Rewrote `artistBio`, `searchBio`, `muralInspiration` around the 1914 Benoist flight (Tony Jannus, Mayor Pheil, $400 auction seat). Research URLs logged in `sourceNotes`.
- Reclassified all three birds as flamingos (was pelican/flamingo/pelican). Renamed file `154-justin-bass-commercial.yaml` → `154-justin-bass.yaml`, updated `_index.json`.
- Edited the searchBio line "*The boombox the flamingo carries is the 112-year update — same route, different soundtrack*" → "*The flamingo is the 112-year update — same route, different vibe.*"
- `js/data.js` regenerated.

### Downtown North route updates
- Mural 129 (John Vitale) lat/lng → 27.771668 / -82.642127
- `ROUTE_DEFS` reorder in `js/app.js:1787` and `scripts/build-routes-osrm.py`: ids now `[6, 116, 23, 30, 1, 66, 129, 109, 110, 7, 9, 111, 115, 73, 24]`
- `js/routes.js` `downtown-north` segments replaced with the new path payload (15 segments, distance 2.13). The other 6 routes' segments got rebuilt by build-routes.py during a misstep (see below) — they still render fine but lost `{from, to, path}` labels for per-leg navigation.
- `data/routes/downtown-north.geojson` rebuilt to match the new ordering.

### New durable artifacts
- **`~/shine-pwa/CLAUDE.md`** — repo-level guide for Claude Code: covers the two editor PWAs (`tools/yaml-editor.html`, `tools/route-editor.html`), how to apply their pastes, and the routes.js format gotcha.
- **Memory entry** `feedback_route_editor_is_source.md` — hard rule: never run `scripts/build-routes.py` to regenerate `js/routes.js` (it emits the deprecated flat format and breaks per-leg nav). Route-editor PWA is the source of truth.
- **Memory entry** `project_mural_quest_android_shelved.md` — Android port shelved 2026-05-25; ~15-20% audience gain not worth 2x maintenance. Do not re-litigate unless the calculus changes.

### Final video
- `~/Desktop/ScreenRecording_titled.mp4` — 16.5s, 590×1280 portrait, three Quicksand 700 black-text titles (no box) timed 2-6 / 7-11 / 12-16, with 0.4s fade in/out. Built with ffmpeg + PIL-rendered title PNGs. Source: `~/Desktop/ScreenRecording_05-26-2026 15-59-00_1.mov`.

---

## Pending decisions / open threads

### 1. App icon wordmark — pick a variant
Four versions live at **`~/shine-pwa/assets/wip/icon-variants/`** (already saved off /tmp before reboot). Pelican mark from `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (cropped to artwork bounds) with "mural quest" wordmark in Quicksand below.

- `mq-icon-A-lowercase-500.png` — `mural quest`, weight 500 (lightest)
- `mq-icon-B-lowercase-600.png` — `mural quest`, weight 600 *(my pick for marketing/social)*
- `mq-icon-C-uppercase-700-spaced.png` — `MURAL QUEST`, weight 700, letter-spaced *(my pick for poster/wordmark feel)*
- `mq-icon-D-uppercase-600-spaced.png` — `MURAL QUEST`, weight 600, letter-spaced

**Decision needed:** which variant becomes the master? Also possible follow-ups: different bg color (sandy off-white / pelican teal), wider hero ratio (3:1), square 1200×1200 social profile, optional "St. Petersburg, FL" subline.

To regenerate variants, the Quicksand TTFs are at `~/shine-pwa/assets/wip/fonts/`. The PIL composition logic is documented below.

### 2. Video — should the black text get a subtle drop shadow or thin outline?
Black text with no box will be hard to read whenever the underlying screen recording goes dark. Two no-box-feel fixes pending your call:
- Single soft drop shadow
- Thin white outline stroke on the letterforms
- Or leave pure black

### 3. Narrated routes — voice cloning
You confirmed you'd try ElevenLabs **Instant Voice Clone** with your own voice ("deep, resonant, logical, clear — radio voice"). The recording script you'd read is in this doc below. Status: not yet recorded.

After cloning:
1. Validate with the one-sentence test from the chat: "*Your first stop is twenty feet in front of you. Derek Donnelly. St. Pete native, graphic designer.*"
2. If it sounds like you → render the rewritten opener and Donnelly snippet (text below) and listen back-to-back.
3. If yes → scale to the rest of downtown-north (~14 more snippets), then other 6 routes.

### 4. Other routes lost `{from, to, path}` segments
During this session, an accidental `build-routes.py` run wiped the `{from, to, path}` segment labels for 5 of 7 routes (arts-district, central-ave, methodist-town, tropicana-field, chna-bike). The route LINES still render on the map via the `s.path || s` fallback in `app.js:1181`, but per-leg navigation (the `find(s => s.from === fromId && s.to === toId)` lookup at app.js:2211 and 3684) returns nothing for those routes.

**To recover:** open `tools/route-editor.html`, load each affected route, re-export the Path Changes payload, paste here. New rule (now in memory): never run build-routes.py again.

---

## Reference: route-editor and yaml-editor workflow

Both are PWAs in `~/shine-pwa/tools/`. Source of truth for routes and YAMLs respectively.

When you paste their export blocks:
- **YAML editor** export starts with `# ═══ Modified YAML Files ═══`. Apply each YAML block verbatim to `data/murals/{id}-{slug}.yaml`. Update `_index.json` if a filename changed. Run `python3 scripts/build-data.py`.
- **Route editor** export has three sections (`GPS Position Updates`, `Route Definition`, `Path Changes`). GPS updates go into mural YAMLs. Route Definition goes into `ROUTE_DEFS` in `js/app.js:1785` AND `scripts/build-routes-osrm.py`. Path Changes goes into `js/routes.js` — Python-splice only the named route, do NOT run build-routes.py.

Full detail in `CLAUDE.md`.

---

## Reference: narrated route scripts (rewritten for ElevenLabs natural pacing)

### Voice clone — recording script (read this, not the narration scripts, to clone your voice)

> This is going to sound like a test, because it is. I'm recording this so a computer has enough of my voice to figure out how I talk. I live in St. Petersburg, Florida, and I've been here long enough to remember when most of these walls were blank. The murals you're about to walk past were painted between 2015 and 2025, mostly during a festival called SHINE. Some of them are by famous artists. Some are by people who paint here every weekend and have day jobs as electricians. A few are by both. Take your time. The walking part is half of it.

Recording tips: small carpeted space (closet with clothes is the classic), phone 6-8" from mouth slightly off-axis, Voice Memos at Lossless quality, mid-day energy.

### ElevenLabs settings for the cloned voice
- Stability: 35
- Similarity: 80
- Style exaggeration: 25
- Speaker boost: on
- Speed: 1.1
- Model: Eleven Multilingual v2 (or v3 if available)

### Downtown North — opener (~88 sec)

> You're standing in the 600 block of Central Avenue, and this is where SHINE started. In 2015, the St. Petersburg Arts Alliance, they go by spa, picked a name for the festival, raised some money, and invited a dozen artists to paint these walls. They thought it might run for a year, maybe two. It's been ten.
>
> What you're about to walk is the original. Fifteen murals between this corner and the waterfront. Most are by SHINE artists, some are by the people who organize SHINE, and a few predate the festival entirely. "Pre-SHINE," the artists call them, because nobody knew what to call it before there was a name.
>
> Your first stop is twenty feet in front of you. Derek Donnelly. St. Pete native, graphic designer. He opened a gallery called Saint Paint on this same block in 2011, a launchpad for half the artists you're about to see. The piece you're walking toward is his. Start walking, I'll find you at the wall.

### Mural 6 — Derek Donnelly, "Greetings from Hollander Hotel" (~70 sec)

> This is "Greetings from Hollander Hotel," a vintage postcard blown up onto a wall. The kid on the pelican is Donnelly's son. His name is Syre, and you'll see him in other Donnelly murals across the city. The pelican is the city's bird. The bridge in the distance is the Sunshine Skyway. Donnelly's own description: "a celebration of all things local, with my son and our city's bird."
>
> Donnelly has painted in St. Pete for ten years. For SHINE 2025, he ran the whole festival. Booked the artists, coordinated the walls, kept the schedule. This is one of two pieces he painted that year, and it's the first time he'd ever been featured as a SHINE artist after a decade of organizing it.
>
> Take a minute. The next wall is right here, same building, north face. Chad Mize is your next stop. I'll find you.

**Pronunciation to verify before rendering Syre:** "SIGH-er" (rhymes with *fire*) or "SEER" (one syllable)? Update the script with the spelling, or use the ElevenLabs Pronunciation Dictionary.

---

## Reference: video composition technique (in case we want to re-render)

Source video: `~/Desktop/ScreenRecording_05-26-2026 15-59-00_1.mov` (16.5s, 590×1280 portrait, 60fps)

### Title PNG generation (PIL)

```python
from PIL import Image, ImageDraw, ImageFont
FONT = ImageFont.truetype('/Users/robasselin/shine-pwa/assets/wip/fonts/Quicksand-700.ttf', 72)
W, H = 590, 1280
Y_CENTER = int(H * 0.22)
# Black text, no backplate, two lines centered, line_spacing=18
# Render each line at (W-line_width)/2, y starting at Y_CENTER
# Save as transparent PNG
```

Title texts (each on two lines):
1. "St. Pete has" / "175+ murals."
2. "Good luck finding" / "them all."
3. "So I mapped" / "every one."

### ffmpeg composition

```bash
IN="$HOME/Desktop/ScreenRecording_05-26-2026 15-59-00_1.mov"
OUT="$HOME/Desktop/ScreenRecording_titled.mp4"
ffmpeg -y -i "$IN" \
  -loop 1 -t 4.0 -i title1.png \
  -loop 1 -t 4.0 -i title2.png \
  -loop 1 -t 4.0 -i title3.png \
  -filter_complex "\
[1:v]format=rgba,fade=t=in:st=0:d=0.4:alpha=1,fade=t=out:st=3.6:d=0.4:alpha=1[t1];\
[2:v]format=rgba,fade=t=in:st=0:d=0.4:alpha=1,fade=t=out:st=3.6:d=0.4:alpha=1[t2];\
[3:v]format=rgba,fade=t=in:st=0:d=0.4:alpha=1,fade=t=out:st=3.6:d=0.4:alpha=1[t3];\
[0:v][t1]overlay=enable='between(t,2,6)'[v1];\
[v1][t2]overlay=enable='between(t,7,11)'[v2];\
[v2][t3]overlay=enable='between(t,12,16)'[outv]" \
  -map "[outv]" -map 0:a -c:a copy -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p "$OUT"
```

**Note:** Homebrew's default ffmpeg lacks the `drawtext` filter (no libfreetype). The PIL → PNG → overlay pattern is the workaround. Don't try ffmpeg's `drawtext` without first installing `homebrew-ffmpeg/ffmpeg/ffmpeg` from the full tap.

### Social caption (paste under the video on IG/TikTok)

> St. Petersburg has over 175 murals hiding in plain sight. I spent two months photographing and pinning every one I could find, so you can see exactly where they are — and how many you've walked right past. This is the map. 📍
>
> Mural Quest. St. Pete's street art, in your pocket.
>
> #StPete #StPeteArt #MuralQuest #SHINEStPete #StreetArt #DTSP

(App actually contains 186 murals per current build. "175+" rounds down for the headline. If you want to bump to "186" in the on-screen title, ask and I'll re-render.)

---

## Where things live after reboot

| Thing | Path |
|---|---|
| This handoff | `~/shine-pwa/HANDOFF.md` |
| Repo CLAUDE.md (auto-loads in Claude Code) | `~/shine-pwa/CLAUDE.md` |
| Auto-memory (always loaded) | `~/.claude/projects/-Users-robasselin/memory/MEMORY.md` |
| Icon variants | `~/shine-pwa/assets/wip/icon-variants/` |
| Quicksand fonts | `~/shine-pwa/assets/wip/fonts/` |
| Title PNGs + source text files | `~/shine-pwa/assets/wip/video-titles/` |
| Final titled video | `~/Desktop/ScreenRecording_titled.mp4` |
| Source screen recording | `~/Desktop/ScreenRecording_05-26-2026 15-59-00_1.mov` |
| Mural Quest icon source | `~/shine-pwa/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` |

`/tmp/mq-icon/` and `/tmp/mq-video/` will be wiped on reboot. Everything important has been copied to `~/shine-pwa/assets/wip/`.

---

## First thing to do in the next session

Tell Claude which thread to resume:
- *"Pick the icon variant — I want B"* (or A/C/D)
- *"Add a thin white outline to the video titles"*
- *"I recorded my voice clone — here's the file at ~/Desktop/clone.m4a"*
- *"Recover the from/to segments for the other 5 routes"*
- Something else entirely

Each thread is self-contained from here.
