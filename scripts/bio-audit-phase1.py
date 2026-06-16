#!/usr/bin/env python3
"""
bio-audit-phase1.py — Mechanical bio verification (no LLM).

For each mural YAML:
  1. Pull artistBio + searchBio + sourceNotes (URLs).
  2. Fetch each URL once, strip HTML, cache normalized text to disk.
  3. Extract "claim atoms" from the bios via regex (years, schools, degrees,
     awards, birthplaces, named risk phrases).
  4. For each atom, substring-search the union of that artist's source corpus.
     Atoms not found are flagged.
  5. For unsupported atoms, also check if they appear in OTHER artists'
     corpora (cross-contamination signal — the Bryson/Barenis failure mode).

Usage:
  python3 scripts/bio-audit-phase1.py                  # all murals
  python3 scripts/bio-audit-phase1.py --year 2025      # only year=2025
  python3 scripts/bio-audit-phase1.py --refetch        # ignore cache
"""
import argparse
import hashlib
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import date
from html.parser import HTMLParser
from pathlib import Path

import yaml

BASE = Path(__file__).resolve().parent.parent
YAML_DIR = BASE / 'data' / 'murals'
CACHE_DIR = BASE / 'data' / 'source-cache'
REPORT_DIR = BASE / 'docs'

CACHE_DIR.mkdir(parents=True, exist_ok=True)
REPORT_DIR.mkdir(parents=True, exist_ok=True)


# ── HTML → text ─────────────────────────────────────────────────────────────

class TextExtractor(HTMLParser):
    SKIP = {'script', 'style', 'noscript', 'svg'}
    BREAK = {'p', 'br', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'tr', 'td'}

    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in self.SKIP:
            self.skip = max(0, self.skip - 1)
        elif tag in self.BREAK:
            self.parts.append('\n')

    def handle_data(self, data):
        if self.skip == 0:
            self.parts.append(data)

    def text(self):
        return ''.join(self.parts)


def html_to_text(html):
    p = TextExtractor()
    try:
        p.feed(html)
    except Exception:
        pass
    return p.text()


# ── Normalization ───────────────────────────────────────────────────────────

SMART_QUOTES = {'“': '"', '”': '"', '‘': "'", '’': "'",
                '—': '-', '–': '-', '…': '...'}

def normalize(s):
    if not s:
        return ''
    s = unicodedata.normalize('NFKD', s)
    for k, v in SMART_QUOTES.items():
        s = s.replace(k, v)
    s = s.lower()
    s = re.sub(r'\s+', ' ', s)
    return s.strip()


# ── Fetch + cache ───────────────────────────────────────────────────────────

UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
      'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36')

def cache_path(url):
    h = hashlib.sha1(url.encode()).hexdigest()
    return CACHE_DIR / f"{h}.txt"


def fetch(url, timeout=20):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read()
        ct = r.headers.get('Content-Type', '')
        enc = 'utf-8'
        if 'charset=' in ct:
            enc = ct.split('charset=')[-1].split(';')[0].strip() or 'utf-8'
        try:
            return body.decode(enc, errors='replace')
        except LookupError:
            return body.decode('utf-8', errors='replace')


def load_or_fetch(url, refetch=False):
    cp = cache_path(url)
    if cp.exists() and not refetch:
        return cp.read_text(encoding='utf-8')
    try:
        print(f"  fetch {url[:90]}", flush=True)
        html = fetch(url)
        text = html_to_text(html)
        cp.write_text(text, encoding='utf-8')
        time.sleep(0.4)
        return text
    except Exception as e:
        msg = f"__FETCH_ERROR__ {type(e).__name__}: {e}"
        print(f"  ERR {url[:90]} → {e}", flush=True)
        cp.write_text(msg, encoding='utf-8')
        return ''


# ── Atom extraction ─────────────────────────────────────────────────────────

YEAR_RE = re.compile(r'\b(19[5-9]\d|20[0-3]\d)\b')

# "X University", "X College", "X Institute", "X Academy", "X School", "X Center"
INSTITUTION_RE = re.compile(
    r'\b((?:[A-Z][A-Za-z\.\-\']+\s+){1,5}'
    r'(?:University|College|Institute|Academy|School|Center|Centre|Conservatory))\b'
)

