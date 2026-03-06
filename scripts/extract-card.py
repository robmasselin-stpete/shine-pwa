#!/usr/bin/env python3
"""
extract-card.py — Detail card PDF → YAML extraction helper

Parses SHINE mural detail card PDFs (multiple formats) and generates
pre-filled YAML files. GPS, category, and image fields may need manual
review. Auto-assigns the next available ID.

Formats supported:
  1. Original (Pt1): "Artist Name (DB #N)Year • Festival..."
  2. Batch 03 header: "SHINE Catalog — Batch 03 — Card #N"
  3. Card bracket: "Artist Name [Card #N]Year • Festival..."
  4. Inline DB: "Artist (DB #N)Year • ..."  (variant of format 1)
  5. New numbered: "Artist Name (NEW #N)Year • ..."

Usage:
    python3 scripts/extract-card.py path/to/card.pdf           # single page PDF
    python3 scripts/extract-card.py path/to/multi.pdf --all    # all pages
    python3 scripts/extract-card.py path/to/multi.pdf --page 3 # specific page
"""

import os
import re
import sys
import glob
import unicodedata

try:
    import PyPDF2
except ImportError:
    print("ERROR: PyPDF2 required. Run: pip3 install PyPDF2")
    sys.exit(1)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
MURALS_DIR = os.path.join(PROJECT_ROOT, 'data', 'murals')


def slugify(text):
    """Convert text to filename slug."""
    text = unicodedata.normalize('NFKD', text)
    text = text.encode('ascii', 'ignore').decode('ascii')
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '-', text)
    text = text.strip('-')
    return text


def next_available_id():
    """Scan existing YAML files and return next available ID."""
    pattern = os.path.join(MURALS_DIR, '*.yaml')
    max_id = 0
    for filepath in glob.glob(pattern):
        basename = os.path.basename(filepath)
        match = re.match(r'(\d+)-', basename)
        if match:
            max_id = max(max_id, int(match.group(1)))
    return max_id + 1


