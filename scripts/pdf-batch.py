#!/usr/bin/env python3
"""One-off: generate PDF for a specific list of YAML files."""

import os
import sys

# Add project root so we can reuse generate-pdf machinery
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, SCRIPT_DIR)

import yaml
import glob
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch

# Reuse styles and page builder from generate-pdf
from importlib.machinery import SourceFileLoader
genpdf = SourceFileLoader('genpdf', os.path.join(SCRIPT_DIR, 'generate-pdf.py')).load_module()

MURALS_DIR = os.path.join(PROJECT_ROOT, 'data', 'murals')
OUTPUT_PDF = os.path.join(PROJECT_ROOT, 'batch-review.pdf')

# The 11 murals we just processed
BATCH_FILES = [
    '024-fintan-magee-2024.yaml',
    '030-quinn-cale-2024.yaml',
    '034-zulu-painter-2024.yaml',
    '064-jeff-williams-2022.yaml',
    '068-reginald-o-neal-2022.yaml',
    '075-bakpak-durden-2021.yaml',
    '078-emily-ding-2021.yaml',
    '082-jared-wright-2021.yaml',
    '086-leo-gomez-2021.yaml',
    '117-palehorse-2020.yaml',
    '118-unknown-bayfront-commercial.yaml',
    '119-matt-kress-commercial.yaml',
    '120-melanie-posner-2023.yaml',
]

def main():
    murals = []
    for fname in BATCH_FILES:
        path = os.path.join(MURALS_DIR, fname)
        with open(path) as f:
            data = yaml.safe_load(f)
            if data:
                data['_filename'] = fname
                data['_filepath'] = path
                mtime = os.path.getmtime(path)
                data['_modified'] = datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M')
                murals.append(data)

    murals.sort(key=lambda m: m.get('id', 999))
    print(f"Loaded {len(murals)} murals for batch review")

    styles = genpdf.build_styles()

    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_CENTER

    doc = SimpleDocTemplate(
        OUTPUT_PDF, pagesize=letter,
        leftMargin=0.5*inch, rightMargin=0.5*inch,
        topMargin=0.5*inch, bottomMargin=0.5*inch,
    )

    elements = []
    elements.append(Spacer(1, 1*inch))
    elements.append(Paragraph(
        "Batch Review — 13 Murals (Round 2 + Commercials)",
        ParagraphStyle('Title', fontName='Helvetica-Bold', fontSize=24,
                       alignment=TA_CENTER, leading=28)
    ))
    elements.append(Spacer(1, 12))
    elements.append(Paragraph(
        f"Generated {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        ParagraphStyle('Sub', fontName='Helvetica', fontSize=10,
                       alignment=TA_CENTER, textColor=genpdf.LIGHT_TEXT)
    ))
    elements.append(PageBreak())

    for mural in murals:
        elements.extend(genpdf.build_mural_page(mural, styles))

    doc.build(elements)
    print(f"PDF: {OUTPUT_PDF}")

if __name__ == '__main__':
    main()
