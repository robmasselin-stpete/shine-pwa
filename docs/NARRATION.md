# Narration Scripts — ElevenLabs Walking Tours (v1.5)

Mural Quest's narrated walking tours play a short spoken script as you reach each
mural, read in Rob's own cloned ElevenLabs voice, triggered by proximity (phone in
pocket, background location — see `docs/BACKGROUND-LOCATION-REVIEW.md`). This doc
covers how those per-mural scripts are drafted, reviewed, and applied.

## Where a script lives (the data path)

The narration text is the **`audio:`** field in a mural's YAML
(`data/murals/{id}-{slug}.yaml`). `scripts/build-data.py` maps it to **`aud`** in
BOTH `js/data.js` (bundled fallback) and `js/content.json` (OTA manifest). So the
apply flow is the normal content pipeline:

1. Put the final script text in the mural's `audio:` YAML field.
2. `python3 scripts/build-data.py` → regenerates `js/data.js` + `js/content.json`.
3. Ship it OTA with `scripts/publish-content.py` (no app rebuild), or bundle it in
   the next build.

As of 2026-07-15 all 189 live murals have an **empty** `aud` field — the schema slot
exists, the content doesn't yet.

## Drafting scripts — `scripts/gen-narration.py`

Drafts audio-tuned scripts from existing mural data (`insp` inspiration + `bio` +
`desc`) via the Claude API, in Mural Quest's voice adapted for the ear. Writes each
draft to `data/narration/{id}-{slug}.txt` for **review** — nothing is applied to the
YAMLs automatically.

```
python3 scripts/gen-narration.py --route downtown-north      # a whole route, in order
python3 scripts/gen-narration.py --ids 6,1,23                # specific murals
python3 scripts/gen-narration.py --all                       # every live mural
python3 scripts/gen-narration.py --ids 6 --print             # print, don't write files
python3 scripts/gen-narration.py --route downtown-north --force   # redo existing drafts
```

`--route` reads the ordered id list straight out of `ROUTE_DEFS` in `js/app.js`.
Downtown North (the pilot route, where SHINE started) = 16 stops:
`[6, 116, 23, 30, 1, 36, 66, 129, 109, 110, 7, 9, 111, 115, 73, 24]`.

Requires the Anthropic SDK: `pip3 install anthropic` (installed 2026-07-15, 0.116.0).
Model: `claude-opus-4-8`, adaptive thinking, effort medium.

### The API key (never commit it)

The script reads the key from, in order:
1. env var `ANTHROPIC_API_KEY`
2. a gitignored `.mq-anthropic-key` file at the repo root (one line, the key)

Set it up once, in Rob's own shell / on disk (do NOT paste the key into chat):
```
export ANTHROPIC_API_KEY=sk-ant-...            # per-shell
# or, persistent + local-only:
printf 'sk-ant-...' > .mq-anthropic-key        # .gitignored, never committed
```
Same handling model as the IG `.mq-ig-post-key` — a secret that stays on Rob's
machine and out of git. (This key can also drive IG caption drafting in
`scripts/ig_post.py` and future mural-add tooling.)

## The format the generator writes to

Grounded in the app's bio voice (`data/mural-quest-bio-style-card.md`) but tuned for
audio. The rules live in `SYSTEM_PROMPT` inside `gen-narration.py`; the essentials:

- **~100–150 words** (~45–70 seconds spoken). Shorter when the material is thin; never
  pad. `insp` inspiration leads when it's strong, else the bio hook.
- **Written for the ear** — short, clean, say-out-loud sentences.
- **Numbers/years spelled as words** ("twenty twenty-five", "the six hundred block") so
  the reader never converts on the fly.
- **No URLs / @handles / hashtags / email / addresses** (the app already shows those).
- Address the listener; **end on one real, specific detail to notice** on the wall —
  only if the source material supports it (don't invent what's painted).
- Same voice constraints as bios: facts only, no speculation, active voice, one dry
  observation max, no exclamation points, no "incredible/amazing/stunning".

Structure (loose, not a template): orient → hook/inspiration → one artist beat → land
on a detail.

### Reference scripts (hand-written, pre-generator)

The older opener + Donnelly examples (Downtown North opener, mural 6 "Greetings from
Hollander Hotel") and the **voice-clone recording script** + ElevenLabs settings
(Stability 35 / Similarity 80 / Style 25 / Speaker boost on / Speed 1.1 / Multilingual
v2) are preserved in `HANDOFF.md` → "Reference: narrated route scripts". The
**route opener** is a per-route script, not per-mural — it has no `audio:` field slot
yet; decide where openers live when wiring the tour flow.

⚠ **Pronunciation:** Rob narrates himself, so he knows the names — the generator keeps
scripts clean (no pronunciation tags). One known flag: **Syre** (Donnelly's son) —
confirm "SIGH-er" vs "SEER" before recording.

## Status / next

- ✅ Generator + secure key handling built (2026-07-15). Anthropic SDK installed.
- ⏳ Rob to drop in the API key, then run `--route downtown-north` and review the 16
  drafts in `data/narration/`.
- ⏳ After review: paste finals into each mural's `audio:` field → `build-data.py` →
  publish. Then wire proximity → audio playback into the tour flow (needs the
  foreground-service background-location work — S23 arriving ~2026-07-18).
