#!/usr/bin/env python3
"""
build-data.py — YAML → data.js compiler

Reads approved YAML files from data/murals/ and data/config.yaml,
validates all fields, and generates js/data.js.

The generated data.js is byte-for-byte deterministic for the same input.
Provenance fields (source, sourceNotes) are stripped — they stay in YAML only.

Usage:
    python3 scripts/build-data.py                # build js/data.js
    python3 scripts/build-data.py --dry-run      # validate only, don't write
    python3 scripts/build-data.py --list-stale    # show murals needing enhancement
    python3 scripts/build-data.py --stats         # show coverage statistics

Exit codes:
    0 = success (or --dry-run with no errors)
    1 = validation errors (data.js NOT written)
"""

import os
import sys
import glob
import yaml
import json
import re
from datetime import date

# Resolve paths relative to project root
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
MURALS_DIR = os.path.join(PROJECT_ROOT, 'data', 'murals')
CONFIG_FILE = os.path.join(PROJECT_ROOT, 'data', 'config.yaml')
OUTPUT_FILE = os.path.join(PROJECT_ROOT, 'js', 'data.js')

# Fields required in every YAML file — validation will error if any are missing
REQUIRED_FIELDS = ['id', 'artist', 'year', 'lat', 'lng', 'address', 'category', 'img']

# All possible YAML fields that get exported to data.js
# Provenance fields (source, sourceNotes) are intentionally excluded
EXPORT_FIELDS = [
    'id', 'artist', 'title', 'address', 'building',
    'lat', 'lng', 'year', 'category', 'instagram', 'artistBio',
    'img', 'basedIn',
    'muralDescription', 'muralInspiration', 'muralAwards', 'artistAwards',
]

# Provenance fields — stripped from output
PROVENANCE_FIELDS = ['source', 'sourceNotes']


def load_config():
    """Load and validate config.yaml."""
    if not os.path.exists(CONFIG_FILE):
        print(f"ERROR: Config file not found: {CONFIG_FILE}")
        sys.exit(1)

    with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
        config = yaml.safe_load(f)

    required_keys = ['CATEGORIES', 'YEARS', 'YEAR_COLORS']
    for key in required_keys:
        if key not in config:
            print(f"ERROR: config.yaml missing required key: {key}")
            sys.exit(1)

    return config


def load_murals():
    """Load all YAML files from data/murals/ (excluding _template.yaml)."""
    pattern = os.path.join(MURALS_DIR, '*.yaml')
    files = sorted(glob.glob(pattern))

    murals = []
    for filepath in files:
        basename = os.path.basename(filepath)
        if basename.startswith('_'):
            continue  # skip template

        with open(filepath, 'r', encoding='utf-8') as f:
            try:
                data = yaml.safe_load(f)
            except yaml.YAMLError as e:
                print(f"ERROR: Invalid YAML in {basename}: {e}")
                continue

        if data is None:
            print(f"WARNING: Empty file skipped: {basename}")
            continue

        data['_filename'] = basename
        murals.append(data)

    # IMPORTANT: Only murals with source="claude-enhanced" are included in the build.
    # Legacy/unreviewed murals are excluded until they've been verified by Rob.
    approved = [m for m in murals if m.get('source') == 'claude-enhanced']
    skipped = len(murals) - len(approved)
    if skipped:
        print(f"  Skipped {skipped} legacy murals (not yet reviewed)")
    return approved


def validate_murals(murals, config):
    """Validate all murals. Returns (errors, warnings) lists."""
    errors = []
    warnings = []
    seen_ids = {}
    valid_categories = set(config.get('CATEGORIES', []))
    bounds = config.get('BOUNDS', {})

    for m in murals:
        fn = m.get('_filename', '?')
        prefix = f"  {fn}"

        # Required fields
        for field in REQUIRED_FIELDS:
            if field not in m or m[field] is None:
                # lat/lng can be null for murals with unknown location
                if field in ('lat', 'lng'):
                    warnings.append(f"{prefix}: {field} is null (unknown location)")
                else:
                    errors.append(f"{prefix}: missing required field '{field}'")

        # ID uniqueness
        mid = m.get('id')
        if mid is not None:
            if mid in seen_ids:
                errors.append(f"{prefix}: duplicate ID {mid} (also in {seen_ids[mid]})")
            else:
                seen_ids[mid] = fn

        # Category validation
        cat = m.get('category', '')
        if cat and cat not in valid_categories:
            errors.append(f"{prefix}: invalid category '{cat}' (valid: {valid_categories})")

        # GPS bounds check
        lat = m.get('lat')
        lng = m.get('lng')
        if lat is not None and lng is not None and bounds:
            if not (bounds.get('lat_min', 0) <= lat <= bounds.get('lat_max', 90)):
                warnings.append(f"{prefix}: lat {lat} outside Tampa Bay bounds")
            if not (bounds.get('lng_min', -180) <= lng <= bounds.get('lng_max', 0)):
                warnings.append(f"{prefix}: lng {lng} outside Tampa Bay bounds")

        # Image file check
        img = m.get('img', '')
        if img:
            img_path = os.path.join(PROJECT_ROOT, img)
            if not os.path.exists(img_path):
                warnings.append(f"{prefix}: image not found: {img}")

        # Bio quality warnings
        bio = m.get('artistBio', '') or ''
        if len(bio) < 20 and bio:
            warnings.append(f"{prefix}: very short bio ({len(bio)} chars)")

    return errors, warnings


