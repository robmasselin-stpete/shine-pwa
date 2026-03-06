#!/usr/bin/env python3
"""
generate-pdf.py — Mural catalog PDF generator

Creates a print-ready PDF catalog from all YAML mural files. One page per mural
with photo, metadata, bio, provenance, and source URLs. Useful for offline
reference, reviews, and handoffs.

Requires: pip3 install reportlab pyyaml

Usage:
    python3 scripts/generate-pdf.py

Output: mural-catalog.pdf in project root (gitignored)
"""

import glob
import os
import sys
import time
import yaml
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak, Table, TableStyle,
    HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from xml.sax.saxutils import escape

MURALS_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'murals')
PROJECT_ROOT = os.path.join(os.path.dirname(__file__), '..')
OUTPUT_PDF = os.path.join(PROJECT_ROOT, 'mural-catalog.pdf')

# Page dimensions
PAGE_W, PAGE_H = letter  # 8.5 x 11 inches
MARGIN = 0.5 * inch
CONTENT_W = PAGE_W - 2 * MARGIN

# Colors
HEADER_BG = HexColor('#1a1a2e')
ACCENT = HexColor('#e94560')
LIGHT_GRAY = HexColor('#f0f0f0')
DARK_TEXT = HexColor('#222222')
MED_TEXT = HexColor('#555555')
LIGHT_TEXT = HexColor('#888888')
SOURCE_COLOR = HexColor('#336699')


def build_styles():
    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        'MuralArtist', fontName='Helvetica-Bold', fontSize=16,
        textColor=HEADER_BG, leading=20, spaceAfter=1,
    ))
    styles.add(ParagraphStyle(
        'MuralYear', fontName='Helvetica', fontSize=11,
        textColor=ACCENT, leading=13, spaceAfter=4,
    ))
    styles.add(ParagraphStyle(
        'MuralMeta', fontName='Helvetica', fontSize=8,
        textColor=MED_TEXT, leading=10, spaceAfter=1,
    ))
    styles.add(ParagraphStyle(
        'MuralTitle', fontName='Helvetica-BoldOblique', fontSize=11,
        textColor=DARK_TEXT, leading=13, spaceAfter=4,
    ))
    styles.add(ParagraphStyle(
        'SectionHead', fontName='Helvetica-Bold', fontSize=8,
        textColor=ACCENT, leading=10, spaceBefore=4, spaceAfter=1,
    ))
    styles.add(ParagraphStyle(
        'MuralBody', fontName='Helvetica', fontSize=7.5,
        textColor=DARK_TEXT, leading=9.5, spaceAfter=2,
    ))
    styles.add(ParagraphStyle(
        'SourceUrl', fontName='Helvetica', fontSize=6.5,
        textColor=SOURCE_COLOR, leading=8, spaceAfter=1,
        leftIndent=10,
    ))
    styles.add(ParagraphStyle(
        'MuralFooter', fontName='Helvetica', fontSize=6.5,
        textColor=LIGHT_TEXT, leading=8, spaceAfter=1,
    ))
    styles.add(ParagraphStyle(
        'StatusTag', fontName='Helvetica-Bold', fontSize=7.5,
        textColor=HexColor('#ffffff'), leading=10,
    ))
    return styles


def load_murals():
    """Load all YAML files, sorted by ID."""
    files = sorted(glob.glob(os.path.join(MURALS_DIR, '[0-9]*.yaml')))
    murals = []
    for f in files:
        filepath = f
        with open(f) as fh:
            data = yaml.safe_load(fh)
            if data:
                data['_filename'] = os.path.basename(f)
                data['_filepath'] = filepath
                # Get file modification time as revision date
                mtime = os.path.getmtime(filepath)
                data['_modified'] = datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M')
                murals.append(data)
    murals.sort(key=lambda m: m.get('id', 999))
    return murals


def get_image_path(mural):
    """Resolve image path relative to project root."""
    img = mural.get('img', '')
    if not img:
        return None
    # Strip TODO comments
    if '#' in img:
        img = img.split('#')[0].strip().strip('"').strip("'")
    path = os.path.join(PROJECT_ROOT, img)
    if os.path.exists(path):
        return path
    return None


def esc(text):
    """Escape XML special characters for reportlab Paragraphs."""
    if not text:
        return ''
    return escape(str(text))


