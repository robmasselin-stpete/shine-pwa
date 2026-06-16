# SHINE PWA / Mural Quest — Working in this Repo

Auto-memory at `~/.claude/projects/-Users-robasselin/memory/MEMORY.md` already
loads project rules, iOS build workflow, App Store Connect credentials,
Capacitor haptics gotchas, and the bio style. Read that first if you haven't.

## The two editor PWAs are the source of truth

Rob does mural and route editing through two custom PWAs in `tools/`. They
emit paste-ready blocks that I apply verbatim. **Do not bypass them by running
build scripts** — see the gotcha section below.

### `tools/yaml-editor.html`
Edits mural YAMLs (bio, GPS, IG, etc.). Exports start with
`# ═══ Modified YAML Files ═══`. Each mural block is the full new YAML; apply
by overwriting `data/murals/{id}-{slug}.yaml`. After applying:

- Run `python3 scripts/build-data.py` to regenerate `js/data.js`.
- If a YAML was renamed, update `data/murals/_index.json` (maps id → filename).
- Validate: `python3 -c "import yaml; yaml.safe_load(open(path))"`.

### `tools/route-editor.html`
Edits tour routes — stops, paths, mural lat/lng nudges. Exports come in three
sections:

1. `# ═══ GPS Position Updates ═══` — `lat:` / `lng:` lines per mural. Apply
   to the matching `data/murals/{id}-*.yaml`. Then run `build-data.py`.
2. `# ═══ Route Definition ═══` — a `{ id, name, ids: [...] }` block. Apply
   to `ROUTE_DEFS` in `js/app.js` (around line 1785). Keep
   `scripts/build-routes-osrm.py`'s `ROUTE_DEFS` in sync if the route's id list
   changed (it's a duplicate copy used by the Valhalla fallback generator).
3. `# ═══ Path Changes ═══` — a JSON `"route-id":{"segments":[{"from":N,"to":M,
   "path":[[lat,lng],...]}, ...],"distance":X.XX}` payload. Splice it into
   `js/routes.js` replacing the existing entry for that `route-id`. Use Python
   to parse-edit-rewrite the JSON literal to avoid touching other routes.

## GOTCHA: routes.js format

The runtime expects `segments: [{from, to, path}, ...]` per route. Lookups in
`app.js` use `find(s => s.from === fromId && s.to === toId)` (lines 2211 and
3684) — segments without `from`/`to` silently break per-leg navigation.

**`scripts/build-routes.py` emits the WRONG format** (`segments: [[lat,lng],
...]` arrays, no from/to). It was the original geojson→routes.js builder, but
the route-editor PWA superseded it. Running build-routes.py overwrites
route-editor's output and breaks per-segment navigation for every route in the
file.

**Rule: never run `build-routes.py` or `build-routes-osrm.py` to regenerate
`js/routes.js`.** Apply route-editor's Path Changes payload directly instead.
The `data/routes/*.geojson` files are the route-editor's load state — keep
them up to date if convenient, but do not let build-routes.py write the
routes.js artifact.

## Build / ship checklist

`npm run cap:sync` (NOT `npx cap sync`) → bump build in `ios/App/App/Info.plist`
and `ios/App/App.xcodeproj/project.pbxproj` → run the archive+export+upload, then
create/attach the App Store version and submit.

The whole archive → export → upload is wrapped in `assets/wip/mq_build.sh`
(gitignored — carries ASC account IDs; public repo). It uses **manual signing**
via `assets/wip/ExportOptions-manual.plist` against the Apple Distribution cert
(the account had none — it was created via the ASC API; see MEMORY.md). The
ASC version-create + submit-for-review flow is automated in
`assets/wip/mq_submit.py` (`--submit` to actually submit).

`mq_build.sh` has an **uncommitted-work guard**: it refuses to archive if the git
tree is dirty (so you never ship uncommitted code). Override a deliberate dirty
build with `MQ_ALLOW_DIRTY=1 bash assets/wip/mq_build.sh`. Full details, credentials,
and current build/version status are in MEMORY.md.

## Key files

- `data/murals/*.yaml` — source of truth for mural metadata
- `data/murals/_index.json` — id → filename map (must update on rename)
- `data/mural-quest-bio-style-card.md` — bio voice/structure guide
- `data/routes/*.geojson` — route-editor load state (do NOT trust as source of truth for runtime)
- `js/app.js` — `ROUTE_DEFS` around line 1785, route lookups at 2211/3684
- `js/data.js` — generated artifact from build-data.py (don't hand-edit)
- `js/routes.js` — runtime route paths in {from, to, path} format (apply route-editor pastes here)
- `scripts/build-data.py` — YAML → data.js. Safe to run after YAML edits.
- `scripts/build-routes.py` — **DEPRECATED for routes.js; do not run.**
- `tools/yaml-editor.html` — mural metadata editor PWA
- `tools/route-editor.html` — tour route editor PWA
- `docs/DATA-PIPELINE.md`, `docs/ADDING-A-MURAL.md`, `docs/ARCHITECTURE.md` — deeper reference