# "School of X", "Institute for X", etc.
SCHOOL_OF_RE = re.compile(
    r'\b((?:School|Institute|Academy|College|Conservatory|Center|Centre)'
    r'\s+(?:of|for)\s+(?:[A-Z][A-Za-z\.\-\']+\s*){1,5})'
)

# Degrees
DEGREE_RE = re.compile(r'\b(BFA|MFA|BA|BS|BSc|MA|MSc|MS|PhD|Ph\.D\.|MD|JD|EdD)\b')
DEGREE_PHRASE_RE = re.compile(
    r'\b(Bachelor|Master|Doctor)\s+of\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})\b'
)

# Awards/grants/fellowships — preceding 1-5 capitalized words
AWARD_RE = re.compile(
    r'\b((?:[A-Z][A-Za-z\.\-\']+\s+){1,5}'
    r'(?:Grant|Award|Fellowship|Prize|Residency|Scholarship|Medal|Honor))\b'
)

# Birthplace / origin
BIRTHPLACE_RE = re.compile(
    r'\b(?:born|raised|grew\s+up|hails\s+from|from)\s+in\s+'
    r'([A-Z][A-Za-z\.\-\']+(?:\s+[A-Z][A-Za-z\.\-\']+){0,3})'
)

# High-risk single phrases — common LLM hallucination patterns
RISK_PHRASES = [
    'medical illustration', 'medical school', 'law school',
    'engineering degree', 'doctorate', 'pre-med', 'pre med',
    'military service', 'graphic design degree', 'self-taught',
    'art history', 'fine arts', 'commercial illustration',
]

# Stop atoms — too generic to flag
STOP_ATOMS = {
    'art center', 'arts center', 'arts centre', 'community college',
    'fine arts', 'high school', 'middle school', 'art school',
    'public school', 'graduate school', 'private school',
    'university of', 'college of', 'school of',
    'bachelor of arts', 'master of arts', 'master of fine',
    'bachelor of fine',
}


def _clean_atom(s):
    """Strip newlines and trailing junk words from an extracted atom."""
    s = re.sub(r'\s+', ' ', s).strip()
    # Drop trailing bare pronouns/conjunctions the regex sometimes grabs
    s = re.sub(r'\s+(He|She|It|They|And|But|Then|Where|When|The)$', '', s)
    s = s.rstrip('.,;:')
    return s


def extract_atoms(bio):
    """Return [(type, raw_text, normalized)] tuples. Bare years are intentionally
    excluded — too noisy across many sources. Year-bearing phrases get caught
    by other extractors (awards, birthplaces, etc.)."""
    atoms = []
    for m in INSTITUTION_RE.finditer(bio):
        atoms.append(('institution', _clean_atom(m.group(1))))
    for m in SCHOOL_OF_RE.finditer(bio):
        atoms.append(('school-of', _clean_atom(m.group(1))))
    for m in DEGREE_RE.finditer(bio):
        atoms.append(('degree', m.group(0)))
    for m in DEGREE_PHRASE_RE.finditer(bio):
        atoms.append(('degree-phrase', _clean_atom(m.group(0))))
    for m in AWARD_RE.finditer(bio):
        atoms.append(('award', _clean_atom(m.group(1))))
    for m in BIRTHPLACE_RE.finditer(bio):
        atoms.append(('birthplace', _clean_atom(m.group(1))))
    bio_l = bio.lower()
    for phrase in RISK_PHRASES:
        if phrase in bio_l:
            atoms.append(('risk', phrase))
    seen, out = set(), []
    for t, a in atoms:
        n = normalize(a)
        if n in STOP_ATOMS or len(n) < 4:
            continue
        key = (t, n)
        if key in seen:
            continue
        seen.add(key)
        out.append((t, a, n))
    return out


# ── Membership check ────────────────────────────────────────────────────────