def js_string_escape(s):
    """Escape a string for JavaScript single-quoted output."""
    if s is None:
        return ''
    s = str(s)
    s = s.replace('\\', '\\\\')
    s = s.replace("'", "\\'")
    # Replace curly/smart quotes with straight equivalents
    s = s.replace('\u2018', "\\'")   # LEFT SINGLE QUOTATION MARK
    s = s.replace('\u2019', "\\'")   # RIGHT SINGLE QUOTATION MARK
    s = s.replace('\u201C', '"')     # LEFT DOUBLE QUOTATION MARK
    s = s.replace('\u201D', '"')     # RIGHT DOUBLE QUOTATION MARK
    s = s.replace('\n', ' ')  # flatten newlines for single-line JS
    s = s.replace('\r', '')
    # Collapse multiple spaces
    s = re.sub(r' {2,}', ' ', s)
    return s.strip()


def mural_to_js(m):
    """Convert a mural dict to a JS object literal string.
    Uses abbreviated field names (a, t, loc, bldg, y, cat, ig, from) to minimize payload.
    artistBio and muralDescription are combined into a single 'bio' field."""
    mid = m.get('id', 0)
    artist = js_string_escape(m.get('artist', ''))
    title = js_string_escape(m.get('title', ''))
    address = js_string_escape(m.get('address', ''))
    building = js_string_escape(m.get('building', ''))
    lat = m.get('lat')
    lng = m.get('lng')
    year = m.get('year', 0)
    category = js_string_escape(m.get('category', 'shine'))
    instagram = js_string_escape(m.get('instagram', ''))
    img = js_string_escape(m.get('img', ''))
    based_in = js_string_escape(m.get('basedIn', ''))

    # Separate bio and mural description fields
    bio = js_string_escape((m.get('artistBio', '') or '').strip())
    desc = js_string_escape((m.get('muralDescription', '') or '').strip())

    lat_str = str(lat) if lat is not None else 'null'
    lng_str = str(lng) if lng is not None else 'null'

    return (
        f"  {{id:{mid},"
        f"a:'{artist}',"
        f"t:'{title}',"
        f"loc:'{address}',"
        f"bldg:'{building}',"
        f"lat:{lat_str},"
        f"lng:{lng_str},"
        f"y:{year},"
        f"cat:'{category}',"
        f"ig:'{instagram}',"
        f"bio:'{bio}',"
        f"desc:'{desc}',"
        f"img:'{img}',"
        f"from:'{based_in}'}}"
    )


def generate_data_js(murals, config):
    """Generate the full data.js content as a deterministic ES module string.
    Output includes: murals array, YEARS, YEAR_COLORS, CATEGORY_COLORS exports.
    Murals sorted by year desc then artist alpha."""
    lines = []

    # Header
    lines.append('// SHINE Mural Festival — Mural Database')
    lines.append(f'// {len(murals)} murals | Generated by build-data.py on {date.today().isoformat()}')
    lines.append('// DO NOT EDIT — this file is generated from data/murals/*.yaml')
    lines.append('// To make changes, edit the YAML source files and run: python3 scripts/build-data.py')
    lines.append('//')
    lines.append('// Schema: id, a(artist), t(title), loc(address), bldg(building),')
    lines.append('//   lat, lng, y(year), cat(category), ig(instagram), bio, desc(muralDescription), img, from(basedIn)')
    lines.append('')

    # Sort: year desc, then artist alpha
    sorted_murals = sorted(murals, key=lambda m: (-m.get('year', 0), (m.get('artist', '') or '').lower()))

    # Murals array
    lines.append('export const murals = [')
    mural_lines = [mural_to_js(m) for m in sorted_murals]
    lines.append(',\n'.join(mural_lines))
    lines.append('];')
    lines.append('')

    # YEARS
    years = config.get('YEARS', [])
    years_str = ', '.join(str(y) for y in years)
    lines.append(f'// Year range for filter pills')
    lines.append(f'export const YEARS = [{years_str}];')
    lines.append('')

    # YEAR_COLORS
    year_colors = config.get('YEAR_COLORS', {})
    lines.append('// Year-to-color mapping for map markers')
    lines.append('export const YEAR_COLORS = {')
    for yr in sorted(year_colors.keys(), reverse=True):
        color = year_colors[yr]
        lines.append(f"  {yr}: '{color}',")
    lines.append('};')
    lines.append('')

    # CATEGORY_COLORS
    cat_colors = config.get('CATEGORY_COLORS', {})
    if cat_colors:
        lines.append('// Category-to-color mapping for map filters')
        lines.append('export const CATEGORY_COLORS = {')
        for cat in sorted(cat_colors.keys()):
            color = cat_colors[cat]
            lines.append(f"  '{cat}': '{color}',")
        lines.append('};')

    return '\n'.join(lines) + '\n'


