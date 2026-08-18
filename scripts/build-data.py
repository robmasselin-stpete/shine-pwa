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
import hashlib
from datetime import date, datetime, timezone

# Resolve paths relative to project root
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
MURALS_DIR = os.path.join(PROJECT_ROOT, 'data', 'murals')
CONFIG_FILE = os.path.join(PROJECT_ROOT, 'data', 'config.yaml')
OUTPUT_FILE = os.path.join(PROJECT_ROOT, 'js', 'data.js')
# v1.5 content-architecture: OTA manifest + bundled version marker
CONTENT_JSON_FILE = os.path.join(PROJECT_ROOT, 'js', 'content.json')
CONTENT_META_FILE = os.path.join(PROJECT_ROOT, 'js', 'content-meta.js')
# Narration audio precache list — the service worker fetches ./audio-manifest.json
# on install and precaches every clip so tours play offline (audio streams from the
# CDN and is NOT bundled; see cap:copy exclude + sw.js AUDIO_CACHE).
AUDIO_MANIFEST_FILE = os.path.join(PROJECT_ROOT, 'audio-manifest.json')

# Fields required in every YAML file — validation will error if any are missing
REQUIRED_FIELDS = ['id', 'artist', 'year', 'lat', 'lng', 'address', 'category', 'img']