def build_mural_page(mural, styles):
    """Build flowable elements for one mural page."""
    elements = []

    source = mural.get('source', 'legacy')
    is_enhanced = source == 'claude-enhanced'

    # ── Header: Artist + ID badge ──
    artist = mural.get('artist', 'Unknown')
    elements.append(Paragraph(esc(artist), styles['MuralArtist']))

    # Year, category, status
    year = mural.get('year', '')
    category = mural.get('category', '')
    status = "ENHANCED" if is_enhanced else "LEGACY"
    status_color = "#2ecc71" if is_enhanced else "#e67e22"
    elements.append(Paragraph(
        f"{year}  ·  {category.upper()}  ·  "
        f"<font color='{status_color}'><b>{status}</b></font>  ·  "
        f"ID #{mural.get('id', '?')}",
        styles['MuralYear']
    ))

    # Title
    title = mural.get('title', '')
    if title:
        elements.append(Paragraph(f'"{esc(title)}"', styles['MuralTitle']))

    # ── Photo ──
    img_path = get_image_path(mural)
    img_field = mural.get('img', '')
    needs_photo = 'needs-photo' in img_field or 'TODO' in img_field
    mural_gone = 'GONE' in img_field

    if img_path and not needs_photo:
        try:
            img = Image(img_path)
            iw, ih = img.imageWidth, img.imageHeight
            if iw > 0 and ih > 0:
                aspect = ih / iw
                display_w = min(CONTENT_W, 5 * inch)
                display_h = display_w * aspect
                max_h = 2.5 * inch
                if display_h > max_h:
                    display_h = max_h
                    display_w = display_h / aspect
                img.drawWidth = display_w
                img.drawHeight = display_h
                elements.append(img)
                elements.append(Spacer(1, 4))
        except Exception:
            pass
    elif needs_photo:
        elements.append(Paragraph(
            "<font color='#e67e22'><b>[NEEDS PHOTO]</b></font>",
            styles['MuralMeta']
        ))
    if mural_gone:
        elements.append(Paragraph(
            "<font color='#e74c3c'><b>[MURAL IS GONE]</b></font>",
            styles['MuralMeta']
        ))

    # ── All metadata fields ──
    elements.append(Paragraph("DETAILS", styles['SectionHead']))

    meta_fields = [
        ('Address', mural.get('address', '')),
        ('Building', mural.get('building', '')),
        ('GPS', f"{mural.get('lat', '')}, {mural.get('lng', '')}" if mural.get('lat') else ''),
        ('Based in', mural.get('basedIn', '')),
        ('Instagram', f"@{mural.get('instagram', '')}" if mural.get('instagram') else ''),
        ('Image file', mural.get('img', '')),
    ]
    for label, value in meta_fields:
        if value and value.strip():
            elements.append(Paragraph(
                f"<b>{label}:</b>  {esc(str(value))}",
                styles['MuralMeta']
            ))

    # ── Artist Bio ──
    bio = mural.get('artistBio', '').strip()
    if bio:
        elements.append(Paragraph("ARTIST BIO", styles['SectionHead']))
        elements.append(Paragraph(esc(bio).replace('\n', ' '), styles['MuralBody']))

    # ── Mural Description ──
    desc = mural.get('muralDescription', '').strip()
    if desc:
        elements.append(Paragraph("MURAL DESCRIPTION", styles['SectionHead']))
        elements.append(Paragraph(esc(desc).replace('\n', ' '), styles['MuralBody']))

    # ── Mural Inspiration ──
    insp = mural.get('muralInspiration', '').strip()
    if insp:
        elements.append(Paragraph("MURAL INSPIRATION", styles['SectionHead']))
        elements.append(Paragraph(esc(insp).replace('\n', ' '), styles['MuralBody']))

    # ── Awards ──
    mural_awards = mural.get('muralAwards', '').strip()
    if mural_awards:
        elements.append(Paragraph("MURAL AWARDS", styles['SectionHead']))
        elements.append(Paragraph(esc(mural_awards), styles['MuralBody']))

    artist_awards = mural.get('artistAwards', '').strip()
    if artist_awards:
        elements.append(Paragraph("ARTIST AWARDS", styles['SectionHead']))
        elements.append(Paragraph(esc(artist_awards), styles['MuralBody']))

    # ── Provenance ──
    elements.append(Spacer(1, 4))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=LIGHT_GRAY))
    elements.append(Paragraph("PROVENANCE", styles['SectionHead']))

    elements.append(Paragraph(
        f"<b>Source:</b>  {esc(source)}",
        styles['MuralMeta']
    ))

    # Source notes / URLs
    source_notes = mural.get('sourceNotes', '')
    if source_notes:
        if isinstance(source_notes, list):
            for note in source_notes:
                elements.append(Paragraph(f"· {esc(str(note))}", styles['SourceUrl']))
        else:
            elements.append(Paragraph(f"  {esc(str(source_notes))}", styles['SourceUrl']))

    # File info
    elements.append(Spacer(1, 4))
    elements.append(Paragraph(
        f"<b>File:</b>  {mural.get('_filename', '')}  ·  "
        f"<b>Last modified:</b>  {mural.get('_modified', '')}",
        styles['MuralFooter']
    ))

    # Page break
    elements.append(PageBreak())

    return elements


