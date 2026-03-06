# Architecture

Technical reference for the SHINE PWA — frontend application and Python data pipeline.

## Overview

The app is a vanilla JS ES module (~690 lines) with no framework. It imports data from `data.js` and `photos.js`, manages state in a plain object, and renders HTML via template literals. All DOM updates are full re-renders of their respective sections.

```
index.html
  └── js/app.js (type="module")
        ├── js/data.js    → murals[], YEARS, YEAR_COLORS, CATEGORY_COLORS
        └── js/photos.js  → fieldPhotos[], ARTIST_ALIASES
```

## State Management

All app state lives in a single mutable object:

```js
const state = {
  tab: 'explore',         // active tab: 'explore' | 'map' | 'routes'
  searchQuery: '',        // current search input text
  exploreFilter: null,    // null | 'shine' | 'vintage' | 'commercial'
  exploreYear: null,      // null | specific year number (e.g. 2025)
  userLat: null,          // user's GPS latitude (from geolocation API)
  userLng: null,          // user's GPS longitude
  mapReady: false,        // true after Leaflet map is initialized
  selectedMural: null,    // currently open mural object (or null)
  activeMapTab: 'shine',  // map category filter: 'all' | 'shine' | 'vintage' | 'commercial'
  activeMapYears: null,   // null (all years) or [year] array for map filter
};
```

State changes trigger re-renders by directly calling the appropriate render function. There is no reactive system — each UI update is an explicit function call.

## Tab System

### Navigation

The bottom tab bar has three buttons (Explore, Map, Routes) defined in `index.html`. Click handlers call `switchTab(tab)`, which:

1. Updates `state.tab`
2. Toggles `.active` class on tab buttons
3. Shows/hides view containers via the `hidden` attribute
4. Shows/hides the search bar and filter pills (Explore-only)
5. Hides the detail page overlay
6. Calls the appropriate render function: `renderExplore()`, `initMap()`, or `renderRoutes()`

### View containers

```html
<div id="view-explore" class="view"></div>
<div id="view-map" class="view" hidden></div>
<div id="view-routes" class="view" hidden></div>
```

Only one view is visible at a time. The detail page is a separate fixed overlay that can appear on top of any tab.

## Explore View

### Filtering chain

`getFilteredMurals()` applies three filters in sequence:

1. **Category filter** (`state.exploreFilter`)
   - `null` → all murals
   - `'shine'` → non-commercial murals from SHINE_YEARS (2021-2025)
   - `'vintage'` → non-commercial murals from VINTAGE_YEARS (2015-2020) or year 0
   - `'commercial'` → murals with `cat === 'commercial'`

2. **Year sub-filter** (`state.exploreYear`)
   - Only active when a Shine or Vintage category is selected
   - Filters to a single year

3. **Search** (`state.searchQuery`)
   - Case-insensitive substring match across: artist (`a`), address (`loc`), title (`t`), building (`bldg`)

### Filter pills

Two rows of horizontally scrollable pill buttons:

- **Category pills** (`#filter-pills`): All, Shine, Vintage Shine, Commercial
- **Year sub-pills** (`#year-sub-pills`): Shown only for Shine/Vintage. Includes "All Years" + individual year buttons with color-coded dots matching `YEAR_COLORS`.

Year sub-pills only show years that have murals in the dataset.

### Card grid

`renderExplore()` outputs a 2-column CSS grid (`.mural-grid`) of `.mural-card` elements. Each card shows:
- Square thumbnail image (lazy-loaded, `aspect-ratio: 1`)
- Artist name
- Building or address + year

Cards are clickable and open the detail page via `openDetail(mural)`.

Empty state shown when no murals match the current filters.

## Map View

### Initialization

`initMap()` runs once (guarded by `state.mapReady`). Subsequent tab switches just call `leafletMap.invalidateSize()` to handle size recalculation.

Setup:
1. Renders filter bar HTML + map container div
2. Creates Leaflet map centered on `[27.7706, -82.6341]` (downtown St. Pete), zoom 14, no zoom control
3. Adds CARTO Voyager raster tile layer
4. Creates dual marker objects for every mural with GPS coordinates
5. Adds year legend overlay
6. Requests user geolocation

### Dual marker system

Each mural gets two Leaflet layer objects:

| Marker type | Visible when | Description |
|------------|-------------|-------------|
| `L.circleMarker` (dot) | Zoom < 15 | 7px radius, color from `YEAR_COLORS`, white border |
| `L.divIcon` (imgMarker) | Zoom >= 15 | 48x48px thumbnail with rounded corners and white border |

`swapMarkerStyle()` runs on every `zoomend` event, adding/removing the appropriate marker type for all visible murals.

### Category/year filtering