# All possible YAML fields that get exported to data.js
# Provenance fields (source, sourceNotes) are intentionally excluded
EXPORT_FIELDS = [
    'id', 'artist', 'title', 'address', 'building',
    'lat', 'lng', 'year', 'category', 'instagram', 'artistBio',
    'img', 'basedIn',
    'searchMuralDescription', 'muralInspiration', 'muralAwards', 'artistAwards',
    'impressions', 'furtherWork',
    'photos', 'underConstruction',   # SHINE 2026 build-viewer + construction flag
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

    # Murals marked with a non-empty `status` stay in YAML but never reach the app.
    # Buckets:
    #   research      — unidentified artists / awaiting more info
    #   painted-over  — wall no longer exists (preserved for history)
    EXCLUDED_STATUSES = {'research', 'painted-over'}
    for status in sorted(EXCLUDED_STATUSES):
        bucket = [m for m in murals if m.get('status') == status]
        if bucket:
            print(f"  Skipped {len(bucket)} murals with status: {status}")
    murals = [m for m in murals if m.get('status') not in EXCLUDED_STATUSES]

    # Murals are approved if they have source="claude-enhanced" OR a revisionLog.
    # Legacy/unreviewed murals are excluded until they've been verified by Rob.
    approved = [m for m in murals if m.get('source') == 'claude-enhanced' or m.get('revisionLog')]
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
    s = s.replace('\r', '')
    # Preserve paragraph breaks as \n\n, flatten single newlines to spaces
    s = re.sub(r'\n\n+', '\x00', s)  # placeholder for paragraph breaks
    s = s.replace('\n', ' ')
    s = s.replace('\x00', '\\n\\n')  # JS literal \n\n
    # Collapse multiple spaces
    s = re.sub(r' {2,}', ' ', s)
    return s.strip()


def _build_field_notes(m):
    """Build a JS array string from fieldNotes list, or empty string if none."""
    notes = m.get('fieldNotes') or []
    if not notes:
        return ''
    items = ','.join(f"'{js_string_escape(n)}'" for n in notes if n)
    return f"[{items}]"

def _build_along_the_way(m):
    """Build a JS array string from alongTheWay list, or empty string if none."""
    notes = m.get('alongTheWay') or []
    if not notes:
        return ''
    items = ','.join(f"'{js_string_escape(n)}'" for n in notes if n)
    return f"[{items}]"


def _build_photos(m):
    """SHINE 2026 build-viewer: photos [{url,dateTaken}] → JS array [{u,d}], '' if none.
    Additive — existing murals keep their single `img`; construction murals populate this."""
    photos = m.get('photos') or []
    items = []
    for p in photos:
        if not p or not p.get('url'):
            continue
        items.append(f"{{u:'{js_string_escape(p.get('url',''))}',"
                     f"d:'{js_string_escape(p.get('dateTaken',''))}'}}")
    return f"[{','.join(items)}]" if items else ''


def _build_sources(m):
    """Build a JS array string of fetchable URLs from sourceNotes (URL entries only).
    Non-URL notes (e.g. 'GPS from Rob's photo...') are dropped from the export."""
    sn = m.get('sourceNotes')
    if not sn:
        return ''
    if isinstance(sn, str):
        sn = [sn]
    urls = [u.strip() for u in sn
            if isinstance(u, str) and u.strip().startswith(('http://', 'https://'))]
    if not urls:
        return ''
    items = ','.join(f"'{js_string_escape(u)}'" for u in urls)
    return f"[{items}]"


def mural_to_js(m):
    """Convert a mural dict to a JS object literal string.
    Uses abbreviated field names (a, t, loc, bldg, y, cat, ig, from) to minimize payload.
    artistBio is the displayed bio. searchMuralDescription is search-only (hidden in DOM)."""
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
    desc = js_string_escape((m.get('searchMuralDescription', '') or '').strip())
    audio = js_string_escape(m.get('audio', '') or '')
    original_img = js_string_escape(m.get('originalImg', '') or '')
    search_bio = js_string_escape((m.get('searchBio', '') or '').strip())
    mural_insp = js_string_escape((m.get('muralInspiration', '') or '').strip())
    mural_awards = js_string_escape((m.get('muralAwards', '') or '').strip())
    artist_awards = js_string_escape((m.get('artistAwards', '') or '').strip())

    # Impressions — list of strings
    raw_imp = m.get('impressions') or []
    imp_items = ','.join(f"'{js_string_escape(s)}'" for s in raw_imp if s)
    imp_str = f"[{imp_items}]" if imp_items else '[]'

    # Further Work — list of {name, url}
    raw_gal = m.get('furtherWork') or []
    gal_items = ','.join(
        f"{{name:'{js_string_escape(g.get('name',''))}',url:'{js_string_escape(g.get('url',''))}'}}"
        for g in raw_gal if g
    )
    gal_str = f"[{gal_items}]" if gal_items else 'null'

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
        f"imp:{imp_str},"
        f"img:'{img}',"
        f"from:'{based_in}',"
        f"aud:'{audio}',"
        f"insp:'{mural_insp}',"
        f"maw:'{mural_awards}',"
        f"aaw:'{artist_awards}',"
        f"fw:{gal_str}"
        + (f",oimg:'{original_img}'" if original_img else '')
        + (f",sbio:'{search_bio}'" if search_bio else '')
        + (',gone:true' if m.get('gone') else '')
        + (f",goneDate:'{js_string_escape(m.get('goneDate',''))}'" if m.get('gone') and m.get('goneDate') else '')
        + (f",goneReason:'{js_string_escape(m.get('goneReason',''))}'" if m.get('gone') and m.get('goneReason') else '')
        + (f",fn:{fn_str}" if (fn_str := _build_field_notes(m)) else '')
        + (f",atw:{atw_str}" if (atw_str := _build_along_the_way(m)) else '')
        + (f",src:{src_str}" if (src_str := _build_sources(m)) else '')
        + (',uc:true' if m.get('underConstruction') else '')            # SHINE 2026
        + (f",ph:{ph_str}" if (ph_str := _build_photos(m)) else '')     # SHINE 2026 build-viewer
        + '}'
    )


POI_DIR = os.path.join(PROJECT_ROOT, 'data', 'pois')


def load_pois():
    """Load all POI YAMLs from data/pois/ (skip _template.yaml)."""
    if not os.path.isdir(POI_DIR):
        return []
    pois = []
    for filepath in sorted(glob.glob(os.path.join(POI_DIR, '*.yaml'))):
        if os.path.basename(filepath).startswith('_'):
            continue
        try:
            data = yaml.safe_load(open(filepath, encoding='utf-8'))
        except yaml.YAMLError as e:
            print(f"ERROR: Invalid YAML in POI {filepath}: {e}")
            continue
        if isinstance(data, dict) and data.get('id') is not None:
            pois.append(data)
    return pois


