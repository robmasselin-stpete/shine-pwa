#!/usr/bin/env python3
"""
publish-content.py — regenerate the OTA content manifest and push it live to R2.

This is the v1.5 festival workflow. Instead of rebuilding + resubmitting the app
(App Store / Play review = 1-2 days), a content change goes live in ~1 minute:

    edit data/murals/*.yaml  →  python3 scripts/publish-content.py  →  live

Steps:
  0. BIO REVIEW — write bio edits approved in the field (tools/bio-review.html) into
     the YAMLs first; they are live via the Worker, so skipping this reverts them.
     See scripts/review_sync.py. Fails closed like the photo step.
  0. RECONCILE — pull Worker-written progress photos DOWN from the live manifest
     into the source YAMLs first. The SHINE 2026 Capture Worker writes photos
     straight into content.json on R2 and never touches the YAML, so without this
     step step 1 would rebuild from YAML and silently erase every photo shot in
     the field. Fails closed: if the live manifest can't be read, nothing publishes.
  1. Run build-data.py — regenerates js/data.js + js/content.json and bumps the
     content version. Aborts the publish if validation fails (never ships a broken
     manifest).
  2. Upload js/content.json to the R2 bucket via wrangler (remote), with a short
     Cache-Control so the Cloudflare edge serves the new version within ~60s.
  3. Verify — fetch the live URL (cache-busted) and confirm the version matches
     what we just built.

The app applies the new content on the next launch (see js/content.js). Older app
installs that don't have the OTA layer simply keep using their bundled data — this
is additive and safe.

Requires: wrangler authenticated (`npx wrangler whoami`).
Note: images are still bundled in v1.5 — this publishes DATA only (murals, POIs,
routes/YEARS metadata). Image publishing comes with the image-split step.

Usage:
  python3 scripts/publish-content.py            # reconcile + build + upload + verify
  python3 scripts/publish-content.py --dry-run  # reconcile + build only; show what would upload
  python3 scripts/publish-content.py --no-reconcile
                                                # SKIP the photo pull-down. Only safe when
                                                # you know no Worker photos exist live —
                                                # it will drop any that do.
  python3 scripts/publish-content.py --no-review-pull
                                                # SKIP pulling bio-review approvals into the
                                                # YAMLs. Reverts any field edit live now.
  python3 scripts/publish-content.py --post 210 # publish, then post mural #210 to IG
                                                # (drafts a caption you edit + confirm)
  python3 scripts/publish-content.py --tools     # publish, then refresh the editor tools
                                                # snapshot on mural-tools.pages.dev so the
                                                # YAML/route editors show the new data.
                                                # Opt-in: it adds ~15s and 200+ file
                                                # uploads, which you don't want on the
                                                # festival fast path.
"""
import glob
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
CONTENT_JSON = os.path.join(PROJECT_ROOT, 'js', 'content.json')
MURALS_DIR = os.path.join(PROJECT_ROOT, 'data', 'murals')
MURAL_INDEX = os.path.join(MURALS_DIR, '_index.json')

BUCKET = 'muralquest-content'
OBJECT_KEY = 'content.json'
PUBLIC_URL = 'https://cdn.muralquest.app/content.json'
CACHE_CONTROL = 'public, max-age=60'  # bounded edge staleness for festival updates

# Cloudflare bot-blocks the default 'Python-urllib' UA (403).
UA = 'Mozilla/5.0 (mural-quest publish-content)'


def run(cmd):
    return subprocess.run(cmd, cwd=PROJECT_ROOT)


# ─────────────────────────────────────────────────────────────────────────────
# Step 0 — reconcile Worker-written photos back into the YAML source.
#
# The Capture Worker (capture.muralquest.app) appends progress photos to `ph`
# and sets `uc` directly in content.json on R2; it never updates data/murals/*.yaml.
# build-data.py rebuilds content.json FROM the YAMLs, so publishing without first
# pulling those photos down deletes them from the live app with no error.
# ─────────────────────────────────────────────────────────────────────────────

