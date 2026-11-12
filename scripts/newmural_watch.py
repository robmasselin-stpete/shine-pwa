#!/usr/bin/env python3
"""
newmural_watch.py — draft each New Mural intake automatically, for Rob to review.

Run every 10 minutes by launchd (scripts/com.pelicandigital.muralquest.newmurals.plist).
For each queue item (tools/new-mural.html → Capture Worker POST /newmural) not yet in the
ledger, oldest first:

  1. download the photo / signature photo + meta to .mq-newmurals/<qid>/ (gitignored)
  2. assign the next mural id, list the records within 60 m (duplicate check)
  3. headless Claude Code drafts data/murals/<id>-<slug>.yaml   (scripts/newmural-draft-prompt.md)
  4. a second, independent run fact-checks it                    (scripts/newmural-verify-prompt.md)
  5. checks the YAML (parses, right id, `status: draft`), copies the photo to its `img:` path,
     adds it to _index.json, commits those files only, pushes v1.5, refreshes the tools site
  6. Mac notification

The draft carries `status: draft`, so build-data.py leaves it OUT of the app: a publish for any
other reason can't release it. Rob reviews it in the YAML editor; scripts/newmural_approve.py
removes the line when he says publish. Nothing here publishes to the app.

    python3 scripts/newmural_watch.py                 # normal run (what launchd does)
    python3 scripts/newmural_watch.py --dry --only <qid> --id 9001
                                                      # test: draft into .mq-newmurals/<qid>/ only;
                                                      # no repo change, commit, deploy or ledger
Log: ~/Library/Logs/muralquest-newmurals.log
"""
import argparse
import datetime
import glob
import json
import math
import os
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MURALS = os.path.join(ROOT, 'data', 'murals')
INDEX = os.path.join(MURALS, '_index.json')
LEDGER = os.path.join(ROOT, 'data', 'newmural-ledger.json')
WORK = os.path.join(ROOT, '.mq-newmurals')
LOCK = os.path.join(WORK, '.lock')
WORKER = 'https://capture.muralquest.app'
UA = {'User-Agent': 'mq-newmural-watch/1'}
CLAUDE = shutil.which('claude') or os.path.expanduser('~/.local/bin/claude')
MAX_TRIES = 2
# Headless Claude may research and write files, nothing else: no git, no wrangler, no publish.
TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebSearch', 'WebFetch',
         'Bash(python3 -c *)', 'Bash(grep *)', 'Bash(ls *)']


def log(msg):
    print(datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'), msg, flush=True)


def post(path, body):
    key = open(os.path.join(ROOT, '.mq-capture-key')).read().strip()
    req = urllib.request.Request(WORKER + path, data=json.dumps(body).encode(),
                                 headers={**UA, 'Content-Type': 'application/json', 'X-Capture-Key': key})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def load_json(p, default):
    try:
        return json.load(open(p))
    except FileNotFoundError:
        return default


def save_json(p, d):
    with open(p, 'w') as f:
        json.dump(d, f, indent=2, ensure_ascii=False)
        f.write('\n')


def notify(title, msg):
    log(f'NOTIFY {title}: {msg}')
    s = lambda t: t.replace('\\', '').replace('"', "'")
    subprocess.run(['osascript', '-e', f'display notification "{s(msg)}" with title "{s(title)}" sound name "Glass"'],
                   capture_output=True)


def compass(d):
    return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][round(d / 45) % 8]


def metres(a, b):
    k = math.pi / 180
    x = (b[1] - a[1]) * k * math.cos((a[0] + b[0]) / 2 * k)
    return math.hypot(x, (b[0] - a[0]) * k) * 6371000


def all_records():
    out = []
    for p in sorted(glob.glob(os.path.join(MURALS, '*.yaml'))):
        if os.path.basename(p).startswith('_'):
            continue
        try:
            d = yaml.safe_load(open(p))
        except yaml.YAMLError:
            continue
        if isinstance(d, dict) and d.get('id') is not None:
            out.append((p, d))
    return out