def poi_to_js(p):
    """Convert a POI dict to a compact JS object literal string."""
    pid = p.get('id', 0)
    name = js_string_escape(p.get('name', ''))
    ptype = js_string_escape(p.get('type', ''))
    lat = p.get('lat')
    lng = p.get('lng')
    addr = js_string_escape(p.get('address', ''))
    bldg = js_string_escape(p.get('building', ''))
    web = js_string_escape(p.get('website', ''))
    ig = js_string_escape(p.get('instagram', ''))
    hrs = js_string_escape(p.get('hours', ''))
    headline = js_string_escape((p.get('headline', '') or '').strip())
    image = js_string_escape((p.get('image', '') or '').strip())
    desc = js_string_escape((p.get('description', '') or '').strip())
    linked = p.get('linkedMurals') or []
    linked_str = '[' + ','.join(str(int(x)) for x in linked) + ']'
    lat_s = str(lat) if lat is not None else 'null'
    lng_s = str(lng) if lng is not None else 'null'
    return (
        f"  {{id:{pid},"
        f"name:'{name}',"
        f"type:'{ptype}',"
        f"lat:{lat_s},lng:{lng_s},"
        f"addr:'{addr}',bldg:'{bldg}',"
        f"web:'{web}',ig:'{ig}',hrs:'{hrs}',"
        f"headline:'{headline}',"
        f"img:'{image}',"
        f"desc:'{desc}',"
        f"lm:{linked_str}}}"
    )


def generate_data_js(murals, config, pois=None):
    """Generate the full data.js content as a deterministic ES module string.
    Output includes: murals array, YEARS, YEAR_COLORS, CATEGORY_COLORS, pois.
    Murals sorted by year desc then artist alpha."""
    pois = pois or []
    lines = []

    # Header
    lines.append('// SHINE Mural Festival — Mural Database')
    lines.append(f'// {len(murals)} murals | Generated by build-data.py on {date.today().isoformat()}')
    lines.append('// DO NOT EDIT — this file is generated from data/murals/*.yaml')
    lines.append('// To make changes, edit the YAML source files and run: python3 scripts/build-data.py')
    lines.append('//')
    lines.append('// Schema: id, a(artist), t(title), loc(address), bldg(building),')
    lines.append('//   lat, lng, y(year), cat(category), ig(instagram), bio, desc(muralDescription), imp(impressions), img, from(basedIn)')
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
        lines.append('')

    # POIs (Points of Interest — galleries, studios, shops, etc.)
    # Map-only. Tap or proximity-trigger shows a small popup card with linked murals.
    lines.append(f'// Points of Interest ({len(pois)} POIs) — map-only, not in Explore grid')
    lines.append('export const pois = [')
    poi_lines = [poi_to_js(p) for p in sorted(pois, key=lambda p: p.get('id', 0))]
    if poi_lines:
        lines.append(',\n'.join(poi_lines))
    lines.append('];')

    return '\n'.join(lines) + '\n'


# ─────────────────────────────────────────────────────────────────────────────
# v1.5 content-architecture: JSON manifest for OTA content updates.
# content.json mirrors the SAME data + short-key shape as data.js (the bundled
# fallback) so the app consumes either identically. The client fetches this from
# the CDN and applies it if newer than the bundled baseline. Keep the field
# selection here in sync with mural_to_js / poi_to_js.
# ─────────────────────────────────────────────────────────────────────────────

