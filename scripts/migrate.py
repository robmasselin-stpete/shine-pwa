#!/usr/bin/env python3
"""
migrate.py — One-time migration: data.js → individual YAML files

Parses the current js/data.js and generates one YAML file per mural
in data/murals/ for human review. These files are NOT wired into the
app until individually approved and built via build-data.py.

All generated files are marked source: "legacy" (unverified).

Usage:
    python3 scripts/migrate.py
    python3 scripts/migrate.py --dry-run   # preview without writing
"""

import os
import re
import sys
import json
import unicodedata

# Resolve paths relative to project root (parent of scripts/)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DATA_JS = os.path.join(PROJECT_ROOT, 'js', 'data.js')
OUTPUT_DIR = os.path.join(PROJECT_ROOT, 'data', 'murals')


def slugify(text):
    """Convert artist name to filename slug: lowercase, hyphens, no special chars."""
    text = unicodedata.normalize('NFKD', text)
    text = text.encode('ascii', 'ignore').decode('ascii')
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '-', text)
    text = text.strip('-')
    return text


def parse_data_js(filepath):
    """
    Parse the murals array from data.js.

    This is non-trivial because data.js uses JS syntax (not JSON):
    single-quoted strings, unquoted keys, null literals.
    Strategy: regex-extract each {...} object, then parse key:value
    pairs character-by-character to handle escaped quotes in values.
    Also extracts YEARS and YEAR_COLORS config exports.
    """
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Extract the murals array: everything between [ and ];
    match = re.search(r'export const murals = \[(.*?)\];', content, re.DOTALL)
    if not match:
        print("ERROR: Could not find 'export const murals = [...]' in data.js")
        sys.exit(1)

    array_body = match.group(1)

    # Parse each mural object individually
    # Match each {...} block
    mural_pattern = re.compile(r'\{([^}]+)\}')
    murals = []

    for obj_match in mural_pattern.finditer(array_body):
        obj_str = obj_match.group(1)
        mural = parse_mural_object(obj_str)
        if mural:
            murals.append(mural)

    # Also extract YEARS and YEAR_COLORS
    config = {}

    years_match = re.search(r'export const YEARS = \[([^\]]+)\]', content)
    if years_match:
        config['YEARS'] = [int(y.strip()) for y in years_match.group(1).split(',') if y.strip()]

    colors_match = re.search(r'export const YEAR_COLORS = \{([^}]+)\}', content, re.DOTALL)
    if colors_match:
        color_pairs = re.findall(r"(\d+):\s*'([^']+)'", colors_match.group(1))
        config['YEAR_COLORS'] = {int(k): v for k, v in color_pairs}

    return murals, config


def parse_mural_object(obj_str):
    """Parse a single JS object string like id:1,a:'Aaron Tullo',... into a dict.
    Walks character-by-character to handle: quoted strings with escapes,
    numeric values, null literals. Returns dict with abbreviated keys (a, t, loc, etc.)."""
    mural = {}

    # We need to handle values that may contain commas (inside quotes)
    # Strategy: walk through character by character, splitting on key:value pairs

    # First, handle the simple numeric/null fields
    # Then handle quoted string fields

    # Extract all key:value pairs
    # Keys are: id, a, t, loc, bldg, lat, lng, y, ig, bio, img, from
    pos = 0
    s = obj_str

    while pos < len(s):
        # Skip whitespace and commas
        while pos < len(s) and s[pos] in ' ,\n\r\t':
            pos += 1
        if pos >= len(s):
            break

        # Find key
        key_match = re.match(r'([a-zA-Z]+)\s*:', s[pos:])
        if not key_match:
            pos += 1
            continue

        key = key_match.group(1)
        pos += key_match.end()

        # Skip whitespace
        while pos < len(s) and s[pos] in ' \t':
            pos += 1

        if pos >= len(s):
            break

        # Parse value
        if s[pos] == "'":
            # Quoted string — find matching close quote, handling escapes
            value, end_pos = parse_quoted_string(s, pos)
            pos = end_pos
        elif s[pos:pos+4] == 'null':
            value = None
            pos += 4
        else:
            # Numeric value
            num_match = re.match(r'(-?[\d.]+)', s[pos:])
            if num_match:
                val_str = num_match.group(1)
                if '.' in val_str:
                    value = float(val_str)
                else:
                    value = int(val_str)
                pos = pos + num_match.end()
            else:
                pos += 1
                continue

        mural[key] = value

    return mural if mural else None


def parse_quoted_string(s, pos):
    """Parse a single-quoted JS string starting at pos, return (value, end_pos)."""
    assert s[pos] == "'"
    pos += 1  # skip opening quote
    chars = []
    while pos < len(s):
        c = s[pos]
        if c == '\\' and pos + 1 < len(s):
            next_c = s[pos + 1]
            if next_c == "'":
                chars.append("'")
                pos += 2
            elif next_c == '\\':
                chars.append('\\')
                pos += 2
            elif next_c == 'n':
                chars.append('\n')
                pos += 2
            else:
                chars.append(c)
                pos += 1
        elif c == "'":
            pos += 1  # skip closing quote
            break
        else:
            chars.append(c)
            pos += 1
    return ''.join(chars), pos


