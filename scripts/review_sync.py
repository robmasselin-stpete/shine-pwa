#!/usr/bin/env python3
"""
review_sync.py — the Mac side of the bio-review tool (tools/bio-review.html).

Two jobs, both called from publish-content.py:

  pull_approvals()   BEFORE the rebuild. Bio edits Rob approves in the field go live by
                     the Capture Worker writing content.json directly, and are queued in
                     the private R2 bucket muralquest-review. This writes each queued
                     edit into its YAML (with a revisionLog entry and sourceNotes), so
                     the rebuild keeps it instead of silently reverting it. Field-level
                     conflict check: if a YAML field was edited on the Mac after the
                     field edit was made, that field is NOT overwritten — it's reported
                     and the approval stays queued until resolved.

  push_bundle()      AFTER a successful publish (or alone via --review-bundle). Uploads
                     every mural's editable fields + file hash + the bio style card, so
                     the tool always starts from the real YAMLs, not a stale snapshot.

Standalone:
  python3 scripts/review_sync.py --bundle     # upload the bundle only
  python3 scripts/review_sync.py --queue      # show what's waiting (read-only)
"""
import glob
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import textwrap
import urllib.request
from datetime import datetime

import yaml

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
MURALS_DIR = os.path.join(PROJECT_ROOT, 'data', 'murals')
STYLE_CARD = os.path.join(PROJECT_ROOT, 'data', 'mural-quest-bio-style-card.md')
KEY_FILE = os.path.join(PROJECT_ROOT, '.mq-capture-key')
WORKER = 'https://capture.muralquest.app'
REVIEW_BUCKET = 'muralquest-review'
UA = 'Mozilla/5.0 (mural-quest review-sync)'

EDIT_FIELDS = ['artist', 'title', 'basedIn', 'pronouns', 'instagram', 'artistBio',
               'searchBio', 'artistAwards', 'muralInspiration',
               'searchMuralDescription', 'furtherWork']
BLOCK_FIELDS = {'artistBio', 'searchBio', 'muralInspiration', 'searchMuralDescription'}
# Where a missing key gets inserted (after this key's block).
INSERT_AFTER = {'searchBio': 'artistBio', 'pronouns': 'basedIn',
                'furtherWork': 'artistAwards', 'basedIn': 'instagram'}
SKIP_STATUS = {'research', 'painted-over'}


def norm(s):
    """build-data.py text_normalize — so YAML hard-wraps and smart quotes compare equal."""
    if s is None:
        return ''
    s = str(s).replace('‘', "'").replace('’', "'")
    s = s.replace('“', '"').replace('”', '"').replace('\r', '')
    s = re.sub(r'\n\n+', '\x00', s).replace('\n', ' ').replace('\x00', '\n\n')
    return re.sub(r' {2,}', ' ', s).strip()


def norm_field(k, v):
    if k == 'furtherWork':
        return [{'name': norm(g.get('name', '')), 'url': norm(g.get('url', ''))}
                for g in (v or []) if isinstance(g, dict) and (g.get('name') or g.get('url'))]
    return norm(v)


def _key():
    with open(KEY_FILE) as f:
        return f.read().strip()