def next_id(ledger):
    """Max real id + 1 (test stubs #900+ live in .mq-held/ and are ignored)."""
    ids = [int(k) for k in load_json(INDEX, {}) if k.isdigit() and int(k) < 900]
    ids += [d['id'] for _, d in all_records() if isinstance(d['id'], int) and d['id'] < 900]
    ids += [e['id'] for e in ledger.values() if isinstance(e.get('id'), int)]
    return max(ids) + 1


def nearby(gps):
    if not gps:
        return '  (no GPS — check by artist name only)'
    rows = []
    for p, d in all_records():
        if isinstance(d.get('lat'), (int, float)) and isinstance(d.get('lng'), (int, float)):
            m = metres(gps[:2], (d['lat'], d['lng']))
            if m <= 60:
                rows.append((m, f"  - #{d['id']} {d.get('artist')} — {d.get('title') or 'untitled'} "
                                f"({round(m)} m) data/murals/{os.path.basename(p)}"))
    return '\n'.join(r for _, r in sorted(rows)) or '  (none)'


def fetch(item, folder):
    os.makedirs(folder, exist_ok=True)
    save_json(os.path.join(folder, 'meta.json'), item)
    parts = ['photo'] + (['sign'] if item.get('hasSign') else [])
    for part in parts:
        dst = os.path.join(folder, f'{part}.jpg')
        if not os.path.exists(dst):
            open(dst, 'wb').write(post('/newmural/file', {'id': item['id'], 'part': part}))
        # a smaller copy for Claude to look at
        subprocess.run(['sips', '-Z', '1400', dst, '--out', os.path.join(folder, f'small-{part}.jpg')],
                       capture_output=True)
    return parts


def fill(template, **kw):
    t = open(os.path.join(ROOT, 'scripts', template)).read()
    for k, v in kw.items():
        t = t.replace('{' + k + '}', str(v))
    return t


def run_claude(prompt, label, folder):
    log(f'  claude: {label}…')
    r = subprocess.run([CLAUDE, '-p', prompt, '--allowedTools', *TOOLS,
                        '--disallowedTools', 'Bash(git *)', 'Bash(npx *)', 'Bash(wrangler *)'],
                       cwd=ROOT, capture_output=True, text=True, timeout=45 * 60)
    open(os.path.join(folder, f'{label}.log'), 'w').write(r.stdout + '\n--- stderr ---\n' + r.stderr)
    log(f'  claude {label} exit {r.returncode}: {r.stdout.strip()[-300:]}')
    if r.returncode != 0:
        raise RuntimeError(f'claude {label} failed (exit {r.returncode}) — see {folder}/{label}.log')
    return r.stdout.strip()


def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True)