def extract_field(text, label):
    """Extract a field value that follows a label like 'Address:' or 'Instagram:'."""
    # Try to find the label followed by content up to the next label or newline
    pattern = rf'{label}:\s*(.+?)(?=(?:[A-Z][a-z]+\s*:|$))'
    match = re.search(pattern, text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return ''


def parse_gps(text):
    """Extract GPS coordinates from text."""
    # Pattern: GPS: lat, lng  or  GPS: lat,lng
    match = re.search(r'GPS:\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)', text)
    if match:
        return float(match.group(1)), float(match.group(2))
    return None, None


def parse_instagram(text):
    """Extract Instagram handle."""
    match = re.search(r'Instagram:\s*@?(\S+)', text)
    if match:
        handle = match.group(1).strip(',').strip()
        # Handle multiple handles separated by /
        return handle
    return ''


def parse_format_original(text):
    """
    Parse the most common detail card format(s).
    Handles three header variants:
      - Format 1: "Artist Name (DB #N)Year • Festival..."
      - Format 3: "Artist Name [Card #N]Year • Festival..."
      - Format 5: "Artist Name (NEW #N)Year • Festival..."
    Then extracts labeled fields (Address:, Building:, GPS:, etc.) and
    bio/description sections delimited by uppercase headers.
    """
    data = {}

    # Extract artist name and DB/NEW number
    header_match = re.match(
        r'(.+?)\s*\((?:DB|NEW)\s*#(\d+)\)\s*(\d{4})?\s*[•·]?\s*(.*?)(?=Address:|$)',
        text, re.DOTALL
    )
    if not header_match:
        # Try Card bracket format: "Artist Name [Card #N]"
        header_match = re.match(
            r'(.+?)\s*\[Card\s*#(\d+)\]\s*(\d{4})?\s*[•·]?\s*(.*?)(?=Address:|Mural Title:|$)',
            text, re.DOTALL
        )

    if header_match:
        data['artist'] = header_match.group(1).strip()
        data['dbId'] = f"DB #{header_match.group(2)}"
        year_str = header_match.group(3)
        data['year'] = int(year_str) if year_str else 0
        festival = header_match.group(4).strip() if header_match.group(4) else ''
        data['festival'] = festival
    else:
        data['artist'] = 'UNKNOWN'
        data['year'] = 0

    # Extract fields
    data['address'] = extract_field(text, 'Address') or ''
    data['building'] = extract_field(text, 'Building') or ''

    lat, lng = parse_gps(text)
    data['lat'] = lat
    data['lng'] = lng

    data['instagram'] = parse_instagram(text)

    # Mural title
    title_match = re.search(r'Mural Title:\s*(.+?)(?=Address:|Building:|GPS:|Instagram:|$)', text)
    if title_match:
        title = title_match.group(1).strip()
        if title.lower() not in ('none found', 'none', 'none listed', 'n/a'):
            data['title'] = title

    # Awards
    mural_awards = extract_field(text, 'Mural Awards')
    if mural_awards and 'none' not in mural_awards.lower():
        data['muralAwards'] = mural_awards

    artist_awards = extract_field(text, 'Artist Awards')
    if not artist_awards:
        artist_awards = extract_field(text, r'Awards \(artist\)')
    if artist_awards and 'none' not in artist_awards.lower():
        data['artistAwards'] = artist_awards

    # Inspiration
    insp_match = re.search(r'(?:Mural )?Inspiration:\s*(.+?)(?=DESCRIPTION|ARTIST BIO|$)', text, re.DOTALL | re.IGNORECASE)
    if insp_match:
        insp = insp_match.group(1).strip()
        if 'none' not in insp.lower()[:10]:
            data['muralInspiration'] = insp

    # Description
    desc_match = re.search(r'DESCRIPTION\s*(.+?)(?=ARTIST BIO|BIO|$)', text, re.DOTALL | re.IGNORECASE)
    if desc_match:
        data['muralDescription'] = desc_match.group(1).strip()

    # Bio
    bio_match = re.search(r'(?:ARTIST BIO|BIO)\s*(.+?)$', text, re.DOTALL | re.IGNORECASE)
    if bio_match:
        data['artistBio'] = bio_match.group(1).strip()

    return data


def parse_format_batch03(text):
    """
    Parse Batch 03 format cards. These have a different layout:
      Line 1: "SHINE Catalog — Batch 03 — Card #N"
      Line 2: "#N — Artist Name"
    Uses "Context:" instead of festival field, and "Description:"/"Artist Bio:"
    instead of uppercase section headers.
    """
    data = {}

    # Extract card number from header
    card_match = re.search(r'Card #(\d+)', text)
    if card_match:
        data['dbId'] = f"DB #{card_match.group(1)}"

    # Extract artist from "#N — Artist Name" line
    artist_match = re.search(r'#\d+\s*[—–-]\s*(.+?)(?=Address:|$)', text)
    if artist_match:
        data['artist'] = artist_match.group(1).strip()
    else:
        data['artist'] = 'UNKNOWN'

    data['year'] = 0  # Usually needs manual assignment for Batch 03

    # Extract fields
    data['address'] = extract_field(text, 'Address') or ''
    data['building'] = extract_field(text, 'Building') or ''

    lat, lng = parse_gps(text)
    data['lat'] = lat
    data['lng'] = lng

    data['instagram'] = parse_instagram(text)

    # Context field (Batch 03 uses "Context:" instead of festival)
    context = extract_field(text, 'Context')
    if context:
        data['festival'] = context

    # Description
    desc_match = re.search(r'Description:\s*(.+?)(?=Artist Bio:|Bio:|$)', text, re.DOTALL | re.IGNORECASE)
    if desc_match:
        data['muralDescription'] = desc_match.group(1).strip()

    # Bio
    bio_match = re.search(r'(?:Artist Bio|Bio):\s*(.+?)$', text, re.DOTALL | re.IGNORECASE)
    if bio_match:
        data['artistBio'] = bio_match.group(1).strip()

    return data


def detect_format(text):
    """Detect which PDF format a page uses."""
    if text.startswith('SHINE Catalog'):
        return 'batch03'
    return 'original'


def parse_page(text):
    """Parse a single page of text, auto-detecting format."""
    fmt = detect_format(text)
    if fmt == 'batch03':
        return parse_format_batch03(text)
    else:
        return parse_format_original(text)


def yaml_scalar(value, key=None):
    """Format a value for YAML output.
    Long bio/description fields get literal block scalars (|).
    Strings with special chars get double-quoted.
    Numeric and null values pass through as-is."""
    if value is None:
        return 'null'
    if isinstance(value, (int, float)):
        return str(value)

    s = str(value).strip()

    if key in ('artistBio', 'muralDescription', 'muralInspiration', 'artistAwards', 'muralAwards') and len(s) > 60:
        lines = []
        for line in s.split('\n'):
            while len(line) > 78:
                break_at = line.rfind(' ', 0, 78)
                if break_at <= 0:
                    break_at = 78
                lines.append(line[:break_at])
                line = line[break_at:].lstrip()
            lines.append(line)
        block = '\n  '.join(lines)
        return f'|\n  {block}'

    if any(c in s for c in [':', '#', '{', '}', '[', ']', ',', '&', '*', '?', '|', '-', '<', '>', '=', '!', '%', '@', '`', '"', "'"]):
        s_esc = s.replace('\\', '\\\\').replace('"', '\\"')
        return f'"{s_esc}"'

    if s == '' or s in ('null', 'true', 'false'):
        return f'"{s}"'

    return s


def data_to_yaml(data, mural_id):
    """Convert extracted data dict to a complete YAML file string.
    Follows the same section layout as _template.yaml (Required/Optional/Provenance).
    Fields that need manual review are marked with TODO comments."""
    artist = data.get('artist', 'UNKNOWN')
    year = data.get('year', 0)

    lines = []
    lines.append(f'# {artist} — {year if year else "unknown year"}')
    lines.append(f'# Extracted from detail card PDF')
    lines.append(f'')
    lines.append(f'# ── Required ──')
    lines.append(f'id: {mural_id}')
    lines.append(f'artist: {yaml_scalar(artist)}')
    lines.append(f'year: {year}')
    lines.append(f'lat: {data.get("lat") or "null"}')
    lines.append(f'lng: {data.get("lng") or "null"}')
    lines.append(f'address: {yaml_scalar(data.get("address", ""))}')
    lines.append(f'category: "shine"              # TODO: verify — shine | shine-legacy | commercial')
    lines.append(f'img: ""                         # TODO: add image path')
    lines.append(f'')
    lines.append(f'# ── Optional ──')
    lines.append(f'title: {yaml_scalar(data.get("title", ""))}')
    lines.append(f'building: {yaml_scalar(data.get("building", ""))}')
    if data.get('festival'):
        lines.append(f'festival: {yaml_scalar(data["festival"])}')
    lines.append(f'instagram: {yaml_scalar(data.get("instagram", ""))}')
    if data.get('dbId'):
        lines.append(f'dbId: {yaml_scalar(data["dbId"])}')
    lines.append(f'basedIn: ""                     # TODO: fill in')
    lines.append(f'')
    lines.append(f'artistBio: {yaml_scalar(data.get("artistBio", ""), key="artistBio")}')
    lines.append(f'')
    lines.append(f'muralDescription: {yaml_scalar(data.get("muralDescription", ""), key="muralDescription")}')
    if data.get('muralInspiration'):
        lines.append(f'muralInspiration: {yaml_scalar(data["muralInspiration"], key="muralInspiration")}')
    else:
        lines.append(f'muralInspiration: ""')
    if data.get('muralAwards'):
        lines.append(f'muralAwards: {yaml_scalar(data["muralAwards"], key="muralAwards")}')
    else:
        lines.append(f'muralAwards: ""')
    if data.get('artistAwards'):
        lines.append(f'artistAwards: {yaml_scalar(data["artistAwards"], key="artistAwards")}')
    else:
        lines.append(f'artistAwards: ""')
    lines.append(f'')
    lines.append(f'# ── Provenance (not exported to data.js) ──')
    lines.append(f'source: "detail-card"')
    lines.append(f'sourceNotes: "Extracted from PDF by extract-card.py"')

    return '\n'.join(lines) + '\n'


def process_pdf(pdf_path, page_num=None, process_all=False):
    """Process a PDF file and generate YAML files."""
    reader = PyPDF2.PdfReader(pdf_path)
    total_pages = len(reader.pages)

    if page_num is not None:
        pages = [page_num - 1]  # convert to 0-indexed
    elif process_all:
        pages = range(total_pages)
    else:
        if total_pages == 1:
            pages = [0]
        else:
            print(f"PDF has {total_pages} pages. Use --all for all pages or --page N for a specific page.")
            for i in range(total_pages):
                text = reader.pages[i].extract_text()
                first_line = (text or '').split('\n')[0][:60]
                print(f"  Page {i+1}: {first_line}")
            return

    os.makedirs(MURALS_DIR, exist_ok=True)
    next_id = next_available_id()

    for page_idx in pages:
        if page_idx >= total_pages:
            print(f"WARNING: Page {page_idx + 1} does not exist (PDF has {total_pages} pages)")
            continue

        text = reader.pages[page_idx].extract_text()
        if not text or len(text.strip()) < 20:
            print(f"  Page {page_idx + 1}: (empty/too short, skipping)")
            continue

        data = parse_page(text)
        artist = data.get('artist', 'unknown')
        year = data.get('year', 0)

        mural_id = next_id
        next_id += 1

        slug = slugify(artist)
        year_str = str(year) if year else 'unknown'
        filename = f'{mural_id:03d}-{slug}-{year_str}.yaml'
        filepath = os.path.join(MURALS_DIR, filename)

        yaml_content = data_to_yaml(data, mural_id)

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(yaml_content)

        print(f"  Page {page_idx + 1}: {artist} → {filename}")

    print(f"\nFiles written to {MURALS_DIR}")
    print("Review each file and fill in TODO fields before building.")


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/extract-card.py <pdf-path> [--all | --page N]")
        sys.exit(1)

    pdf_path = sys.argv[1]
    if not os.path.exists(pdf_path):
        print(f"ERROR: File not found: {pdf_path}")
        sys.exit(1)

    page_num = None
    process_all = False

    if '--all' in sys.argv:
        process_all = True
    elif '--page' in sys.argv:
        idx = sys.argv.index('--page')
        if idx + 1 < len(sys.argv):
            page_num = int(sys.argv[idx + 1])

    process_pdf(pdf_path, page_num=page_num, process_all=process_all)


if __name__ == '__main__':
    main()
