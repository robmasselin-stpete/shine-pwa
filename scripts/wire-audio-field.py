#!/usr/bin/env python3
"""wire-audio-field.py — add the `audio:` field to mural YAMLs that have a
narration clip but no audio URL yet. Inserts
    audio: "https://cdn.muralquest.app/audio/{id}.mp3"
immediately after the `img:` line, matching the position used by the already-
wired Downtown North murals. Only touches YAMLs that (a) have a matching
audio/{id}.mp3 on disk and (b) don't already have an `audio:` field.
Idempotent: re-running does nothing once fields are present.
"""
import json, glob, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
idx = json.load(open('data/murals/_index.json'))

nar_ids = sorted({os.path.basename(f).split('-', 1)[0] for f in glob.glob('data/narration/*.txt')}, key=int)
changed, skipped_no_mp3, already = [], [], []

for mid in nar_ids:
    fn = idx.get(mid)
    if not fn:
        print(f"  ! id {mid}: no YAML in _index.json", file=sys.stderr)
        continue
    path = f'data/murals/{fn}'
    txt = open(path).read()
    if re.search(r'^audio:', txt, re.M):
        already.append(mid)
        continue
    if not os.path.exists(f'audio/{mid}.mp3'):
        skipped_no_mp3.append(mid)
        continue
    url = f'audio: "https://cdn.muralquest.app/audio/{mid}.mp3"'
    # insert after the img: line
    m = re.search(r'^(img:.*)$', txt, re.M)
    if not m:
        print(f"  ! id {mid}: no img: line to anchor on", file=sys.stderr)
        continue
    new = txt[:m.end()] + "\n" + url + txt[m.end():]
    open(path, 'w').write(new)
    changed.append(mid)

print(f"wired: {len(changed)} -> {sorted((int(x) for x in changed))}")
print(f"already had audio: field: {len(already)}")
if skipped_no_mp3:
    print(f"skipped (no mp3 yet): {sorted((int(x) for x in skipped_no_mp3))}")
