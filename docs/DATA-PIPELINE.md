# Data Pipeline — Technical Reference

## Overview

The SHINE PWA data pipeline converts human-editable YAML files into the `js/data.js` module consumed by `app.js`. This replaces the previous workflow of directly editing JavaScript.

## Data Flow

```
data/murals/*.yaml          Individual mural records (source of truth)
data/config.yaml            Categories, year colors, aliases
        │
   build-data.py            Validates, sorts, compiles
        │
   js/data.js               ES module with murals array + config exports
        │
   app.js                   Imports and renders (unchanged)
```

## build-data.py Internals

### Validation Rules
1. **Required fields**: id, artist, year, lat, lng, address, category, img
2. **ID uniqueness**: No two YAML files may share the same `id`
3. **Category**: Must be one of the values in `config.yaml → CATEGORIES`
4. **GPS bounds**: lat/lng checked against Tampa Bay bounding box (warning, not error)
5. **Image exists**: `img` path checked relative to project root (warning, not error)

### Sort Order
Murals are sorted by year descending, then artist name alphabetically. This matches the original data.js ordering.

### Field Mapping (YAML → JS)
| YAML field | JS key | Notes |
|------------|--------|-------|
| id | id | |
| artist | a | |
| title | t | |
| address | loc | |
| building | bldg | |
| lat | lat | |
| lng | lng | |
| year | y | |
| instagram | ig | |
| artistBio + muralDescription | bio | Combined into single string |
| img | img | |
| basedIn | from | |

### Provenance Stripping
`source` and `sourceNotes` fields exist only in YAML. They are never written to data.js.

### Exit Codes
- `0`: Success (data.js written) or dry-run passed
- `1`: Validation errors (data.js NOT written)

## config.yaml

Contains app-wide configuration previously hardcoded in data.js:

- **CATEGORIES**: Valid category values for validation
- **YEARS**: Year pills shown in the UI filter
- **YEAR_COLORS**: Map marker color per year
- **ARTIST_ALIASES**: Spelling variant mappings for search
- **BOUNDS**: Tampa Bay bounding box for GPS validation

## extract-card.py Internals

### PDF Format Detection
The script auto-detects which format a page uses:

1. **Original format**: Starts with artist name, `(DB #N)` suffix
2. **Batch 03 format**: Starts with `SHINE Catalog — Batch 03 — Card #N`
3. **Card bracket format**: Uses `[Card #N]` instead of `(DB #N)`
4. **NEW format**: Uses `(NEW #N)` for newly added murals

### Field Extraction
Uses regex patterns to pull structured data from the continuous text that PyPDF2 extracts. Bio and description sections are identified by `ARTIST BIO` / `DESCRIPTION` / `Artist Bio:` / `Description:` headers.

### Auto-ID Assignment
Scans existing YAML files, finds the highest numeric prefix, and assigns the next number.

## migrate.py

One-time script that parsed the original `data.js` and generated individual YAML files. Kept for reference. All generated files are marked `source: "legacy"`.
