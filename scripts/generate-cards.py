#!/usr/bin/env python3
"""
generate-cards.py — build the bundled "card" image tier (v1.5 image split).

Grid cards, map popups, tour pins/stops, and the proximity banner only need a small
image to confirm "yes, this is the mural in front of me." This generates a 384px
WebP version of each mural photo (~15 KB each, ~3 MB total for all 189) that ships
in the app, so browsing is crisp and fully offline — while the 373 MB of full-res
photos move to the CDN (detail view only).

  images/murals/2025/aaron-tullo.jpeg  →  images/cards/2025/aaron-tullo.webp

Also writes js/card-manifest.json (the list of card paths) so the service worker
can precache the whole tier on install.

Run after adding/replacing mural photos (or via the publish flow). Idempotent.
"""
import json
import os
import sys

from PIL import Image

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
CONTENT_JSON = os.path.join(PROJECT_ROOT, 'js', 'content.json')
CARD_MANIFEST = os.path.join(PROJECT_ROOT, 'card-manifest.json')  # root — SW fetches ./card-manifest.json
MAX_DIM = 384
WEBP_QUALITY = 72


def card_path(img):
    """images/murals/<rel>.<ext> -> images/cards/<rel>.webp"""
    rel = img.replace('images/murals/', '', 1)
    rel = os.path.splitext(rel)[0] + '.webp'
    return 'images/cards/' + rel


def main():
    force = '--force' in sys.argv
    if not os.path.exists(CONTENT_JSON):
        print("content.json not found — run build-data.py first."); sys.exit(1)
    murals = json.load(open(CONTENT_JSON, encoding='utf-8'))['murals']
    imgs = sorted({m['img'] for m in murals if m.get('img')})

    made, skipped, missing = 0, 0, []
    manifest = []
    total_bytes = 0
    for img in imgs:
        src = os.path.join(PROJECT_ROOT, img)
        cpath = card_path(img)
        dst = os.path.join(PROJECT_ROOT, cpath)
        manifest.append('./' + cpath)
        if not os.path.exists(src):
            missing.append(img)
            continue
        # skip if up-to-date (card newer than source) unless --force
        if not force and os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
            skipped += 1
            total_bytes += os.path.getsize(dst)
            continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        im = Image.open(src).convert('RGB')
        im.thumbnail((MAX_DIM, MAX_DIM))  # max dimension, preserves aspect
        im.save(dst, 'WEBP', quality=WEBP_QUALITY, method=4)
        total_bytes += os.path.getsize(dst)
        made += 1

    manifest.sort()
    with open(CARD_MANIFEST, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=0)
        f.write('\n')

    print(f"✓ Card tier: {made} generated, {skipped} up-to-date, {len(manifest)} total "
          f"(~{total_bytes/1024/1024:.1f} MB @ {MAX_DIM}px WebP)")
    print(f"✓ Wrote {CARD_MANIFEST}")
    if missing:
        print(f"⚠ {len(missing)} mural images missing on disk (no card generated):")
        for m in missing[:10]:
            print(f"    {m}")


if __name__ == '__main__':
    main()
