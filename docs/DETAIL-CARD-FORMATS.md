# Detail Card PDF Formats

The SHINE mural detail cards come in several PDF formats across different batches. The `extract-card.py` script handles all of them.

## Format 1: Original (DB #N)

Used in early batches. Header line contains artist name and database number.

```
Derek Donnelly (DB #5)
2025 • SHINE Mural Festival: Origins (2025)
Address: 1847 1st Ave N, St. Petersburg, FL
Building: None found
GPS: 27.772497, -82.658700
Instagram: @saintpaintarts
Mural Title: None found
Mural Awards: None found
Mural Inspiration: ...
Artist Awards: ...
DESCRIPTION
...
ARTIST BIO
...
```

## Format 2: Batch 03

Used in the third batch of catalog cards. Different header structure.

```
SHINE Catalog — Batch 03 — Card #116
#116 — Melanie Posner
Address: 421 4th Ave N, St. Petersburg, FL (Hollander Hotel pool area)
Building: Hollander Hotel
Instagram: @muralcerveza / @therealmelpoz
GPS: 27.776736, -82.638808
Context: New Belgium Brewing Company commercial commission
Description:
...
Artist Bio:
...
```

## Format 3: Card Bracket

Uses square brackets instead of parentheses for card numbers.

```
Reda3sb (Ricardo Delgado) [Card #125]
2019 • SHINE 2019 (Bright Spot)
Mural Title: Feelings
Address: ...
```

## Format 4: NEW #N

For newly cataloged murals not in the original database.

```
Michael Fatutoa (NEW #113)
2021 • SHINE Mural Festival (2021)
Address: 2060 1st Ave S, St. Petersburg, FL
...
```

## Format 5: Inline

Compact format where fields run together without clear line breaks. PyPDF2 extracts text as a continuous stream, so the parser uses field labels (Address:, GPS:, etc.) as delimiters.

## Source PDFs

The detail card PDFs are in `/tmp/mural-zips/`:
- `pt1/ALL-MURAL-DETAIL-CARDS Pt 1 No 1 to 7.pdf` (7 pages)
- `pt2/ALL-MURAL-DETAIL-CARDs Pt 2 Pages 8 to 16.pdf` (8 pages)
- `pt3/ALL-MURAL-DETAIL-CARDS2 Pt 3 17 to 24.pdf` (8 pages)

Total: 23 detail cards across 3 PDFs.
