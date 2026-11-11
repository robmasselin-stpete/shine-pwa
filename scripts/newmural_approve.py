#!/usr/bin/env python3
"""
newmural_approve.py — release reviewed New Mural drafts to the app (on Rob's command).

For each id: removes the `status: draft` line, logs the approval in revisionLog, then rebuilds
(build-data.py → generate-cards.py, in that order: cards are made from content.json) and uploads
just those murals' full-res photo + card to the CDN. It does NOT publish the data — run
publish-content.py after it:

    python3 scripts/newmural_approve.py 228 229 230 231 && python3 scripts/publish-content.py --tools

--no-upload skips the CDN upload (edit + rebuild only).
"""
import datetime
import json
import os
import re
import subprocess
import sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MURALS = os.path.join(ROOT, 'data', 'murals')
CACHE = 'public, max-age=86400'


def main():
    args = sys.argv[1:]
    upload = '--no-upload' not in args
    ids = [a for a in args if a.isdigit()]
    if not ids:
        sys.exit(__doc__)
    idx = json.load(open(os.path.join(MURALS, '_index.json')))
    today = datetime.date.today()
    imgs = []
    for i in ids:
        path = os.path.join(MURALS, idx[i])
        text = open(path).read()
        if not re.search(r'^status: draft\b.*\n', text, re.M):
            print(f'#{i}: not a draft — left as is')
            imgs.append(yaml.safe_load(text)['img'])
            continue
        text = re.sub(r'^status: draft\b.*\n', '', text, count=1, flags=re.M)
        entry = f'  - "{today.day} {today:%B %Y} — Approved by Rob after review; released to the app (status: draft removed)."\n'
        text = re.sub(r'^revisionLog:\n', lambda m: m.group(0) + entry, text, count=1, flags=re.M)
        d = yaml.safe_load(text)
        assert d['id'] == int(i) and 'status' not in d
        open(path, 'w').write(text)
        imgs.append(d['img'])
        print(f'#{i}: approved ({idx[i]})')
    subprocess.run([sys.executable, 'scripts/build-data.py'], cwd=ROOT, check=True)
    subprocess.run([sys.executable, 'scripts/generate-cards.py'], cwd=ROOT, check=True)
    if not upload:
        return
    for img in imgs:
        card = re.sub(r'^images/murals/', 'images/cards/', os.path.splitext(img)[0]) + '.webp'
        for f, ct in ((img, 'image/jpeg'), (card, 'image/webp')):
            r = subprocess.run(['npx', 'wrangler', 'r2', 'object', 'put', f'muralquest-content/{f}', '--file', f,
                                '--content-type', ct, '--cache-control', CACHE, '--remote'],
                               cwd=ROOT, capture_output=True, text=True)
            print(('✓ ' if r.returncode == 0 else '✗ FAILED ') + f)
            if r.returncode:
                sys.exit(r.stderr[-500:])
    print('Now: python3 scripts/publish-content.py --tools')


if __name__ == '__main__':
    main()