def fetch_live_manifest():
    req = urllib.request.Request(
        PUBLIC_URL + f'?reconcile={int(time.time())}',
        headers={'Cache-Control': 'no-cache', 'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode())


def yaml_path_for(mural_id, index):
    """Resolve a mural id to its YAML path via _index.json, falling back to a glob."""
    fn = index.get(str(mural_id))
    if fn:
        p = os.path.join(MURALS_DIR, fn)
        if os.path.exists(p):
            return p
    hits = glob.glob(os.path.join(MURALS_DIR, f'{mural_id}-*.yaml'))
    return hits[0] if hits else None


def _find_block(lines, key):
    """Span [start, end) of a top-level `key:` and its indented continuation lines."""
    for i, line in enumerate(lines):
        if re.match(rf'^{re.escape(key)}\s*:', line):
            j = i + 1
            while j < len(lines) and (lines[j][:1] in (' ', '\t') or not lines[j].strip()):
                j += 1
            while j > i + 1 and not lines[j - 1].strip():  # don't swallow the blank separator
                j -= 1
            return i, j
    return None


def _set_block(text, key, new_lines):
    """Replace (or insert) a top-level key's block, preserving all other formatting."""
    lines = text.split('\n')
    span = _find_block(lines, key)
    if span:
        start, end = span
        lines[start:end] = new_lines
    else:
        # Insert before artistBio: — present in every mural — else append.
        anchor = next((i for i, l in enumerate(lines) if l.startswith('artistBio:')), None)
        block = new_lines + ['']
        if anchor is None:
            lines = lines + [''] + new_lines
        else:
            lines[anchor:anchor] = block
    return '\n'.join(lines)


def _photos_block(photos):
    if not photos:
        return ['photos: []']
    out = ['photos:']
    for p in photos:
        url = str(p.get('u', '')).replace('"', '\\"')
        date = str(p.get('d', '')).replace('"', '\\"')
        # `c` is the Capture Worker's per-photo caption. It only ever exists on the
        # live manifest, so if it is not written back here a Mac publish silently
        # erases every caption Rob sent from the field.
        cap = str(p.get('c', '') or '').replace('"', '\\"')
        if cap:
            out.append(f'  - {{ url: "{url}", dateTaken: "{date}", caption: "{cap}" }}')
        else:
            out.append(f'  - {{ url: "{url}", dateTaken: "{date}" }}')
    return out


def reconcile_photos():
    """Pull live Worker-written photos/uc down into the YAMLs. Returns False to abort."""
    print("→ Reconciling Worker photos from live (cdn.muralquest.app)…")
    try:
        live = fetch_live_manifest()
    except Exception as e:
        print(f"✗ Could not read the live manifest: {e}")
        print("  Refusing to publish — a rebuild right now could erase field photos.")
        print("  Re-run when you have a connection, or --no-reconcile if you're certain.")
        return False

    index = {}
    if os.path.exists(MURAL_INDEX):
        with open(MURAL_INDEX, encoding='utf-8') as f:
            index = json.load(f)

    live_with_photos = [m for m in live.get('murals', []) if m.get('ph')]
    if not live_with_photos:
        print("  No Worker photos live — nothing to reconcile.")
        return True

    changed, orphans = [], []
    for m in live_with_photos:
        mid, photos = m['id'], m['ph']
        path = yaml_path_for(mid, index)
        if not path:
            orphans.append((mid, len(photos)))
            continue
        with open(path, encoding='utf-8') as f:
            text = original = f.read()
        text = _set_block(text, 'photos', _photos_block(photos))
        if m.get('uc'):
            text = _set_block(text, 'underConstruction', ['underConstruction: true'])
        if text != original:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(text)
            changed.append((mid, len(photos), os.path.basename(path)))

    for mid, n, fn in changed:
        print(f"  ✓ #{mid}: wrote {n} photo(s) back into {fn}")
    if not changed:
        print(f"  {len(live_with_photos)} mural(s) with photos — YAMLs already in sync.")

    if orphans:
        print("\n  ⚠ LIVE PHOTOS WITH NO LOCAL YAML — these murals will be DROPPED "
              "from the manifest:")
        for mid, n in orphans:
            print(f"      #{mid} ({n} photo(s)) — held in .mq-held/ or deleted?")
        print("  If that's not what you want, restore the YAML before publishing.\n")
    return True


def main():
    dry = '--dry-run' in sys.argv

    # 0a. Bio review — write field-approved bio edits into the YAMLs (see review_sync.py).
    #     Before the photo step: both edit YAMLs, and this one checks field-level conflicts.
    sys.path.insert(0, SCRIPT_DIR)
    import review_sync
    review_ack = []
    if '--no-review-pull' in sys.argv:
        print("⚠ --no-review-pull: skipping bio-review approvals. Any edit approved in the "
              "field and live right now will be reverted by this publish.")
    else:
        ok, review_ack = review_sync.pull_approvals(dry=dry)
        if not ok:
            sys.exit(1)

    # 0b. Reconcile — pull Worker-written photos down BEFORE the rebuild reads the YAMLs.
    if '--no-reconcile' in sys.argv:
        print("⚠ --no-reconcile: skipping the photo pull-down. Any Worker photos "
              "live right now will be erased by this publish.")
    elif not reconcile_photos():
        sys.exit(1)

    # 1. Build — regenerate content.json (bumps version), abort on validation error.
    print("→ Building content (build-data.py)…")
    if run([sys.executable, 'scripts/build-data.py']).returncode != 0:
        print("✗ build-data.py failed (validation error?) — aborting publish.")
        sys.exit(1)

    with open(CONTENT_JSON, encoding='utf-8') as f:
        manifest = json.load(f)
    version = manifest['version']
    counts = manifest['counts']
    print(f"  built version {version} (hash {manifest['hash']}) — "
          f"{counts['murals']} murals, {counts['pois']} POIs")

    if dry:
        print(f"  --dry-run: would upload {CONTENT_JSON} → {BUCKET}/{OBJECT_KEY}")
        return

    # 2. Upload to R2 (remote), with a short Cache-Control for edge freshness.
    print(f"→ Uploading to R2 ({BUCKET}/{OBJECT_KEY})…")
    up = run(['npx', 'wrangler', 'r2', 'object', 'put', f'{BUCKET}/{OBJECT_KEY}',
              '--file', CONTENT_JSON, '--content-type', 'application/json',
              '--cache-control', CACHE_CONTROL, '--remote'])
    if up.returncode != 0:
        print("✗ upload failed (is wrangler authenticated? `npx wrangler whoami`).")
        sys.exit(1)

    # 3. Verify live (cache-busted so we read the fresh object, not a stale edge copy).
    print("→ Verifying live…")
    time.sleep(2)
    try:
        # A normal User-Agent — Cloudflare bot-blocks the default 'Python-urllib' (403).
        req = urllib.request.Request(
            PUBLIC_URL + f'?t={version}',
            headers={'Cache-Control': 'no-cache',
                     'User-Agent': 'Mozilla/5.0 (mural-quest publish-content)'})
        with urllib.request.urlopen(req, timeout=15) as resp:
            live = json.loads(resp.read().decode())
        if live.get('version') == version:
            print(f"✓ LIVE — {PUBLIC_URL} is now version {version} "
                  f"({counts['murals']} murals).")
            print("  Users get it on next app launch (within ~60s of the edge cache).")
        else:
            print(f"⚠ Live version is {live.get('version')}, expected {version}. "
                  "Edge cache may still be catching up — re-check in a minute.")
    except Exception as e:
        print(f"⚠ Uploaded, but could not verify the live URL: {e}")

    # 3b. Bio review — mark pulled approvals done, and refresh the tool's YAML bundle so
    #     it starts from what was just published.
    review_sync.ack(review_ack)
    review_sync.push_bundle()

    # 4. Optionally refresh the editor-tools snapshot (opt-in).
    # tools/*.html read data/murals/*.yaml relative to wherever they're SERVED, so the
    # copy on mural-tools.pages.dev is a point-in-time snapshot, not the repo. Without
    # this, the YAML editor keeps showing pre-edit data and looks like the publish failed.
    if '--tools' in sys.argv:
        print("\n→ Refreshing the editor tools snapshot (mural-tools.pages.dev)…")
        rc = subprocess.call(['bash', os.path.join(PROJECT_ROOT, 'scripts', 'deploy-tools.sh')])
        if rc == 0:
            print("✓ Tools snapshot refreshed — the editors now show this data.")
        else:
            print(f"⚠ Tools deploy failed (exit {rc}). The OTA publish above still "
                  "succeeded; re-run `bash scripts/deploy-tools.sh` when convenient.")

    # 5. Optionally post a mural to Instagram (opt-in, per-mural).
    if '--post' in sys.argv:
        try:
            mid = sys.argv[sys.argv.index('--post') + 1]
        except IndexError:
            print("⚠ --post needs a mural id, e.g. --post 210")
            return
        print(f"\n→ Instagram post for mural #{mid}…")
        sys.path.insert(0, os.path.join(PROJECT_ROOT, 'scripts'))
        import ig_post
        ig_post.post_mural(mid)


if __name__ == '__main__':
    main()
