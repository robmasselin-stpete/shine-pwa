# SHINE St. Pete — Mural Guide PWA

A progressive web app for exploring murals from the [SHINE Mural Festival](https://stpeteshinemuralproject.com/) in St. Petersburg, Florida. Browse by year, category, or location — get walking directions and curated routes.

**Live:** https://legendary-bonbon-a5b20a.netlify.app/

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JS (ES modules), HTML5, CSS custom properties |
| Maps | [Leaflet](https://leafletjs.com/) 1.9.4 with CARTO basemaps |
| Data pipeline | Python 3.8+ (PyYAML) — YAML source files compiled to JS |
| Offline | Service worker with 4-cache strategy |
| Hosting | Netlify static deploy (push-to-deploy from `main`) |
| Fonts | Google Fonts — Space Mono (display) + DM Sans (body) |

No build tools, no bundler, no framework. The app loads as static files.

## Project Structure

```
shine-pwa/
├── index.html              # App shell — header, tabs, detail overlay, SW registration
├── manifest.json           # PWA manifest (standalone, portrait)
├── sw.js                   # Service worker — 4-cache offline strategy
├── css/
│   ├── app.css             # All styles — design tokens, layout, components
│   └── fonts.css           # @font-face declarations
├── js/
│   ├── app.js              # Main application — state, tabs, map, routes, detail
│   ├── data.js             # GENERATED — mural array + config (do not hand-edit)
│   └── photos.js           # Field photo mappings + artist aliases
├── data/
│   ├── config.yaml         # Categories, year colors, GPS bounds, aliases
│   └── murals/             # One YAML file per mural (source of truth)
│       ├── _template.yaml  # Blank template for new murals
│       ├── 001-aaron-tullo-2025.yaml
│       ├── 002-amy-ilic-volpe-2025.yaml
│       └── ...             # 115 total (49 enhanced, 67 legacy)
├── scripts/
│   ├── build-data.py       # YAML → data.js compiler with validation
│   ├── extract-card.py     # PDF detail card → YAML extractor
│   ├── migrate.py          # One-time: original data.js → YAML (reference)
│   ├── add-photo.py        # Helper for adding mural photos
│   ├── requirements.txt    # Python deps: pyyaml, PyPDF2
│   └── README.md           # Data pipeline quickstart + field reference
├── images/
│   ├── icons/              # PWA icons (192px, 512px)
│   └── murals/             # Mural photos organized by year
│       ├── 2020/
│       ├── 2021/
│       ├── 2022/
│       ├── 2023/
│       ├── 2024/
│       └── 2025/
└── docs/
    ├── ARCHITECTURE.md     # Frontend technical deep-dive
    ├── DATA-PIPELINE.md    # Build script internals, field mapping, validation
    ├── ADDING-A-MURAL.md   # Step-by-step mural addition checklist
    ├── ENHANCING-WITH-CLAUDE.md  # Bio enhancement workflow with Claude
    └── DETAIL-CARD-FORMATS.md    # PDF parsing reference for extract-card.py
```

## Architecture

```
data/murals/*.yaml  +  data/config.yaml
        │
   build-data.py          validates, sorts, compiles
        │
   js/data.js              exports: murals[], YEARS, YEAR_COLORS, CATEGORY_COLORS
        │
   js/app.js               imports data.js + photos.js, renders everything
        │
   index.html              app shell with tab navigation + detail overlay
        │
   sw.js                   caches shell, images, tiles, fonts for offline use
```

YAML is the source of truth. `data.js` is generated — never edit it by hand.

## Getting Started

```bash
# Clone
git clone <repo-url> && cd shine-pwa

# Install Python dependencies
pip3 install -r scripts/requirements.txt

# Build data.js from YAML sources
python3 scripts/build-data.py

# Run a local server
python3 -m http.server 8080
# Open http://localhost:8080
```

### Useful build commands

```bash
python3 scripts/build-data.py              # compile YAML → data.js
python3 scripts/build-data.py --dry-run    # validate without writing
python3 scripts/build-data.py --stats      # show coverage statistics
python3 scripts/build-data.py --list-stale # show murals needing enhancement
```

## App Features

The app has three tabs accessible from the bottom navigation bar:

### Explore
Card grid of murals with category filter pills (All / Shine / Vintage Shine / Commercial). Selecting Shine or Vintage shows year sub-pills with color-coded dots. Full-text search across artist, title, location, and building name.

### Map
Leaflet map centered on downtown St. Pete. Murals appear as color-coded circle markers at normal zoom, switching to thumbnail image icons at zoom level 15+. Same category/year pill filters as Explore. Year legend auto-generated from visible markers. User location shown as blue dot.

### Routes
Pre-defined walking routes (SHINE 2025, 2024, 2023, Downtown Highlights, All SHINE). Each route uses nearest-neighbor ordering from the centroid, shows stop count, total distance, and estimated walk time. Tapping a route opens a detailed stop list with inter-stop distances. "Open in Google Maps" deep link for turn-by-turn walking directions.

### Detail Page
Full-screen overlay showing hero image, category badge, artist name, title, hometown, Instagram link, address, artist bio, walking directions link, field photos (horizontal scroll), nearby murals, and "more by artist" section. Deep-linkable via `?mural=ID` query parameter.

## Data Model

### YAML source fields (per mural)

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique integer |
| `artist` | yes | Full artist name |
| `year` | yes | Festival year (0 if unknown) |
| `lat`, `lng` | yes* | GPS coordinates (null if unknown) |
| `address` | yes | Street address |
| `category` | yes | `shine`, `shine-legacy`, or `commercial` |
| `img` | yes | Image path relative to project root |
| `title` | | Mural title |
| `building` | | Building name |
| `instagram` | | Handle without @ |
| `basedIn` | | Artist's home city |
| `artistBio` | | Multi-line bio (YAML `\|` block) |
| `muralDescription` | | What the mural depicts |
| `source` | | Provenance: `claude-enhanced`, `legacy`, `detail-card`, `manual` |
| `sourceNotes` | | Research sources (not exported to JS) |

### Abbreviated JS fields in data.js

The build script compresses field names for smaller payloads:

| JS key | YAML field |
|--------|-----------|
| `a` | artist |
| `t` | title |
| `loc` | address |
| `bldg` | building |
| `y` | year |
| `cat` | category |
| `ig` | instagram |
| `bio` | artistBio + muralDescription (combined) |
| `from` | basedIn |

### Categories

- **shine** — Official SHINE festival murals (2021-2025)
- **shine-legacy** — Pre-SHINE era murals and older festival works
- **commercial** — Commissioned murals outside the festival

### Provenance

Only murals with `source: "claude-enhanced"` are included in data.js. Legacy murals are excluded until they've been reviewed and enhanced.

## Key Workflows

### Adding a new mural
See [docs/ADDING-A-MURAL.md](docs/ADDING-A-MURAL.md) for the full checklist. Short version:
1. Copy `data/murals/_template.yaml` → `NNN-artist-slug-YEAR.yaml`
2. Fill in required fields (GPS from user's photo EXIF when available)
3. Add image to `images/murals/YEAR/`
4. Run `python3 scripts/build-data.py`

### Enhancing a mural bio
See [docs/ENHANCING-WITH-CLAUDE.md](docs/ENHANCING-WITH-CLAUDE.md). Involves rewriting the bio with original research, setting `source: "claude-enhanced"`, and rebuilding.

### Extracting from a PDF detail card
```bash
python3 scripts/extract-card.py path/to/card.pdf
```
Generates a YAML file from the PDF. Fill in remaining fields and build.

## Service Worker

The service worker (`sw.js`) uses four named caches:

| Cache | Strategy | Contents |
|-------|----------|----------|
| `shine-v6` | Cache-first | App shell (HTML, CSS, JS, manifest) |
| `shine-images-v3` | Cache-first | All mural images (precached on install) |
| `shine-tiles-v1` | Network-first | CARTO map tiles |
| `shine-fonts-v1` | Cache-first | Google Fonts + Leaflet CDN assets |

On install, the service worker precaches the shell and all mural images. On activate, it cleans up old caches. Navigation requests fall back to `index.html` when offline.

## Deployment

The app is deployed as static files on Netlify. Push to `main` triggers an automatic deploy — no build step needed on the server since `data.js` is committed to the repo.

To deploy manually, just push:
```bash
git add -A && git commit -m "update" && git push
```

## Current State

- **49 enhanced murals** (reviewed with user photos, original bios)
- **67 legacy murals** (imported from original data, awaiting review)
- **116 total YAML files** across years 2015-2025 + commercial
- Coverage: 100% GPS, 100% images, 100% bios, 97% Instagram on enhanced murals

## Further Reading

- [scripts/README.md](scripts/README.md) — Data pipeline quickstart, YAML field reference, troubleshooting
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Technical deep-dive (frontend state/tabs/map/routes/detail + Python pipeline scripts)
- [docs/DATA-PIPELINE.md](docs/DATA-PIPELINE.md) — Build script internals, field mapping, validation rules
- [docs/ADDING-A-MURAL.md](docs/ADDING-A-MURAL.md) — Step-by-step mural addition workflow
- [docs/ENHANCING-WITH-CLAUDE.md](docs/ENHANCING-WITH-CLAUDE.md) — Bio enhancement workflow with Claude
- [docs/DETAIL-CARD-FORMATS.md](docs/DETAIL-CARD-FORMATS.md) — PDF parsing reference for extract-card.py