def text_normalize(s):
    """Same content normalization as js_string_escape (smart quotes, paragraph
    breaks, whitespace) but WITHOUT the JS single-quote escaping — json.dump
    handles JSON escaping. Produces a Python str with real \\n\\n for paragraphs,
    so the runtime string matches data.js exactly."""
    if s is None:
        return ''
    s = str(s)
    s = s.replace('‘', "'").replace('’', "'")
    s = s.replace('“', '"').replace('”', '"')
    s = s.replace('\r', '')
    s = re.sub(r'\n\n+', '\x00', s)
    s = s.replace('\n', ' ')
    s = s.replace('\x00', '\n\n')
    s = re.sub(r' {2,}', ' ', s)
    return s.strip()


def mural_to_dict(m):
    """Mirror of mural_to_js as a dict (same short keys, same conditional omissions)."""
    d = {
        'id': m.get('id', 0),
        'a': text_normalize(m.get('artist', '')),
        't': text_normalize(m.get('title', '')),
        'loc': text_normalize(m.get('address', '')),
        'bldg': text_normalize(m.get('building', '')),
        'lat': m.get('lat'),
        'lng': m.get('lng'),
        'y': m.get('year', 0),
        'cat': text_normalize(m.get('category', 'shine')),
        'ig': text_normalize(m.get('instagram', '')),
        'bio': text_normalize((m.get('artistBio', '') or '').strip()),
        'desc': text_normalize((m.get('searchMuralDescription', '') or '').strip()),
        'imp': [text_normalize(s) for s in (m.get('impressions') or []) if s],
        'img': text_normalize(m.get('img', '')),
        'from': text_normalize(m.get('basedIn', '')),
        'aud': text_normalize(m.get('audio', '') or ''),
        'insp': text_normalize((m.get('muralInspiration', '') or '').strip()),
        'maw': text_normalize((m.get('muralAwards', '') or '').strip()),
        'aaw': text_normalize((m.get('artistAwards', '') or '').strip()),
    }
    raw_gal = m.get('furtherWork') or []
    gal = [{'name': text_normalize(g.get('name', '')), 'url': text_normalize(g.get('url', ''))}
           for g in raw_gal if g]
    d['fw'] = gal if gal else None
    original_img = text_normalize(m.get('originalImg', '') or '')
    if original_img:
        d['oimg'] = original_img
    search_bio = text_normalize((m.get('searchBio', '') or '').strip())
    if search_bio:
        d['sbio'] = search_bio
    if m.get('gone'):
        d['gone'] = True
        if m.get('goneDate'):
            d['goneDate'] = text_normalize(m.get('goneDate', ''))
        if m.get('goneReason'):
            d['goneReason'] = text_normalize(m.get('goneReason', ''))
    if m.get('underConstruction'):                                       # SHINE 2026
        d['uc'] = True
    ph = [{'u': text_normalize(p.get('url', '')), 'd': text_normalize(p.get('dateTaken', ''))}
          for p in (m.get('photos') or []) if p and p.get('url')]        # SHINE 2026 build-viewer
    if ph:
        d['ph'] = ph
    fn = [text_normalize(n) for n in (m.get('fieldNotes') or []) if n]
    if fn:
        d['fn'] = fn
    atw = [text_normalize(n) for n in (m.get('alongTheWay') or []) if n]
    if atw:
        d['atw'] = atw
    sn = m.get('sourceNotes')
    if sn:
        if isinstance(sn, str):
            sn = [sn]
        urls = [u.strip() for u in sn
                if isinstance(u, str) and u.strip().startswith(('http://', 'https://'))]
        if urls:
            d['src'] = [text_normalize(u) for u in urls]
    return d


def poi_to_dict(p):
    """Mirror of poi_to_js as a dict."""
    return {
        'id': p.get('id', 0),
        'name': text_normalize(p.get('name', '')),
        'type': text_normalize(p.get('type', '')),
        'lat': p.get('lat'),
        'lng': p.get('lng'),
        'addr': text_normalize(p.get('address', '')),
        'bldg': text_normalize(p.get('building', '')),
        'web': text_normalize(p.get('website', '')),
        'ig': text_normalize(p.get('instagram', '')),
        'hrs': text_normalize(p.get('hours', '')),
        'headline': text_normalize((p.get('headline', '') or '').strip()),
        'img': text_normalize((p.get('image', '') or '').strip()),
        'desc': text_normalize((p.get('description', '') or '').strip()),
        'lm': [int(x) for x in (p.get('linkedMurals') or [])],
    }