def yaml_scalar(value, key=None):
    """Format a value for YAML output."""
    if value is None:
        return 'null'
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return str(value)

    # String value
    s = str(value)

    # For bio fields, use block scalar if multi-sentence or long
    if key in ('bio', 'artistBio', 'muralDescription') and len(s) > 80:
        # Use literal block scalar (|) — preserves newlines, no escaping needed
        lines = s.split('\n')
        # Wrap long lines at ~78 chars for readability
        wrapped = []
        for line in lines:
            while len(line) > 78:
                # Find a good break point
                break_at = line.rfind(' ', 0, 78)
                if break_at <= 0:
                    break_at = 78
                wrapped.append(line[:break_at])
                line = line[break_at:].lstrip()
            wrapped.append(line)
        block = '\n  '.join(wrapped)
        return f'|\n  {block}'

    # For other strings, use double quotes if they contain special chars
    if any(c in s for c in [':', '#', '{', '}', '[', ']', ',', '&', '*', '?', '|', '-', '<', '>', '=', '!', '%', '@', '`', '"', "'"]):
        # Escape backslashes and double quotes
        s = s.replace('\\', '\\\\').replace('"', '\\"')
        return f'"{s}"'

    if s == '' or s == 'null' or s == 'true' or s == 'false':
        return f'"{s}"'

    return s


def mural_to_yaml(mural, mural_id):
    """Convert a parsed mural dict to YAML string."""
    # Map short keys to full names
    artist = mural.get('a', '')
    title = mural.get('t', '')
    address = mural.get('loc', '')
    building = mural.get('bldg', '')
    lat = mural.get('lat')
    lng = mural.get('lng')
    year = mural.get('y', 0)
    instagram = mural.get('ig', '')
    bio = mural.get('bio', '')
    img = mural.get('img', '')
    based_in = mural.get('from', '')

    # Determine category based on year and other signals
    if year and year >= 2020:
        category = 'shine'
    else:
        category = 'shine'  # default; user can adjust

    lines = []
    lines.append(f'# {artist} — {year}')
    lines.append(f'')
    lines.append(f'# ── Required ──')
    lines.append(f'id: {mural_id}')
    lines.append(f'artist: {yaml_scalar(artist)}')
    lines.append(f'year: {year if year else 0}')
    lines.append(f'lat: {lat if lat is not None else "null"}')
    lines.append(f'lng: {lng if lng is not None else "null"}')
    lines.append(f'address: {yaml_scalar(address)}')
    lines.append(f'category: {yaml_scalar(category)}')
    lines.append(f'img: {yaml_scalar(img)}')
    lines.append(f'')
    lines.append(f'# ── Optional ──')
    lines.append(f'title: {yaml_scalar(title)}')
    lines.append(f'building: {yaml_scalar(building)}')
    lines.append(f'instagram: {yaml_scalar(instagram)}')
    lines.append(f'basedIn: {yaml_scalar(based_in)}')
    lines.append(f'')
    lines.append(f'artistBio: {yaml_scalar(bio, key="artistBio")}')
    lines.append(f'')
    lines.append(f'muralDescription: ""')
    lines.append(f'muralInspiration: ""')
    lines.append(f'muralAwards: ""')
    lines.append(f'artistAwards: ""')
    lines.append(f'')
    lines.append(f'# ── Provenance (not exported to data.js) ──')
    lines.append(f'source: "legacy"')
    lines.append(f'sourceNotes: "Migrated from data.js {get_date()}"')

    return '\n'.join(lines) + '\n'


def get_date():
    """Return today's date as YYYY-MM-DD."""
    from datetime import date
    return date.today().isoformat()


def main():
    dry_run = '--dry-run' in sys.argv

    if not os.path.exists(DATA_JS):
        print(f"ERROR: Cannot find {DATA_JS}")
        sys.exit(1)

    print(f"Reading {DATA_JS}...")
    murals, config = parse_data_js(DATA_JS)
    print(f"Parsed {len(murals)} murals")

    if not dry_run:
        os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Sort by year desc, then artist alpha (matches current data.js order)
    murals.sort(key=lambda m: (-m.get('y', 0), m.get('a', '').lower()))

    # Assign sequential IDs
    created = 0
    skipped = 0
    seen_artists_years = set()

    for i, mural in enumerate(murals, 1):
        artist = mural.get('a', 'unknown')
        year = mural.get('y', 0)

        # Detect potential duplicates
        key = (artist.lower().strip(), year)
        is_dupe = key in seen_artists_years
        seen_artists_years.add(key)

        slug = slugify(artist)
        year_str = str(year) if year else 'unknown'
        filename = f'{i:03d}-{slug}-{year_str}.yaml'

        if is_dupe:
            print(f"  WARNING: Possible duplicate — {artist} ({year}) → {filename}")

        yaml_content = mural_to_yaml(mural, i)

        if dry_run:
            print(f"  Would create: {filename}")
        else:
            filepath = os.path.join(OUTPUT_DIR, filename)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(yaml_content)
            created += 1

    print(f"\n{'Would create' if dry_run else 'Created'}: {created} YAML files")
    if skipped:
        print(f"Skipped: {skipped}")
    print(f"Output directory: {OUTPUT_DIR}")

    if not dry_run:
        print(f"\nNext step: review YAML files, then run build-data.py to compile approved ones")


if __name__ == '__main__':
    main()