def supports(needle, corpus):
    """Substring match with a fallback: all tokens of needle present within
    a 200-char window of the corpus."""
    if not needle or not corpus:
        return False
    if needle in corpus:
        return True
    tokens = [t for t in re.findall(r"[a-z0-9]+", needle) if len(t) > 2]
    if not tokens:
        return False
    # Windowed all-tokens-present check
    pos = 0
    first = tokens[0]
    while True:
        i = corpus.find(first, pos)
        if i < 0:
            return False
        window = corpus[max(0, i - 100): i + 200]
        if all(t in window for t in tokens):
            return True
        pos = i + len(first)


# ── Main ────────────────────────────────────────────────────────────────────

def _norm_sources(sn):
    """sourceNotes may be a list, a single string, or None. Return list of
    URL-looking entries only; non-URL notes (e.g. 'Photo by Rob...') are dropped."""
    if not sn:
        return []
    if isinstance(sn, str):
        sn = [sn]
    out = []
    for u in sn:
        if not isinstance(u, str):
            continue
        u = u.strip()
        if u.startswith(('http://', 'https://')):
            out.append(u)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--year', type=int, help='Filter to year (e.g., 2025)')
    ap.add_argument('--refetch', action='store_true')
    ap.add_argument('--limit', type=int, help='Process only first N artists')
    args = ap.parse_args()

    print("Loading YAMLs...")
    murals = []
    for f in sorted(YAML_DIR.glob('*.yaml')):
        try:
            data = yaml.safe_load(f.read_text(encoding='utf-8'))
        except Exception as e:
            print(f"  WARN parse {f.name}: {e}")
            continue
        if not isinstance(data, dict):
            continue
        if args.year and data.get('year') != args.year:
            continue
        murals.append({
            'file': f.name,
            'id': data.get('id'),
            'artist': (data.get('artist') or '').strip(),
            'year': data.get('year'),
            'artistBio': data.get('artistBio') or '',
            'searchBio': data.get('searchBio') or '',
            'sourceNotes': _norm_sources(data.get('sourceNotes')),
        })
    print(f"  {len(murals)} murals loaded"
          + (f" (filtered to year={args.year})" if args.year else ''))

    by_artist = defaultdict(list)
    for m in murals:
        if m['artist']:
            by_artist[m['artist']].append(m)
    print(f"  {len(by_artist)} unique artists")

    if args.limit:
        keep = list(by_artist.keys())[:args.limit]
        by_artist = {k: by_artist[k] for k in keep}
        print(f"  limited to {len(by_artist)}")

    # URL → artist set (contamination map)
    url_to_artists = defaultdict(set)
    all_urls = set()
    for artist, entries in by_artist.items():
        for m in entries:
            for u in m['sourceNotes']:
                all_urls.add(u)
                url_to_artists[u].add(artist)
    shared = {u: a for u, a in url_to_artists.items() if len(a) > 1}
    print(f"  {len(all_urls)} unique URLs ({len(shared)} shared across artists)")

    print("\nFetching/loading sources...")
    url_to_text = {}
    for url in sorted(all_urls):
        url_to_text[url] = normalize(load_or_fetch(url, refetch=args.refetch))

    # Per-artist URL list and corpus
    artist_urls = {a: list({u for m in es for u in m['sourceNotes']})
                   for a, es in by_artist.items()}
    artist_corpus = {a: ' '.join(url_to_text.get(u, '') for u in urls)
                     for a, urls in artist_urls.items()}

    print("\nAuditing...")
    summary = []
    sections = []

    for artist in sorted(by_artist.keys()):
        entries = by_artist[artist]
        bios = []
        for m in entries:
            if m['artistBio']:
                bios.append(m['artistBio'])
            if m['searchBio'] and m['searchBio'] != m['artistBio']:
                bios.append(m['searchBio'])
        bio_text = '\n\n'.join(dict.fromkeys(bios))
        atoms = extract_atoms(bio_text)
        corpus = artist_corpus.get(artist, '')
        urls = artist_urls.get(artist, [])

        unsupported = []
        shared_only = []
        for atype, atext, needle in atoms:
            if not corpus.strip():
                continue
            # Which of this artist's URLs support the atom?
            supporting = [u for u in urls if supports(needle, url_to_text.get(u, ''))]
            if not supporting:
                # Not supported by any of THIS artist's sources
                others = [a for a, c in artist_corpus.items()
                          if a != artist and supports(needle, c)]
                unsupported.append((atype, atext, others))
                continue
            # Supported, but only by shared multi-artist pages?
            if all(u in shared for u in supporting):
                co_artists = sorted({a for u in supporting for a in shared[u]
                                     if a != artist})
                shared_only.append((atype, atext, supporting, co_artists))

        ids = sorted(m['id'] for m in entries if m['id'] is not None)
        ids_str = ','.join(str(i) for i in ids)
        no_src = not corpus.strip()

        summary.append({
            'artist': artist, 'ids': ids_str, 'atoms': len(atoms),
            'unsupported': len(unsupported), 'shared_only': len(shared_only),
            'no_sources': no_src,
        })

        if not unsupported and not shared_only and not no_src:
            continue

        sec = [f"### {artist} (id: {ids_str})"]
        if no_src:
            sec.append("**No source text available** — cannot verify any claims.")
        sec.append(f"- Atoms: {len(atoms)} | Unsupported: {len(unsupported)}"
                   f" | Shared-only: {len(shared_only)}")
        if unsupported:
            sec.append("\n**Unsupported (not found in any of this artist's sources):**")
            for atype, atext, others in unsupported:
                line = f"  - **[{atype}]** `{atext}`"
                if others:
                    shown = ', '.join(others[:3])
                    more = f" (+{len(others)-3})" if len(others) > 3 else ''
                    line += f" ⚠️  also in sources for: {shown}{more}"
                sec.append(line)
        if shared_only:
            sec.append("\n**Shared-page only (supported only by multi-artist pages — verify it's about THIS artist):**")
            for atype, atext, supporting, co_artists in shared_only:
                co = ', '.join(co_artists[:3]) if co_artists else '?'
                more = f" (+{len(co_artists)-3})" if len(co_artists) > 3 else ''
                sec.append(f"  - **[{atype}]** `{atext}` — page also covers: {co}{more}")
        sec.append('')
        sections.append('\n'.join(sec))

    # Shared URL section
    shared_lines = []
    if shared:
        for url, artists in sorted(shared.items(), key=lambda x: -len(x[1])):
            shared_lines.append(f"- {len(artists)}× `{url}` — {', '.join(sorted(artists))}")
    else:
        shared_lines.append("(none)")

    # Summary table
    table = ["| Artist | IDs | Atoms | Unsupported | Shared-only | Status |",
             "|---|---|---|---|---|---|"]
    for r in sorted(summary, key=lambda r: (-r['unsupported'], -r['shared_only'], r['artist'])):
        if r['no_sources']:
            st = 'NO SOURCES'
        elif r['unsupported']:
            st = 'FAIL'
        elif r['shared_only']:
            st = 'REVIEW'
        else:
            st = 'PASS'
        table.append(f"| {r['artist']} | {r['ids']} | {r['atoms']}"
                     f" | {r['unsupported']} | {r['shared_only']} | {st} |")

    today = date.today().isoformat()
    suffix = f"-{args.year}" if args.year else ''
    out = REPORT_DIR / f"bio-audit-phase1{suffix}-{today}.md"
    with open(out, 'w') as f:
        f.write(f"# Bio Audit — Phase 1 (mechanical) — {today}\n\n")
        if args.year:
            f.write(f"**Filter:** year={args.year}\n\n")
        f.write(f"- Murals scanned: {len(murals)}\n")
        f.write(f"- Unique artists: {len(by_artist)}\n")
        f.write(f"- Unique source URLs: {len(all_urls)}\n")
        f.write(f"- URLs used by ≥2 artists: {len(shared)}\n")
        f.write(f"- Artists with unsupported atoms: "
                f"{sum(1 for r in summary if r['unsupported'])}\n")
        f.write(f"- Artists with no source text: "
                f"{sum(1 for r in summary if r['no_sources'])}\n\n")
        f.write("---\n\n## Flagged artists\n\n")
        f.write('\n'.join(sections) if sections else "_None._\n")
        f.write("\n## Shared source URLs (cross-contamination surface)\n\n")
        f.write('\n'.join(shared_lines))
        f.write("\n\n## Summary\n\n")
        f.write('\n'.join(table))
        f.write('\n')
    print(f"\nReport: {out}")


if __name__ == '__main__':
    main()