def build_content_manifest(murals, config, pois=None):
    """Build the OTA content manifest dict + its deterministic content hash.
    version = epoch-ms (monotonic, for the client's 'is remote newer' check);
    hash = sha256 of the content only (excludes timestamp, so identical content
    dedupes across builds)."""
    pois = pois or []
    sorted_murals = sorted(murals, key=lambda m: (-m.get('year', 0), (m.get('artist', '') or '').lower()))
    sorted_pois = sorted(pois, key=lambda p: p.get('id', 0))
    mural_dicts = [mural_to_dict(m) for m in sorted_murals]
    poi_dicts = [poi_to_dict(p) for p in sorted_pois]
    years = list(config.get('YEARS', []))

    content_core = {'schemaVersion': 1, 'murals': mural_dicts, 'pois': poi_dicts, 'YEARS': years}
    canonical = json.dumps(content_core, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    content_hash = hashlib.sha256(canonical.encode('utf-8')).hexdigest()[:12]

    now = datetime.now(timezone.utc)
    manifest = {
        'schemaVersion': 1,
        'generated': now.isoformat(),
        'version': int(now.timestamp() * 1000),
        'hash': content_hash,
        'counts': {'murals': len(mural_dicts), 'pois': len(poi_dicts)},
        'YEARS': years,
        'murals': mural_dicts,
        'pois': poi_dicts,
    }
    return manifest


def write_content_artifacts(manifest):
    """Write js/content.json (OTA manifest / CDN upload target) and
    js/content-meta.js (tiny, importable bundled-version marker for the client)."""
    with open(CONTENT_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')
    meta = (
        '// GENERATED by build-data.py — bundled content baseline for js/content.js.\n'
        '// version = epoch-ms of this build; the client applies remote content only if newer.\n'
        'export const BUNDLED_CONTENT = '
        + json.dumps({'version': manifest['version'], 'hash': manifest['hash'],
                      'generated': manifest['generated']})
        + ';\n'
    )
    with open(CONTENT_META_FILE, 'w', encoding='utf-8') as f:
        f.write(meta)


def write_audio_manifest(murals):
    """Write audio-manifest.json — the sorted, de-duped list of narration clip
    URLs (each mural's `audio:` field). The service worker precaches these on
    install so tours play offline. Returns the count written."""
    urls = sorted({(m.get('audio') or '').strip() for m in murals} - {''})
    with open(AUDIO_MANIFEST_FILE, 'w', encoding='utf-8') as f:
        json.dump(urls, f, ensure_ascii=False, indent=0)
        f.write('\n')
    return len(urls)


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

    # Load POIs (optional — may not exist yet)
    pois = load_pois()
    if pois:
        print(f"Loaded {len(pois)} POIs from {POI_DIR}")

    # Generate
    output = generate_data_js(murals, config, pois)

    if dry_run:
        print(f"\n✓ Validation passed. {len(murals)} murals ready to build.")
        print(f"  (--dry-run: {OUTPUT_FILE} not written)")
    else:
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            f.write(output)
        print(f"\n✓ Generated {OUTPUT_FILE} with {len(murals)} murals")

        # v1.5: also emit the OTA content manifest + bundled-version marker
        manifest = build_content_manifest(murals, config, pois)
        write_content_artifacts(manifest)
        print(f"✓ Generated {CONTENT_JSON_FILE} (v{manifest['version']}, hash {manifest['hash']}, "
              f"{manifest['counts']['murals']} murals + {manifest['counts']['pois']} POIs)")

        n_audio = write_audio_manifest(murals)
        print(f"✓ Generated {AUDIO_MANIFEST_FILE} ({n_audio} narration clips to precache)")

    print_stats(murals)


if __name__ == '__main__':
    main()