The map has its own filter pills (separate from Explore):
- Category pills: All, Shine, Vintage, Commercial
- Year sub-pills: shown for Shine/Vintage tabs

`updateMapMarkers()` runs on every filter change. It:
1. Determines which categories and years should be visible
2. Adds/removes each marker based on category + year match
3. Regenerates year sub-pills
4. Regenerates the legend from actually-visible year values

### Legend

A positioned `div.map-legend` in the top-right corner of the map container. Auto-generated from the unique years of currently visible markers, plus a "You" entry for the user location dot.

### User location

Uses `navigator.geolocation.getCurrentPosition()` with `enableHighAccuracy: true`. If granted, adds a blue `L.circleMarker` at the user's position with a "You are here" popup. Coordinates are stored in `state.userLat`/`state.userLng`.

## Routes View

### Route definitions

`ROUTE_DEFS` is a static array of route objects:

```js
{ id: 'shine-2025', name: 'SHINE 2025 Origins', desc: '...', filter: m => ... }
```

Each route defines a filter function that selects its murals from the full dataset. Current routes:
- **SHINE 2025 Origins** — year 2025, category shine
- **SHINE 2024** — year 2024, category shine
- **SHINE 2023** — year 2023, category shine
- **Downtown Highlights** — non-commercial murals within 2km of downtown center
- **All SHINE Murals** — every non-commercial mural

### Walk ordering

`getRouteMurals(filterFn)` orders murals using a nearest-neighbor heuristic:
1. Calculate the centroid (average lat/lng) of all matching murals
2. Start from the mural closest to the centroid
3. Greedily pick the nearest unvisited mural until all are visited

This produces a reasonable walking order without a full TSP solve.

### Route cards

`renderRoutes()` renders a list of `.route-card` elements showing:
- Thumbnail from the first mural
- Route name and description
- Stats: stop count, total walking distance, estimated minutes (~80 m/min)

### Route detail

`openRoute(def)` opens the detail page overlay with:
- Route name and stats header
- Numbered stop list with inter-stop walking distances
- Each stop shows thumbnail, artist name, and location
- Stops are clickable (opens mural detail)
- "Open Full Route in Google Maps" link at the bottom — builds a multi-waypoint Google Maps directions URL with walking mode

### Distance calculation

`haversine(lat1, lng1, lat2, lng2)` computes great-circle distance in meters. `formatDistance(meters)` converts to feet or miles (< 1000 ft shown as ft, otherwise mi).

`calcRouteTotalDist(orderedMurals)` sums haversine distances between consecutive stops.

## Detail Page

### Structure

The detail page (`#detail-page`) is a fixed full-screen overlay (`position: fixed; inset: 0; z-index: 9999`). It contains a back button and a scrollable content area.

### Content rendered by `openDetail(mural)`

1. **Hero image** — full-width, 4:3 aspect ratio
2. **Artist name** — Space Mono display font
3. **Title** — italic, shown if present
4. **Category badge** — "SHINE 2025", "Commercial", or "Pre-SHINE" with year
5. **Hometown** (`from` field) — shown if present
6. **Instagram link** — links to instagram.com/{handle}
7. **Address block** — building name + street address
8. **Artist bio** — "About the Artist" section, shown if `bio` field is non-empty
9. **Walking directions** — Google Maps link with walking mode, shown if GPS coordinates exist
10. **Field photos** — horizontal scroll of photos from `photos.js` matching `muralId`
11. **Nearby murals** — 6 closest murals by haversine distance, horizontal scroll of thumbnail cards
12. **More by artist** — other murals by the same artist, using `ARTIST_ALIASES` for name matching

### Artist alias lookup

`getArtistAliases(name)` checks `ARTIST_ALIASES` from `photos.js` for spelling variants (e.g., "Dream Weaver" / "Dreamweaver"). Returns all known names for cross-referencing.

### Deep linking

`handleDeepLink()` runs on page load. Checks for `?mural=ID` in the URL and opens the corresponding mural detail page. This allows sharing direct links to specific murals.

## photos.js

Exports two things:

### `fieldPhotos`
Array of objects mapping field photos to murals:
```js
{ src: 'IMG_0392.jpeg', muralId: 3, note: 'Sara Salem — in process at LMCU' }
```
- `src` is relative to `images/field/`
- `muralId` links to a mural record ID
- Photos with `muralId: null` are unmapped

### `ARTIST_ALIASES`
Object mapping canonical names to arrays of known spellings:
```js
{ 'Dreamweaver': ['Dream Weaver', 'Dreamweaver'] }
```
Used by the "more by artist" feature in the detail page.

## CSS Design System

All styles are in `css/app.css` (~920 lines). No CSS framework or preprocessor.

### Custom properties (design tokens)