def main():
    murals = load_murals()
    print(f"Loaded {len(murals)} murals")

    styles = build_styles()
    now = datetime.now().strftime('%Y-%m-%d %H:%M')

    doc = SimpleDocTemplate(
        OUTPUT_PDF,
        pagesize=letter,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
    )

    elements = []

    # ── Title page ──
    elements.append(Spacer(1, 1.5 * inch))
    elements.append(Paragraph(
        "SHINE Mural Festival",
        ParagraphStyle('CoverTitle', fontName='Helvetica-Bold', fontSize=32,
                       textColor=HEADER_BG, alignment=TA_CENTER, leading=38)
    ))
    elements.append(Spacer(1, 8))
    elements.append(Paragraph(
        "St. Petersburg, Florida",
        ParagraphStyle('CoverSub', fontName='Helvetica', fontSize=16,
                       textColor=MED_TEXT, alignment=TA_CENTER, leading=20)
    ))
    elements.append(Spacer(1, 4))
    elements.append(Paragraph(
        "Mural Data Catalog — Complete Reference",
        ParagraphStyle('CoverSub2', fontName='Helvetica', fontSize=13,
                       textColor=ACCENT, alignment=TA_CENTER, leading=17)
    ))
    elements.append(Spacer(1, 24))

    # Stats
    enhanced = sum(1 for m in murals if m.get('source') == 'claude-enhanced')
    legacy = sum(1 for m in murals if m.get('source') == 'legacy')
    years = sorted(set(m.get('year', 0) for m in murals), reverse=True)
    year_str = ', '.join(str(y) for y in years if y)

    elements.append(Paragraph(
        f"<b>{len(murals)}</b> murals  ·  "
        f"<font color='#2ecc71'><b>{enhanced}</b> enhanced</font>  ·  "
        f"<font color='#e67e22'><b>{legacy}</b> legacy</font>",
        ParagraphStyle('CoverStats', fontName='Helvetica', fontSize=11,
                       textColor=MED_TEXT, alignment=TA_CENTER, leading=14)
    ))
    elements.append(Spacer(1, 8))
    elements.append(Paragraph(
        f"Years: {year_str}",
        ParagraphStyle('CoverYears', fontName='Helvetica', fontSize=10,
                       textColor=MED_TEXT, alignment=TA_CENTER, leading=13)
    ))
    elements.append(Spacer(1, 24))
    elements.append(Paragraph(
        f"Generated: {now}",
        ParagraphStyle('CoverDate', fontName='Helvetica', fontSize=9,
                       textColor=LIGHT_TEXT, alignment=TA_CENTER, leading=12)
    ))
    elements.append(Spacer(1, 8))
    elements.append(Paragraph(
        "Includes: artist bio, mural description, GPS coordinates, image paths,<br/>"
        "Instagram handles, awards, provenance, source URLs, and file revision dates.",
        ParagraphStyle('CoverNote', fontName='Helvetica', fontSize=8,
                       textColor=LIGHT_TEXT, alignment=TA_CENTER, leading=11)
    ))

    elements.append(PageBreak())

    # ── Mural pages ──
    for mural in murals:
        elements.extend(build_mural_page(mural, styles))

    doc.build(elements)
    print(f"PDF generated: {OUTPUT_PDF}")
    print(f"  {len(murals)} mural pages + cover")
    print(f"  {enhanced} enhanced, {legacy} legacy")


if __name__ == '__main__':
    main()
