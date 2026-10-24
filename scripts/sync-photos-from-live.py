#!/usr/bin/env python3
"""
sync-photos-from-live.py — pull Capture-Worker photos from the LIVE content.json
back into the mural YAMLs, so a rebuild from YAML can't wipe them.

Why: the Capture Worker (workers/mural-capture) appends progress photos straight
into content.json on R2 and sets `uc:true`; it never touches the YAMLs. Any
build-data.py → publish (Mac publish-content.py OR the GitHub publish workflow)
rebuilds content.json from YAML and would silently drop those photos. Run this
first and the YAMLs carry them.

Merge rules (per mural that has `ph` or `uc` live):
  - live ph {u,d} → YAML photos {url,dateTaken}; union by url, sorted oldest→newest
  - urls listed in the YAML's `photosRemoved:` are never re-added (that's how you
    delete a bad Worker photo: move its url from photos: to photosRemoved:)
  - live uc:true → YAML underConstruction: true (never turns it off)
  - murals live but not in data/murals/_index.json (e.g. held stubs) are skipped

Fails loudly (exit 1) if the live manifest can't be fetched/parsed — a publish
must NOT go ahead on a failed sync, or it would wipe the photos it exists to keep.

Usage:
  python3 scripts/sync-photos-from-live.py              # fetch live, write YAMLs
  python3 scripts/sync-photos-from-live.py --dry-run    # report only
  python3 scripts/sync-photos-from-live.py --source path/or/url/content.json
"""

import json
import os
import re
import sys
import urllib.request

import yaml

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
MURALS_DIR = os.path.join(PROJECT_ROOT, 'data', 'murals')
LIVE_URL = 'https://cdn.muralquest.app/content.json'


def load_live(source):
    if source.startswith(('http://', 'https://')):
        # Cloudflare bot protection 403s Python's default User-Agent.
        req = urllib.request.Request(source, headers={'Cache-Control': 'no-cache',
                                                      'User-Agent': 'MuralQuest-publish/1.0'})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.load(r)
    else:
        with open(source, encoding='utf-8') as f:
            data = json.load(f)
    if not isinstance(data, dict) or not isinstance(data.get('murals'), list):
        raise ValueError('live content.json has no murals list')
    return data


def yaml_photos_block(photos):
    lines = ['photos:']
    for p in photos:
        lines.append(f'  - {{ url: {json.dumps(p["url"])}, dateTaken: {json.dumps(p.get("dateTaken", ""))} }}')
    return '\n'.join(lines) + '\n'


def replace_top_level_key(text, key, block):
    """Replace a top-level `key:` block (key line + indented/list continuation lines),
    or append it if absent. Keeps every other line (and comment) untouched."""
    pat = re.compile(rf'^{re.escape(key)}:.*\n(?:(?:[ \t]+.*|-.*|)\n)*?(?=^\S|\Z)', re.M)
    if pat.search(text):
        return pat.sub(lambda _: block, text, count=1)
    if not text.endswith('\n'):
        text += '\n'
    return text + '\n' + block


def main():
    dry = '--dry-run' in sys.argv
    source = LIVE_URL
    if '--source' in sys.argv:
        source = sys.argv[sys.argv.index('--source') + 1]

    try:
        live = load_live(source)
    except Exception as e:
        print(f'✗ Could not load live content.json from {source}: {e}')
        print('  Refusing to continue — publishing now could wipe Worker-added photos.')
        sys.exit(1)

    with open(os.path.join(MURALS_DIR, '_index.json'), encoding='utf-8') as f:
        index = json.load(f)

    changed = 0
    for lm in live['murals']:
        ph = lm.get('ph') or []
        uc = bool(lm.get('uc'))
        if not ph and not uc:
            continue
        fn = index.get(str(lm.get('id')))
        if not fn:
            print(f'  · #{lm.get("id")}: live but not in _index.json — skipped')
            continue
        path = os.path.join(MURALS_DIR, fn)
        with open(path, encoding='utf-8') as f:
            text = f.read()
        m = yaml.safe_load(text) or {}

        removed = set(m.get('photosRemoved') or [])
        photos = [p for p in (m.get('photos') or []) if p and p.get('url')]
        have = {p['url'] for p in photos}
        added = []
        for p in ph:
            u = p.get('u')
            if u and u not in have and u not in removed:
                photos.append({'url': u, 'dateTaken': p.get('d', '')})
                have.add(u)
                added.append(u)
        photos.sort(key=lambda p: (p.get('dateTaken') or '', p['url']))

        set_uc = uc and not m.get('underConstruction')
        if not added and not set_uc:
            continue

        new = text
        if added:
            new = replace_top_level_key(new, 'photos', yaml_photos_block(photos))
        if set_uc:
            new = replace_top_level_key(new, 'underConstruction', 'underConstruction: true\n')
        yaml.safe_load(new)   # never write a YAML that doesn't parse

        changed += 1
        what = []
        if added:
            what.append(f'+{len(added)} photo(s)')
        if set_uc:
            what.append('underConstruction')
        print(f'  ✓ #{lm.get("id")} {fn}: {", ".join(what)}')
        if not dry:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(new)

    verb = 'would update' if dry else 'updated'
    print(f'✓ Photo sync: {verb} {changed} mural YAML(s) from {source}')


if __name__ == '__main__':
    main()