```css
:root {
  --bg: #F5F0EB;           /* warm off-white background */
  --bg-card: #FFFFFF;       /* card surfaces */
  --text: #2C2016;          /* primary text (warm dark brown) */
  --text-muted: #7A6E62;   /* secondary text */
  --accent: #1E5B8A;        /* primary blue accent */
  --accent-light: #E8F0F6;  /* light accent for backgrounds */
  --border: #E0D8CF;        /* warm gray borders */
  --shadow: ...;            /* subtle elevation */
  --shadow-lg: ...;         /* pronounced elevation */
  --radius: 10px;           /* card border radius */
  --radius-sm: 6px;         /* small element radius */
  --font-display: 'Space Mono', monospace;
  --font-body: 'DM Sans', sans-serif;
  --tab-height: 56px;
  --header-height: 52px;
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}
```

### Layout model

- `#app` is a flex column filling `100dvh`
- Header is `position: sticky` with safe-area padding
- Main content area is `flex: 1` with `overflow-y: auto`
- Tab bar is `position: fixed` at bottom with safe-area padding
- Detail page is `position: fixed; inset: 0` overlaying everything

### Safe-area handling

iOS notch/home indicator support via `env(safe-area-inset-*)`:
- Header gets `padding-top: var(--safe-top)`
- Tab bar gets `padding-bottom: var(--safe-bottom)`
- Main content bottom padding accounts for tab height + safe area
- Detail back button offset from top includes safe area

### Key component patterns

| Component | CSS class | Layout |
|-----------|----------|--------|
| Mural grid | `.mural-grid` | 2-column CSS grid, 12px gap |
| Filter pills | `.filter-pills` | Horizontal flex, overflow-x scroll, hidden scrollbar |
| Mural card | `.mural-card` | Border-radius, shadow, scale-on-press |
| Route card | `.route-card` | Horizontal flex (100px thumb + body) |
| Detail page | `.detail-page` | Fixed fullscreen, internal scroll |
| Nearby row | `.detail-nearby-row` | Horizontal scroll, 120px cards |
| Map icons | `.mural-map-icon` | 48px thumbnail with white border + shadow |

### Typography

- **Display** (Space Mono): header title, artist names, badges, stats, pill labels
- **Body** (DM Sans): bio text, descriptions, meta info, year sub-pills
- Base font size: 15px, line-height 1.5

## index.html App Shell

The HTML is a static shell — all dynamic content is rendered by `app.js`:

- **Offline banner** — shown/hidden based on `navigator.onLine` events
- **Install prompt** — captures `beforeinstallprompt` event for PWA install
- **Header** — "SHINE" title + "St. Pete Mural Guide" subtitle
- **Search bar** — visible on Explore tab only
- **Filter pills** — visible on Explore tab only
- **View containers** — three divs for Explore/Map/Routes
- **Detail page** — overlay with back button and content area
- **Tab bar** — three buttons with SVG icons
- **SW registration** — currently unregisters old service workers on load (for cache clearing during development)

---

## Data Pipeline (Python)

The Python scripts in `scripts/` manage the YAML-to-JS data compilation and related tooling. All scripts resolve paths relative to the project root via `os.path.dirname(SCRIPT_DIR)`.

### build-data.py — YAML compiler

The core build tool. Reads all `data/murals/*.yaml` files, validates them, and generates `js/data.js`.

#### Lifecycle

1. **Load config** — reads `data/config.yaml` for categories, year colors, GPS bounds, aliases
2. **Load murals** — reads all `*.yaml` in `data/murals/` (skipping `_template.yaml`), filters to only `source: "claude-enhanced"` records
3. **Validate** — checks required fields, ID uniqueness, category validity, GPS bounds, image existence
4. **Generate** — sorts by year desc then artist alpha, writes deterministic ES module output

#### Validation rules

| Rule | Severity | Details |
|------|----------|---------|
| Required fields present | Error | `id`, `artist`, `year`, `lat`, `lng`, `address`, `category`, `img` |
| ID uniqueness | Error | No two YAML files may share the same `id` |
| Category valid | Error | Must be in `config.yaml → CATEGORIES` |
| GPS in bounds | Warning | lat/lng checked against Tampa Bay bounding box from `config.yaml → BOUNDS` |
| Image file exists | Warning | `img` path resolved relative to project root |
| Bio length | Warning | Flags bios shorter than 20 characters |

Errors abort the build (exit 1). Warnings are printed but data.js is still written.

#### Field mapping (YAML → JS)

```
artist       → a
title        → t
address      → loc
building     → bldg
year         → y
category     → cat
instagram    → ig
artistBio + muralDescription → bio   (combined into single string)
img          → img
basedIn      → from
```

Provenance fields (`source`, `sourceNotes`) are stripped — they exist only in YAML.

#### JS output format

