#!/usr/bin/env python3
"""searchbio-apply.py — apply LLM-generated searchBio expansions to YAML files.

Reads /tmp/sbio-output/<id>.txt and updates the matching YAML's searchBio block,
preserving artistBio (display bio) and all other fields. Also appends a
revisionLog entry noting the expansion.

Usage:
  python3 scripts/searchbio-apply.py [--dry-run]
"""
import argparse, glob, json, os, re, sys
from datetime import date

OUT_DIR = '/tmp/sbio-output'
YAML_DIR = '/Users/robasselin/shine-pwa/data/murals'
INDEX = f'{YAML_DIR}/_index.json'

def find_yaml(mid, idx):
    fname = idx.get(str(mid))
    if not fname:
        return None
    return os.path.join(YAML_DIR, fname)

def replace_searchbio(text, new_body):
    """Replace the searchBio: | block in YAML text. If field is missing, insert
    after artistBio: | block."""
    indent = '  '
    # Indent each line of new body by 2 spaces (YAML literal block convention)
    indented = '\n'.join(indent + ln for ln in new_body.rstrip('\n').split('\n'))
    sbio_block = f'searchBio: |\n{indented}\n'

    # Regex: match `searchBio: |` (or `>`) and all indented continuation lines
    # Stop at next top-level YAML key (zero indent) or end of file.
    pattern = re.compile(
        r'^searchBio:\s*[|>][+-]?\s*\n((?:^[ \t]+[^\n]*\n|^\s*\n)*)',
        re.MULTILINE
    )
    if pattern.search(text):
        text = pattern.sub(sbio_block, text, count=1)
        return text, 'replaced'
    # No existing searchBio — insert after artistBio block
    abio_pattern = re.compile(
        r'(^artistBio:\s*[|>][+-]?\s*\n(?:^[ \t]+[^\n]*\n|^\s*\n)*)',
        re.MULTILINE
    )
    m = abio_pattern.search(text)
    if not m:
        return None, 'no artistBio anchor'
    insert_at = m.end()
    text = text[:insert_at] + '\n' + sbio_block + text[insert_at:]
    return text, 'inserted'


def append_revision(text, note):
    """Append a revisionLog entry. Handles list form, string form, or missing."""
    today = date.today().isoformat()
    entry = f'  - "{today} — {note}"\n'

    # Case 1: revisionLog as list — append to the list
    list_pat = re.compile(
        r'^(revisionLog:\s*\n(?:^\s*-\s*[^\n]*\n)+)',
        re.MULTILINE
    )
    m = list_pat.search(text)
    if m:
        return text[:m.end()] + entry + text[m.end():]

    # Case 2: revisionLog as inline string — convert to list
    str_pat = re.compile(r'^revisionLog:\s+"([^"]*)"\s*\n', re.MULTILINE)
    m = str_pat.search(text)
    if m:
        old_note = m.group(1)
        replacement = f'revisionLog:\n  - "{old_note}"\n{entry}'
        return text[:m.start()] + replacement + text[m.end():]

    # Case 3: revisionLog missing — append at end
    if not text.endswith('\n'):
        text += '\n'
    text += f'revisionLog:\n{entry}'
    return text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    idx = json.load(open(INDEX))
    files = sorted(glob.glob(f'{OUT_DIR}/*.txt'))
    if not files:
        print('No outputs found in', OUT_DIR)
        sys.exit(1)

    applied = 0
    for f in files:
        mid = int(os.path.basename(f).split('.')[0])
        new_sbio = open(f, encoding='utf-8').read().strip() + '\n'
        if not new_sbio.strip():
            print(f'#{mid:>3} SKIP: output empty')
            continue
        yaml_path = find_yaml(mid, idx)
        if not yaml_path or not os.path.exists(yaml_path):
            print(f'#{mid:>3} SKIP: no YAML at {yaml_path}')
            continue
        text = open(yaml_path, encoding='utf-8').read()
        new_text, action = replace_searchbio(text, new_sbio)
        if not new_text:
            print(f'#{mid:>3} SKIP: {action}')
            continue
        new_text = append_revision(new_text, 'Expanded searchBio (~600-1000 words) from cached source material — display bio (artistBio) unchanged.')
        if args.dry_run:
            print(f'#{mid:>3} DRY-RUN ({action}): would write {len(new_text)} chars')
        else:
            with open(yaml_path, 'w', encoding='utf-8') as fh:
                fh.write(new_text)
            print(f'#{mid:>3} {action} → {os.path.basename(yaml_path)}')
        applied += 1
    print(f'\n{"Would apply" if args.dry_run else "Applied"}: {applied}')


if __name__ == '__main__':
    main()