def list_stale(murals):
    """Print murals still marked as legacy/needing enhancement."""
    stale = [m for m in murals if m.get('source', 'legacy') == 'legacy']
    stale.sort(key=lambda m: m.get('id', 0))

    print(f"\n{len(stale)} murals still need enhancement (source: legacy):\n")
    for m in stale:
        fn = m.get('_filename', '?')
        bio_len = len(m.get('artistBio', '') or '')
        print(f"  {fn}  (bio={bio_len} chars)")

    enhanced = len(murals) - len(stale)
    print(f"\n{enhanced}/{len(murals)} murals enhanced ({100*enhanced//max(len(murals),1)}%)")


def print_stats(murals):
    """Print coverage statistics."""
    total = len(murals)
    has_bio = sum(1 for m in murals if len(m.get('artistBio', '') or '') > 20)
    has_gps = sum(1 for m in murals if m.get('lat') is not None)
    has_img = sum(1 for m in murals if m.get('img', ''))
    has_addr = sum(1 for m in murals if m.get('address', ''))
    has_ig = sum(1 for m in murals if m.get('instagram', ''))

    by_year = {}
    for m in murals:
        y = m.get('year', 0)
        by_year[y] = by_year.get(y, 0) + 1

    print(f"\n── Coverage Stats ({total} murals) ──")
    print(f"  Bio:       {has_bio}/{total} ({100*has_bio//max(total,1)}%)")
    print(f"  GPS:       {has_gps}/{total} ({100*has_gps//max(total,1)}%)")
    print(f"  Image:     {has_img}/{total} ({100*has_img//max(total,1)}%)")
    print(f"  Address:   {has_addr}/{total} ({100*has_addr//max(total,1)}%)")
    print(f"  Instagram: {has_ig}/{total} ({100*has_ig//max(total,1)}%)")
    print(f"\n  By year:")
    for y in sorted(by_year.keys(), reverse=True):
        print(f"    {y}: {by_year[y]} murals")


def main():
    dry_run = '--dry-run' in sys.argv
    show_stale = '--list-stale' in sys.argv
    show_stats = '--stats' in sys.argv

    config = load_config()
    murals = load_murals()

    if not murals:
        print("No YAML files found in data/murals/. Nothing to build.")
        print("Run 'python3 scripts/migrate.py' first, or add YAML files manually.")
        sys.exit(0)

    print(f"Loaded {len(murals)} murals from {MURALS_DIR}")

    if show_stale:
        list_stale(murals)
        return

    if show_stats:
        print_stats(murals)
        return

    # Validate
    errors, warnings = validate_murals(murals, config)

    if warnings:
        print(f"\nWarnings ({len(warnings)}):")
        for w in warnings:
            print(f"  ⚠ {w}")

    if errors:
        print(f"\nErrors ({len(errors)}):")
        for e in errors:
            print(f"  ✗ {e}")
        print(f"\nBuild ABORTED — fix {len(errors)} error(s) above")
        sys.exit(1)

    # Generate
    output = generate_data_js(murals, config)

    if dry_run:
        print(f"\n✓ Validation passed. {len(murals)} murals ready to build.")
        print(f"  (--dry-run: {OUTPUT_FILE} not written)")
    else:
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            f.write(output)
        print(f"\n✓ Generated {OUTPUT_FILE} with {len(murals)} murals")

    print_stats(murals)


if __name__ == '__main__':
    main()
