#!/usr/bin/env python3
"""
publish-images.py — upload mural images to the R2 CDN (v1.5 image split).

Uploads two tiers to the muralquest-content bucket (served at cdn.muralquest.app):
  - images/cards/**.webp  — 384px cards (also bundled; on CDN for OTA-added murals)
  - images/murals/**      — full-res photos (detail view; NOT bundled anymore)

Keys mirror the local paths, so cardSrc()/fullSrc() in app.js resolve directly:
  images/murals/2025/x.jpeg  →  https://cdn.muralquest.app/images/murals/2025/x.jpeg

Uses wrangler (OAuth — no S3 keys needed), parallelized. Idempotent: re-uploading
is fine (overwrites). Run after generate-cards.py / adding photos.

Usage:
  python3 scripts/publish-images.py               # upload cards + full-res
  python3 scripts/publish-images.py --cards-only  # just the small card tier (fast)
  python3 scripts/publish-images.py --dry-run     # list what would upload
"""
import concurrent.futures as cf
import mimetypes
import os
import subprocess
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
BUCKET = 'muralquest-content'
CACHE_CONTROL = 'public, max-age=86400'  # images change rarely; 1-day edge cache
WORKERS = 8


def collect(rel_dir, exts):
    root = os.path.join(PROJECT_ROOT, rel_dir)
    out = []
    for dirpath, _, files in os.walk(root):
        for fn in files:
            if fn.startswith('.'):
                continue
            if os.path.splitext(fn)[1].lower() in exts:
                full = os.path.join(dirpath, fn)
                key = os.path.relpath(full, PROJECT_ROOT)  # e.g. images/murals/2025/x.jpeg
                out.append((full, key))
    return sorted(out)


def upload(item):
    full, key = item
    ctype = mimetypes.guess_type(full)[0] or 'application/octet-stream'
    r = subprocess.run(
        ['npx', 'wrangler', 'r2', 'object', 'put', f'{BUCKET}/{key}',
         '--file', full, '--content-type', ctype,
         '--cache-control', CACHE_CONTROL, '--remote'],
        cwd=PROJECT_ROOT, capture_output=True, text=True)
    return key, r.returncode, (r.stderr.strip().splitlines()[-1] if r.returncode else '')


def main():
    dry = '--dry-run' in sys.argv
    cards_only = '--cards-only' in sys.argv

    items = collect('images/cards', {'.webp'})
    if not cards_only:
        items += collect('images/murals', {'.jpeg', '.jpg', '.png'})

    total_mb = sum(os.path.getsize(f) for f, _ in items) / 1024 / 1024
    print(f"{len(items)} objects, {total_mb:.1f} MB → {BUCKET} "
          f"({'cards only' if cards_only else 'cards + full-res'})")
    if dry:
        for _, key in items[:12]:
            print(f"  {key}")
        print(f"  … ({len(items)} total)")
        return

    done, failed = 0, []
    with cf.ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for key, rc, err in ex.map(upload, items):
            done += 1
            if rc != 0:
                failed.append((key, err))
            if done % 25 == 0 or done == len(items):
                print(f"  {done}/{len(items)} uploaded"
                      + (f" ({len(failed)} failed)" if failed else ""))

    if failed:
        print(f"\n⚠ {len(failed)} uploads failed:")
        for key, err in failed[:10]:
            print(f"    {key}: {err}")
        sys.exit(1)
    print(f"✓ Uploaded {done} objects to {BUCKET}.")


if __name__ == '__main__':
    main()