```js
export const murals = [
  {id:1,a:'Aaron Tullo',t:'',loc:'253 2nd Ave N',bldg:'Cordova Inn',...},
  ...
];
export const YEARS = [2025, 2024, ...];
export const YEAR_COLORS = { 2025: '#1E5B8A', ... };
export const CATEGORY_COLORS = { 'shine': '#1E5B8A', ... };
```

String escaping handles backslashes, single quotes, smart quotes (converted to straight), and newlines (flattened to spaces).

#### CLI flags

| Flag | Behavior |
|------|----------|
| (none) | Validate + write `js/data.js` + print stats |
| `--dry-run` | Validate only, don't write output |
| `--list-stale` | Show murals still marked `source: "legacy"` |
| `--stats` | Print coverage statistics (bio, GPS, image, address, Instagram) by year |

### extract-card.py — PDF detail card extractor

Parses SHINE mural detail card PDFs (via PyPDF2) and generates pre-filled YAML files.

#### Format detection

`detect_format(text)` checks the first line of extracted text:
- Starts with `"SHINE Catalog"` → **batch03** format (uses `Context:`, `Description:`, `Artist Bio:` labels)
- Otherwise → **original** format (parses `(DB #N)`, `[Card #N]`, or `(NEW #N)` header patterns)

#### Field extraction

Uses regex patterns to pull structured fields from PyPDF2's continuous text extraction:
- Header: artist name, DB number, year, festival name
- Labeled fields: `Address:`, `Building:`, `GPS:`, `Instagram:`, `Mural Title:`
- Section blocks: `DESCRIPTION` / `ARTIST BIO` (delimited by uppercase headers)
- Awards and inspiration: regex-extracted with "none" filtering

#### Auto-ID assignment

`next_available_id()` scans existing YAML filenames for the highest `NNN-` prefix and returns `max + 1`.

#### Output

Generates YAML files with:
- All extracted fields populated
- `category`, `img`, `basedIn` marked as TODO for manual review
- `source: "detail-card"` provenance

#### CLI

```bash
python3 scripts/extract-card.py card.pdf            # single-page PDF
python3 scripts/extract-card.py multi.pdf --all      # all pages
python3 scripts/extract-card.py multi.pdf --page 3   # specific page
```

Multi-page PDFs without `--all` or `--page` print a page index and exit.

### add-photo.py — Photo import helper

Imports a user's photo into a mural's YAML record. Requires Pillow (`pip3 install Pillow`).

#### What it does

1. **Read GPS** from photo EXIF data (DMS → decimal degrees conversion)
2. **Copy photo** to `images/murals/{year}/{artist-slug}{ext}` (prompts before overwrite)
3. **Update YAML** — sets `img` path and `lat`/`lng` from the photo's GPS

#### GPS-only mode

```bash
python3 scripts/add-photo.py --gps ~/Photos/IMG_1234.jpeg
```

Prints lat/lng and a Google Maps link without modifying any YAML.

### migrate.py — One-time data.js → YAML migration

Reference-only script that was used once to bootstrap the YAML pipeline. Parses the original hand-edited `js/data.js` (with its single-quoted JS object syntax) into individual YAML files.

#### Parser details

- Custom character-by-character parser for JS object literals (handles escaped quotes, numeric/null values)
- Maps abbreviated keys back to full names (`a` → `artist`, `loc` → `address`, etc.)
- Long bio strings formatted as YAML literal block scalars (`|`)
- All generated files marked `source: "legacy"`
- Sequential IDs assigned, duplicate artist+year combinations warned

### generate-pdf.py — Catalog PDF generator

Generates a print-ready PDF catalog of all murals using ReportLab. Requires `pip3 install reportlab`.

#### Output

- Title page with stats (total murals, enhanced/legacy counts, year range)
- One page per mural showing: photo, metadata, bio, description, awards, provenance, source URLs, file info
- Enhanced vs legacy status highlighted in green/orange
- Outputs to `mural-catalog.pdf` at project root

### Shared patterns across scripts

| Pattern | Used in |
|---------|---------|
| `slugify(text)` — ASCII lowercase, hyphens only | extract-card, add-photo, migrate |
| `yaml_scalar(value, key)` — smart YAML formatting (block scalars for long text, quoted strings for special chars) | extract-card, migrate |
| `PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)` — resolve paths from script location | all scripts |
| `MURALS_DIR = data/murals/` — YAML source directory | all scripts |

### Dependencies

```
# scripts/requirements.txt
pyyaml>=6.0       # YAML parsing (build-data, generate-pdf)
PyPDF2>=3.0        # PDF text extraction (extract-card)

# Optional (not in requirements.txt)
Pillow             # EXIF GPS reading (add-photo)
reportlab          # PDF generation (generate-pdf)
```
