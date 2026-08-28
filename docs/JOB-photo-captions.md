# JOB SPEC — photo captions for SHINE 2026 daily updates

**Scope of this job: the Worker and the capture PWA only.** The app-side render is
deliberately NOT in scope — it ships separately in binary v1.7.6. Read "Why the split
is safe" before worrying that this leaves something half-built.

Repo: `/Users/robasselin/shine-pwa`. Read `CLAUDE.md` first — it carries the project
rules, and the "SHINE 2026 field capture" section describes this pipeline.

---

## The goal

Rob photographs an in-progress mural on his iPad during SHINE (Nov 8–17 2026) and the
photo is live in the app in ~1 minute. He wants to attach a one-line caption to each
photo — "Outlines up", "Second day, rain stopped play" — that travels with it.

## What exists today

`tools/mural-capture.html` (Progress Capture PWA, served from mural-tools.pages.dev)
POSTs to `https://capture.muralquest.app/photo`, which is the Worker at
`workers/mural-capture/src/index.js`. The Worker:

1. Authenticates on header `X-Capture-Key` against secret `POST_KEY`.
2. Decodes `imageBase64`, writes it to R2 at
   `images/murals/2026/<id>-<date>-<HHMMSS>.jpeg` (immutable, 1-year cache).
3. Loads `content.json` from the same R2 bucket (`muralquest-content`, binding `BUCKET`),
   finds the mural, pushes `{u, d}` onto `mural.ph`, sorts oldest→newest, sets
   `mural.uc = true`, bumps `data.version = Date.now()`, writes `content.json` back.

The app polls `content.json` and re-renders in place, so the photo appears without a
restart.

---

## Task 1 — Worker: accept and store a caption

**File:** `workers/mural-capture/src/index.js`

Photo entries become `{u, d, c}` where `c` is the caption. Add to `POST /photo`:

- Read `body.caption`. Optional — absent, empty, or whitespace-only means **omit `c`
  entirely** rather than writing `c: ""`. Keeps the manifest clean and lets the app
  test `p.c` truthily.
- Trim it. Cap at **140 characters** — reject with 400 `caption_too_long` rather than
  silently truncating, so Rob finds out at the wall and not later in the app.
- Strip control characters. This string goes into HTML on the app side.
- Include the caption in the `dry` response so `?dry=1` still tests the whole path.

## Task 2 — Worker: amend the most recent caption

New endpoint, because a typo currently can't be fixed without sending a duplicate photo.

**`POST /caption`**, same `X-Capture-Key` auth.

- Body: `{ muralId, caption }`.
- Amends `c` on the **last** entry of that mural's `ph` (the array is sorted
  oldest→newest, so `ph[ph.length - 1]`).
- Same validation as Task 1. An empty caption **clears** `c` — that is the intended way
  to remove a bad caption.
- 404 if the mural is unknown or has no photos.
- Bump `data.version` and write `content.json` back, same as `/photo`.
- Return the amended entry so the PWA can confirm what is now live.

**Do not touch the image.** This endpoint only edits `content.json`. It must never write
to, rename, or delete an R2 image object.

## Task 3 — PWA: caption field

**File:** `tools/mural-capture.html`

- A single-line text input above the existing `#send` button, `maxlength="140"`, with a
  live remaining-character count. Placeholder something like "Optional caption —
  'Outlines up'".
- Include `caption` in the existing `JSON.stringify({ muralId, date, imageBase64 })`
  payload at roughly line 193.
- **Clear the field after a successful send.** Otherwise yesterday's caption silently
  rides along on tomorrow's photo, which is worse than having no caption.
- After a successful send, offer an inline "Fix caption" affordance that POSTs to
  `/caption` for the photo just sent. Keep it simple — it exists so a typo spotted ten
  seconds later is fixable on the spot.
- The success message (currently "✓ LIVE — photo #N…") should echo the caption that was
  stored, so Rob can see what actually landed.

Match the existing style in the file. It is a single self-contained HTML page with inline
CSS and JS, no build step, no framework. Do not introduce one.

---

## Why the split is safe

Adding `c` to `content.json` is invisible to shipped app versions — 1.7.5 reads `u` and
`d` and ignores unknown keys. So this job can deploy the day it is finished, Rob can
caption from day one of the festival, and every caption already sent lights up
retroactively when v1.7.6 adds the render. **Nothing needs to be held back or sequenced.**

Do not attempt the app-side render. The caption bar has real design constraints (fixed
min-height so swiping does not shift the layout, full collapse when empty, must render in
both the single-photo hero and the multi-photo build viewer) and it belongs with the
binary work.

---

## Testing

There is no staging environment. The Worker writes to the production manifest, so:

1. Use `dry: true` first — it exercises validation and key generation without writing.
2. For a live end-to-end test, use a **held test mural**, not a real wall. See
   `docs/SHINE-2026-OTA-TEST.md`; stub #900 lives in gitignored `.mq-held/` and exists
   for exactly this. A held mural is not in `content.json`, so re-add it, test, then
   purge — the doc has the procedure.
3. Verify `https://cdn.muralquest.app/content.json` shows `c` on the entry and that
   `version` advanced.
4. Confirm 1.7.5 still renders the photo normally with `c` present. This is the one
   result that must hold: **an unknown key must not break a shipped client.**

## Deploying

- Worker: `cd workers/mural-capture && npx wrangler deploy` (wrangler must be
  authenticated — `npx wrangler whoami`).
- PWA: `bash scripts/deploy-tools.sh`. The tools site serves a **snapshot** and does not
  refresh on its own — see the gotcha in CLAUDE.md. Rob's iPad will keep running the old
  page until this is deployed.

## Constraints

- The POST key lives in gitignored `.mq-capture-key` and as Worker secret `POST_KEY`.
  **Never commit either, and never put the key in the PWA source** — that page is served
  publicly and the PWA already prompts for the key and holds it in `localStorage`.
- Do not change the image key format. The `<id>-<date>-<HHMMSS>` time token exists
  because a reused key resurrected a stale frame from the CDN cache during a live field
  test on 2026-08-24. The reasoning is in a comment block above it; leave it intact.
- Do not make the Worker write source YAML. `publish-content.py` reconciles `ph`/`uc`
  back into the YAMLs before rebuilding, and that step will need to learn about `c` —
  **flag it, do not fix it here.** It is a separate change with its own failure modes.
- Keep `/photo` backward compatible. An older PWA sending no caption must still work.