def _call(path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(WORKER + path, data=data, method='POST' if data else 'GET',
                                 headers={'X-Capture-Key': _key(), 'User-Agent': UA,
                                          'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def _paths():
    out = {}
    for p in sorted(glob.glob(os.path.join(MURALS_DIR, '*.yaml'))):
        if os.path.basename(p).startswith('_'):
            continue
        out[p] = None
    return out


# ── bundle ──────────────────────────────────────────────────────────────────

def build_bundle():
    murals = {}
    for p in _paths():
        with open(p, encoding='utf-8') as f:
            text = f.read()
        try:
            d = yaml.safe_load(text)
        except yaml.YAMLError:
            continue
        if not isinstance(d, dict) or not d.get('id') or d.get('status') in SKIP_STATUS:
            continue
        murals[str(d['id'])] = {
            'id': d['id'],
            'file': os.path.basename(p),
            'sha': hashlib.sha256(text.encode()).hexdigest(),
            'fields': {k: norm_field(k, d.get(k)) for k in EDIT_FIELDS},
            'meta': {'building': norm(d.get('building')), 'address': norm(d.get('address')),
                     'year': d.get('year'), 'category': d.get('category'),
                     'img': d.get('img'), 'status': d.get('status')},
        }
    style = open(STYLE_CARD, encoding='utf-8').read() if os.path.exists(STYLE_CARD) else ''
    return {'generated': datetime.now().astimezone().isoformat(timespec='seconds'),
            'styleCard': style, 'murals': murals}


def push_bundle():
    bundle = build_bundle()
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as t:
        json.dump(bundle, t, ensure_ascii=False)
        tmp = t.name
    try:
        r = subprocess.run(['npx', 'wrangler', 'r2', 'object', 'put',
                            f'{REVIEW_BUCKET}/yaml/bundle.json', '--file', tmp,
                            '--content-type', 'application/json', '--remote'],
                           cwd=PROJECT_ROOT, capture_output=True, text=True)
    finally:
        os.unlink(tmp)
    if r.returncode != 0:
        print(f"⚠ bio-review bundle upload failed:\n{r.stderr[-800:]}")
        return False
    print(f"✓ bio-review bundle uploaded ({len(bundle['murals'])} murals) — the tool now "
          "starts from these YAMLs.")
    return True


# ── YAML writing (line-level, preserves everything it doesn't touch) ────────

def _find_block(lines, key):
    for i, line in enumerate(lines):
        if re.match(rf'^{re.escape(key)}\s*:', line):
            j = i + 1
            while j < len(lines) and (lines[j][:1] in (' ', '\t') or not lines[j].strip()):
                j += 1
            while j > i + 1 and not lines[j - 1].strip():
                j -= 1
            return i, j
    return None


def _q(s):
    return json.dumps(s, ensure_ascii=False)


def _render(key, value):
    if key == 'furtherWork':
        if not value:
            return ['furtherWork: []']
        out = ['furtherWork:']
        for g in value:
            out += [f'  - name: {_q(g["name"])}', f'    url: {_q(g["url"])}']
        return out
    if key in BLOCK_FIELDS and value and ('\n' in value or len(key) + len(value) > 74):
        out = [f'{key}: |']
        paras = value.split('\n\n')
        for n, para in enumerate(paras):
            if n:
                out.append('')
            out += ['  ' + l for l in textwrap.wrap(para, 76, break_long_words=False,
                                                    break_on_hyphens=False)]
        return out
    return [f'{key}: {_q(value)}']


def _set_field(lines, key, value):
    new = _render(key, value)
    span = _find_block(lines, key)
    if span:
        lines[span[0]:span[1]] = new
        return lines
    anchor = _find_block(lines, INSERT_AFTER.get(key, 'artistBio'))
    if anchor:
        lines[anchor[1]:anchor[1]] = [''] + new
    else:
        prov = next((i for i, l in enumerate(lines) if 'Provenance' in l and l.startswith('#')),
                    len(lines))
        lines[prov:prov] = new + ['']
    return lines


def _prepend_list_item(lines, key, item, current):
    """Add `item` as the first entry of a top-level string list (newest first)."""
    span = _find_block(lines, key)
    if span is None:
        anchor = next((i for i, l in enumerate(lines) if 'Provenance' in l and l.startswith('#')),
                      None)
        block = [f'{key}:', f'  - {_q(item)}']
        if anchor is None:
            lines += block
        else:
            # after the provenance header and any `source:` line
            at = anchor + 1
            while at < len(lines) and re.match(r'^source\s*:', lines[at]):
                at += 1
            lines[at:at] = block
        return lines
    if isinstance(current, list) and lines[span[0]].rstrip().endswith(':'):
        lines.insert(span[0] + 1, f'  - {_q(item)}')
        return lines
    # scalar string or inline list → rewrite as a block list, keeping the old entries
    old = current if isinstance(current, list) else ([current] if current else [])
    lines[span[0]:span[1]] = [f'{key}:'] + [f'  - {_q(x)}' for x in [item] + list(old)]
    return lines


def _human(date_iso):
    try:
        d = datetime.fromisoformat(date_iso[:10])
        return f'{d.day} {d.strftime("%B %Y")}'
    except ValueError:
        return date_iso


def _log_entry(rec, fields):
    when = _human(rec.get('date') or rec['at'])
    if rec['by'] == 'artist':
        who = (f"reviewed and approved in person by {rec['artistName']} on {when}; "
               "approved by Rob")
    elif rec['by'] == 'revert':
        who = f"revert of {rec.get('revertOf')} by Rob"
    else:
        who = 'approved by Rob'
    parts = [f"{when} — Bio review tool, {who}: {', '.join(fields)}."]
    ch = [f"{c.get('field')}: {c.get('change')}" for c in rec.get('changes') or []
          if c.get('change')]
    if ch:
        summary = '; '.join(ch)
        parts.append(f"Changes — {summary[:700]}{'…' if len(summary) > 700 else ''}.")
    if rec.get('note'):
        parts.append(f"Note: {rec['note'][:300]}")
    parts.append(f"[review:{rec['approvalId']}]")
    return ' '.join(parts)


def _apply_one(rec, mid, m, written, index):
    """Returns (applied_fields, conflicts, error)."""
    fn = index.get(str(mid)) or m.get('file')
    path = os.path.join(MURALS_DIR, fn) if fn else None
    if not path or not os.path.exists(path):
        hits = glob.glob(os.path.join(MURALS_DIR, f'{mid}-*.yaml'))
        path = hits[0] if hits else None
    if not path:
        return [], [], f'#{mid}: no YAML'
    with open(path, encoding='utf-8') as f:
        original = f.read()
    d = yaml.safe_load(original)
    token = f"[review:{rec['approvalId']}]"
    if any(token in str(x) for x in (d.get('revisionLog') or [])):
        return ['(already applied)'], [], None

    lines = original.split('\n')
    applied, conflicts = [], []
    for k, after in m['after'].items():
        local = norm_field(k, d.get(k))
        target = norm_field(k, after)
        expected = written.get((mid, k), norm_field(k, m['before'].get(k)))
        if local == target:
            written[(mid, k)] = target
            continue
        if local != expected:
            conflicts.append(k)
            continue
        lines = _set_field(lines, k, after)
        written[(mid, k)] = target
        applied.append(k)

    if conflicts:
        return [], conflicts, None          # leave the whole approval queued; touch nothing
    if applied or m.get('sources'):
        lines = _prepend_list_item(lines, 'revisionLog', _log_entry(rec, applied or list(m['after'])),
                                   d.get('revisionLog'))
        notes = list(d.get('sourceNotes') or []) if isinstance(d.get('sourceNotes'), list) \
            else d.get('sourceNotes')
        extra = []
        if rec['by'] == 'artist':
            extra.append(f"Artist-reviewed in person by {rec['artistName']}, "
                         f"{_human(rec.get('date') or rec['at'])} (bio-review {rec['approvalId']})")
        if rec.get('transcripts'):
            extra.append(f"Dictated corrections, {_human(rec.get('date') or rec['at'])} — transcript "
                         f"kept in R2 muralquest-review/applied/{rec['approvalId']}.json")
        have = set(notes if isinstance(notes, list) else [notes] if notes else [])
        # Skip fragments (e.g. "— bio + CV (primary)" split off a source line).
        extra += [s for s in m.get('sources') or []
                  if s not in have and not re.match(r'^\s*[—–-]', s) and len(s.strip()) > 10]
        for item in reversed(extra):
            d2 = yaml.safe_load('\n'.join(lines))
            lines = _prepend_list_item(lines, 'sourceNotes', item, d2.get('sourceNotes'))

    text = '\n'.join(lines)
    try:
        check = yaml.safe_load(text)
    except yaml.YAMLError as e:
        return [], [], f'#{mid}: edit produced invalid YAML ({e}) — not written'
    bad = [k for k in m['after'] if norm_field(k, check.get(k)) != norm_field(k, m['after'][k])]
    if bad:
        return [], [], f'#{mid}: round-trip mismatch on {bad} — not written'
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)
    return applied or ['(sources only)'], [], None


def pull_approvals(dry=False):
    """Write queued field approvals into the YAMLs. Returns (ok, approval_ids_to_ack)."""
    print("→ Pulling approved bio edits from the bio-review queue…")
    try:
        q = _call('/review/queue')
    except Exception as e:
        print(f"✗ Could not read the bio-review queue: {e}")
        print("  Refusing to publish — a rebuild now could undo approved field edits.")
        return False, []
    approvals = q.get('approvals') or []
    if not approvals:
        print("  Nothing queued.")
        return True, []
    index = {}
    idx_path = os.path.join(MURALS_DIR, '_index.json')
    if os.path.exists(idx_path):
        index = json.load(open(idx_path, encoding='utf-8'))

    written, to_ack, blocked = {}, [], []
    for rec in approvals:
        ok = True
        for mid, m in rec['murals'].items():
            applied, conflicts, err = _apply_one(rec, int(mid), m, written, index)
            if err:
                print(f"  ✗ {rec['approvalId']} {err}")
                ok = False
            elif conflicts:
                print(f"  ⚠ {rec['approvalId']} #{mid}: {', '.join(conflicts)} changed on the Mac "
                      "since this edit was made — NOT applied. Resolve by hand, then re-run.")
                ok = False
            else:
                who = rec['artistName'] if rec['by'] == 'artist' else rec['by']
                print(f"  ✓ #{mid}: {', '.join(applied)}  ({who}, {rec['approvalId']})")
        (to_ack if ok else blocked).append(rec['approvalId'])
    if blocked:
        print(f"  {len(blocked)} approval(s) left in the queue — see above. Live already shows them, "
              "so this publish would revert those fields. Aborting.")
        return False, []
    return True, ([] if dry else to_ack)


def ack(ids):
    if not ids:
        return
    try:
        r = _call('/review/ack', {'approvalIds': ids})
        print(f"✓ bio-review: marked {len(r.get('acked', []))} approval(s) as applied.")
    except Exception as e:
        print(f"⚠ bio-review ack failed ({e}). Harmless: they're already in the YAMLs and "
              "re-applying is skipped by the [review:…] token.")


if __name__ == '__main__':
    if '--bundle' in sys.argv:
        sys.exit(0 if push_bundle() else 1)
    if '--queue' in sys.argv:
        for a in _call('/review/queue').get('approvals', []):
            print(a['approvalId'], a['by'], a.get('artistName', ''),
                  {k: list(v['after']) for k, v in a['murals'].items()})
        sys.exit(0)
    print(__doc__)
