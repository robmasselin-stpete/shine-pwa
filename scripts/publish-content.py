#!/usr/bin/env python3
"""
publish-content.py — regenerate the OTA content manifest and push it live to R2.

This is the v1.5 festival workflow. Instead of rebuilding + resubmitting the app
(App Store / Play review = 1-2 days), a content change goes live in ~1 minute:

    edit data/murals/*.yaml  →  python3 scripts/publish-content.py  →  live

Steps:
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
  python3 scripts/publish-content.py            # build + upload + verify
  python3 scripts/publish-content.py --dry-run  # build only; show what would upload
  python3 scripts/publish-content.py --post 210 # publish, then post mural #210 to IG
                                                # (drafts a caption you edit + confirm)
"""
import json
import os
import subprocess
import sys
import time
import urllib.request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
CONTENT_JSON = os.path.join(PROJECT_ROOT, 'js', 'content.json')

BUCKET = 'muralquest-content'
OBJECT_KEY = 'content.json'
PUBLIC_URL = 'https://cdn.muralquest.app/content.json'
CACHE_CONTROL = 'public, max-age=60'  # bounded edge staleness for festival updates


def run(cmd):
    return subprocess.run(cmd, cwd=PROJECT_ROOT)


def main():
    dry = '--dry-run' in sys.argv

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

    # 4. Optionally post a mural to Instagram (opt-in, per-mural).
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