def process(item, mural_id, dry, ignore=None):
    qid = item['id']
    folder = os.path.join(WORK, qid)
    parts = fetch(item, folder)
    gps, h = item.get('gps'), item.get('heading')
    today = datetime.date.today()
    date_long = f'{today.day} {today:%B %Y}'
    date_short = f'{today.day} {today:%b %Y}'
    flags = os.path.join(folder, 'flags.txt')
    before = {p for p, _ in all_records()}
    out_hint = os.path.join(folder, 'draft.yaml') if dry else f'data/murals/{mural_id}-<artist-slug>-<category>.yaml'
    common = dict(
        id=mural_id, qid=qid, date_long=date_long, date_short=date_short,
        photo=os.path.join(folder, 'small-photo.jpg'),
        sign=os.path.join(folder, 'small-sign.jpg') if 'sign' in parts else '(none)',
        note=(item.get('note') or '').replace('"', "'") or '(none)',
        gps=f'{gps[0]}, {gps[1]} (±{round(gps[2])} m)' if gps else '(none)',
        gps_short=f'{gps[0]},{gps[1]} ±{round(gps[2])} m' if gps else 'none',
        heading=f'{h}° (looking {compass(h)})' if h is not None else '(none)',
        heading_short=f'{h}°' if h is not None else 'none',
        sign_word=', signature photo' if 'sign' in parts else '',
        nearby=nearby(gps), flags=flags)

    test = (f'\n\nTEST RUN: treat data/murals/{ignore} as if it did not exist — it is the record this test '
            f'recreates. You may not read it, and it is not a duplicate.\n') if ignore else ''
    if ignore:
        common['nearby'] = '\n'.join(l for l in common['nearby'].splitlines() if ignore not in l) or '  (none)'
    reply = run_claude(fill('newmural-draft-prompt.md', out=out_hint, **common) + test, 'draft', folder)
    flag_text = open(flags).read() if os.path.exists(flags) else ''
    if 'DUPLICATE' in reply or flag_text.startswith('DUPLICATE'):
        m = re.search(r'DUPLICATE:?\s*#?(\d+)', flag_text + ' ' + reply)
        dup = int(m.group(1)) if m else None
        rec = load_json(INDEX, {}).get(str(dup)) if dup else None
        drec = yaml.safe_load(open(os.path.join(MURALS, rec))) if rec else {}
        if drec.get('status') != 'research' or dry:
            where = 'drafted, waiting for your review' if drec.get('status') == 'draft' else 'in the app'
            return {'status': 'duplicate', 'of': dup, 'where': where, 'note': (flag_text or reply)[:300]}
        # The match is a record held back as `research` (artist etc. unknown): Rob's new photos are a
        # lead. Research it into that record, which becomes a draft for his review.
        out = os.path.join(MURALS, rec)
        if os.path.exists(flags):
            os.rename(flags, flags.replace('.txt', '-duplicate.txt'))
        common['id'] = dup
        run_claude(fill('newmural-lead-prompt.md', out=out, **common), 'lead', folder)
        run_claude(fill('newmural-verify-prompt.md', out=out, **common), 'verify', folder)
        d = yaml.safe_load(open(out))
        if d.get('id') != dup or d.get('status') != 'draft':
            raise RuntimeError(f'{out}: id/status wrong after lead (id={d.get("id")}, status={d.get("status")})')
        flag_text = open(flags).read() if os.path.exists(flags) else ''
        return {'status': 'lead', 'of': dup, 'file': os.path.relpath(out, ROOT), 'artist': d.get('artist'),
                'flags': flag_text.strip().count('\n') + 1 if flag_text.strip() else 0}

    if dry:
        out = os.path.join(folder, 'draft.yaml')
    else:
        new = [p for p in glob.glob(os.path.join(MURALS, f'{mural_id}-*.yaml')) if p not in before]
        if len(new) != 1:
            raise RuntimeError(f'expected one new data/murals/{mural_id}-*.yaml, found {len(new)}')
        out = new[0]
    run_claude(fill('newmural-verify-prompt.md', out=out, **common) + test, 'verify', folder)

    d = yaml.safe_load(open(out))
    if d.get('id') != mural_id or d.get('status') != 'draft':
        raise RuntimeError(f'{out}: id/status wrong (id={d.get("id")}, status={d.get("status")})')
    img = d.get('img') or ''
    if not re.fullmatch(r'images/murals/[\w-]+/[\w.-]+\.jpe?g', img):
        raise RuntimeError(f'{out}: bad img path {img!r}')
    if dry:
        return {'status': 'dry', 'file': out, 'img': img}

    dst = os.path.join(ROOT, img)
    if os.path.exists(dst):
        raise RuntimeError(f'{img} already exists — not overwriting')
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy(os.path.join(folder, 'photo.jpg'), dst)
    idx = load_json(INDEX, {})
    idx[str(mural_id)] = os.path.basename(out)
    save_json(INDEX, dict(sorted(idx.items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else 0)))
    return {'status': 'drafted', 'file': os.path.relpath(out, ROOT), 'img': img,
            'artist': d.get('artist'), 'flags': flag_text.strip().count('\n') + 1 if flag_text.strip() else 0}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--only')
    ap.add_argument('--id', type=int)
    ap.add_argument('--ignore', help='test only: a data/murals file the drafter must treat as absent')
    a = ap.parse_args()
    os.makedirs(WORK, exist_ok=True)
    try:
        os.mkdir(LOCK)
    except FileExistsError:
        if (datetime.datetime.now().timestamp() - os.path.getmtime(LOCK)) < 3 * 3600:
            return   # a run is still going
        log('stale lock removed')
    try:
        run(a)
    finally:
        shutil.rmtree(LOCK, ignore_errors=True)


