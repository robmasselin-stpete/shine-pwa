#!/usr/bin/env python3
"""Copy every SHINE 2026 progress photo to Rob's Mac: the Desktop folder + Photos.

Run every few minutes by launchd (~/Library/LaunchAgents/com.pelicandigital.muralquest.photos.plist).
For each 2026 photo listed in the live content.json that hasn't been collected yet:

  1. Prefer the full-size original the capture tool uploads alongside the app copy
     (Capture Worker POST /original, private bucket). It already carries the phone's
     EXIF: time taken, "#id artist - caption", GPS.
  2. Older photos, sent before originals existed, fall back to the public 1600 px copy,
     with the same EXIF written in here. The Worker names files in UTC; EXIF gets
     St. Pete local time.
  3. Save to ~/Desktop/SHINE capture photos/ and import into the Photos album
     "SHINE 2026 progress" (iCloud Photos carries it to the phone).

Photos removed from the app (duplicates, bad frames) are not listed in content.json,
so they are never collected. State: ~/Library/Application Support/MuralQuest/photos-collected.json.

    python3 scripts/pull_originals.py            # collect anything new
    python3 scripts/pull_originals.py --dry-run  # list what would be collected
"""
import datetime, json, os, subprocess, sys, urllib.error, urllib.request
from zoneinfo import ZoneInfo

from PIL import Image
from PIL.TiffImagePlugin import IFDRational as R

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CDN = 'https://cdn.muralquest.app'
WORKER = 'https://capture.muralquest.app/original'
FOLDER = os.path.expanduser('~/Desktop/SHINE capture photos')
ALBUM = 'SHINE 2026 progress'
STATE = os.path.expanduser('~/Library/Application Support/MuralQuest/photos-collected.json')
LOCAL = ZoneInfo('America/New_York')
UA = {'User-Agent': 'mq-pull-originals/1'}   # the CDN refuses Python's default agent


def log(msg):
    print(datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'), msg, flush=True)


def get(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers={**UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def original(name, key):
    """Full-size original from the private bucket, or None if there isn't one."""
    try:
        return get(WORKER, json.dumps({'name': name}).encode(),
                   {'Content-Type': 'application/json', 'X-Capture-Key': key})
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def taken_at(name, day):
    """Local capture time from the Worker's UTC file name (<id>-<date>-<HHMMSS>.jpeg)."""
    stamp = name.split('.')[0].split('-')[4] if name.count('-') >= 4 else ''
    if len(stamp) != 6:
        return None
    utc = datetime.datetime.strptime(day + stamp, '%Y-%m-%d%H%M%S').replace(tzinfo=datetime.timezone.utc)
    return utc.astimezone(LOCAL)


def with_exif(raw, desc, when, gps):
    """Splice description, time and GPS into a JPEG without re-encoding it."""
    def dms(x):
        x = abs(x); d = int(x); m = int((x - d) * 60); s = ((x - d) * 60 - m) * 60
        return (R(d, 1), R(m, 1), R(round(s * 100), 100))
    ex = Image.Exif()
    ex[0x010E] = desc
    if when:
        t = when.strftime('%Y:%m:%d %H:%M:%S')
        off = when.strftime('%z'); off = off[:3] + ':' + off[3:]
        ex[0x0132] = t
        ex[0x8769] = {0x9003: t, 0x9004: t, 0x9011: off}
    if gps:
        ex[0x8825] = {0: b'\x02\x02\x00\x00', 1: 'N' if gps[0] >= 0 else 'S', 2: dms(gps[0]),
                      3: 'E' if gps[1] >= 0 else 'W', 4: dms(gps[1])}
    b = ex.tobytes()
    return raw[:2] + b'\xff\xe1' + (len(b) + 2).to_bytes(2, 'big') + b + raw[2:]


def import_to_photos(paths):
    files = ', '.join('POSIX file "%s"' % p.replace('"', '\\"') for p in paths)
    script = f'''tell application "Photos"
  if not (exists album "{ALBUM}") then make new album named "{ALBUM}"
  import {{{files}}} into album "{ALBUM}" skip check duplicates true
end tell'''
    subprocess.run(['osascript', '-e', script], check=True, capture_output=True, text=True, timeout=300)


def main():
    dry = '--dry-run' in sys.argv
    key = open(os.path.join(ROOT, '.mq-capture-key')).read().strip()
    os.makedirs(FOLDER, exist_ok=True)
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    if os.path.exists(STATE):
        done = set(json.load(open(STATE)))
    else:
        # First run: what's already in the folder was imported by hand (Nov 6–9).
        done = {f for f in os.listdir(FOLDER) if f.endswith('.jpeg')}

    content = json.loads(get(CDN + '/content.json'))
    todo = []
    for m in content.get('murals', []):
        for p in m.get('ph') or []:
            name = p['u'].split('/')[-1]
            if p['u'].startswith('images/murals/2026/') and name not in done:
                todo.append((m, p, name))
    if not todo:
        return
    if dry:
        for m, p, name in todo:
            log(f'would collect {name}  (#{m["id"]} {m.get("a", "")})')
        return

    saved = []
    for m, p, name in todo:
        try:
            raw = original(name, key)
            kind = 'full-size'
            when = taken_at(name, p.get('d', ''))
            if raw is None:
                kind = 'app-size'
                desc = f'#{m["id"]} {m.get("a", "")}' + (f' - {p["c"]}' if p.get('c') else '')
                raw = with_exif(get(f'{CDN}/{p["u"]}'), desc, when, p.get('g'))
            path = os.path.join(FOLDER, name)
            with open(path, 'wb') as f:
                f.write(raw)
            if when:
                os.utime(path, (when.timestamp(), when.timestamp()))
            saved.append((name, path, kind))
        except Exception as e:                      # one bad photo mustn't block the rest
            log(f'FAILED {name}: {e}')

    if not saved:
        return
    try:
        import_to_photos([p for _, p, _ in saved])
    except subprocess.CalledProcessError as e:
        log(f'Photos import failed (files are in the folder; will retry): {e.stderr.strip()}')
        return
    for name, _, kind in saved:
        done.add(name)
        log(f'collected {name} ({kind})')
    with open(STATE, 'w') as f:
        json.dump(sorted(done), f, indent=0)


if __name__ == '__main__':
    main()