def run(a):
    try:
        queue = json.loads(post('/newmurals', {}))['queue']
    except (urllib.error.URLError, KeyError, ValueError) as e:
        log(f'queue fetch failed: {e}')
        return
    ledger = load_json(LEDGER, {})
    def wanted(q):
        if a.only:
            return q['id'] == a.only
        e = ledger.get(q['id'], {})
        return e.get('status') in (None, 'failed') and e.get('tries', 0) < MAX_TRIES
    todo = [q for q in sorted(queue, key=lambda q: q['id']) if wanted(q)]
    if not todo:
        return
    branch = git('rev-parse', '--abbrev-ref', 'HEAD').stdout.strip()
    if not a.dry and branch != 'v1.5':
        log(f'on branch {branch}, not v1.5 — not drafting'); return
    done = []
    for item in todo:
        qid = item['id']
        entry = ledger.get(qid, {})
        mural_id = a.id or entry.get('id') or next_id(ledger)
        log(f'{qid} → #{mural_id}  note: {item.get("note")!r}')
        try:
            res = process(item, mural_id, a.dry, a.ignore if a.dry else None)
        except Exception as e:   # noqa: BLE001 — log, count the try, carry on with the next one
            log(f'  FAILED: {e}')
            if not a.dry:
                ledger[qid] = {**entry, 'id': mural_id, 'status': 'failed',
                               'tries': entry.get('tries', 0) + 1, 'error': str(e)[:300]}
                save_json(LEDGER, ledger)
                if ledger[qid]['tries'] >= MAX_TRIES:
                    notify('New mural: draft failed', f'#{mural_id} ({item.get("note") or qid}) — see the log')
            continue
        log(f'  {res}')
        if a.dry:
            continue
        ledger[qid] = {'id': res.get('of') or mural_id, **res,
                       'at': datetime.datetime.now().isoformat(timespec='seconds')}
        save_json(LEDGER, ledger)
        if res['status'] == 'drafted':
            done.append((mural_id, res))
            paths = [res['file'], res['img'], 'data/murals/_index.json', 'data/newmural-ledger.json']
            msg = f"data: #{mural_id} {res.get('artist')} — automatic New Mural draft (status: draft, not in the app)"
        elif res['status'] == 'lead':
            done.append((res['of'], res))
            paths = [res['file'], 'data/newmural-ledger.json']
            msg = (f"data: #{res['of']} research record updated from New Mural intake {qid} "
                   f"(artist: {res.get('artist')}; status: draft, not in the app)")
        else:
            paths = ['data/newmural-ledger.json']
            msg = f"data: New Mural intake {qid} is already #{res.get('of')}"
            notify(f"New mural: that's already #{res.get('of')}", f"{res.get('where', 'in the app')} — no new draft")
        git('add', '--', *paths)
        c = git('commit', '-m', msg + '\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>', '--', *paths)
        log(f'  commit: {(c.stdout + c.stderr).strip().splitlines()[:1]}')
    if not a.dry:
        p = git('push', 'origin', 'v1.5')
        log(f'  push: exit {p.returncode}')
    if done:
        t = subprocess.run(['bash', 'scripts/deploy-tools.sh'], cwd=ROOT, capture_output=True, text=True)
        log(f'  deploy-tools: exit {t.returncode} {t.stdout.strip().splitlines()[-1:] if t.stdout else t.stderr[-200:]}')
        names = ', '.join(f"#{i} {r.get('artist')}" + (' (research lead)' if r['status'] == 'lead' else '')
                          for i, r in done)
        flags = sum(r.get('flags', 0) for _, r in done)
        notify('New mural draft ready', f'{names} — in the YAML editor ({flags} flag(s)). Not in the app.')


if __name__ == '__main__':
    main()
