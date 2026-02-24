# SHINE St. Pete Mural Guide — PWA

## Project Overview
Progressive Web App for the SHINE Mural Festival in St. Petersburg, FL. Interactive guide to 100+ murals with map, GPS-based nearby sorting, field photo gallery, and mural detail cards.

**Live site:** https://shinestepete.netlify.app
**Repo:** https://github.com/robmasselin-stpete/shine-pwa.git
**Auto-deploys:** Push to `main` → Netlify builds automatically (static files, no build step)

## Critical: Git Work-Tree Setup
The git repo root is `/Users/robasselin/Downloads/` but all project files live in the `shine-deploy/` subdirectory. **All git commands must use the work-tree flag:**

```bash
git --work-tree=shine-deploy add js/app.js js/photos.js
git --work-tree=shine-deploy commit -m "message"
git push
```

- Paths in `git add` are relative to the work tree (use `js/app.js` not `shine-deploy/js/app.js`)
- Must run git commands from `/Users/robasselin/Downloads/` (the repo root)

## Project Structure
```
shine-deploy/
  index.html        # PWA shell — tabs, detail overlay, install prompts
  manifest.json     # PWA manifest (display: standalone)
  sw.js             # Minimal service worker (fetch passthrough, enables install prompt)
  _headers          # Netlify cache headers (no-cache HTML/JS, 1-day images)
  css/app.css       # All styles
  js/
    app.js          # Main app logic — tabs, map, nearby, gallery, scan, detail pages
    data.js         # 106 mural entries with minified property names
    photos.js       # ~43 field photos with GPS coords + artist aliases
    qrcodes.js      # QR code URL-to-mural-ID mapping + fuzzy lookup
  images/
    murals/         # Mural hero images organized by year (2015-2025)
    field/          # Field photos (IMG_0394.jpeg through IMG_0432.jpeg)
    icons/          # PWA icons
```

## Data Schema

### Murals (`data.js`)
Uses **minified property names** — do NOT use full names:
- `m.id` — unique integer
- `m.a` — artist name
- `m.t` — mural title (optional)
- `m.loc` — street address
- `m.bldg` — building name (optional)
- `m.lat`, `m.lng` — GPS coordinates
- `m.y` — year (number)
- `m.img` — image path (e.g. `images/murals/2025/aaron-tullo.jpg`)
- `m.ig` — Instagram handle (optional)
- `m.bio` — artist bio HTML (optional)
- `m.from` — "Based in..." text (optional)

Also exports: `YEARS` (array), `YEAR_COLORS` (year→hex map)

### Field Photos (`photos.js`)
```js
{ src: 'IMG_0394.jpeg', muralId: 6, note: 'Description', lat: 27.7762, lng: -82.637 }
```
- `muralId` can be `null` for unlinked festival/atmosphere shots
- Photos appear on mural detail pages if linked by muralId OR within 200m GPS distance

## Key App Features
- **Explore tab** — filterable mural grid (year pills + text search)
- **Map tab** — Leaflet.js with color-coded circle markers (radius 14px), popups link to detail
- **Scan tab** — two modes: QR code scanner + GPS-based "Identify by Location" mural picker (see below)
- **Nearby tab** — GPS-sorted list mixing murals + field photos
- **Gallery tab** — clickable photo grid, opens photo detail cards
- **Detail pages** — hero image, artist info, walking directions, field photos, nearby murals
- **Photo detail** — separate detail view for field photos with linked/nearby murals
- **PWA install** — Android beforeinstallprompt + iOS Safari share banner

### Scan Tab (`js/app.js` + `js/qrcodes.js`)
The Scan tab (center position, tab order: Explore, Map, **Scan**, Nearby, Gallery) offers two ways to identify a mural:

**QR Code Scanner:**
- Uses html5-qrcode v2.3.8 (CDN: `https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js`)
- Scans PixelStix plaque QR codes (hwid.us short links)
- Lookup in `js/qrcodes.js` uses fuzzy substring matching — `includes()` with 0/O and 1/l/I treated as equivalent
- Match → opens mural detail page; no match → shows URL with "Try Again" and "Open Link" options
- Camera must be stopped asynchronously (`setTimeout(0)` + Promise) — cannot call `html5QrCode.stop()` inside the success callback
- `scanHandled` flag prevents duplicate callbacks

**Identify by Location:**
- Gets GPS position, finds 8 nearest murals by haversine distance
- Shows visual grid with mural images, artist name, and distance
- User taps the mural they're looking at → opens detail page
- Accuracy improves as mural GPS coordinates are refined

### QR Code Mapping (`js/qrcodes.js`)
```js
const codeMap = {
  'hubfp48hnam0thrrmvevenogra9irg': 23, // Emmanuel Jarus — Green Bench Brewing
};
```
- Keys are the path segment from hwid.us URLs (lowercased)
- `lookupQrUrl()` normalizes the scanned URL (strips protocol, www, trailing slashes, lowercases) then checks if any known code appears as a substring
- Fuzzy matching collapses ambiguous characters (0↔o, 1↔l↔i) to handle scanner variation
- Add new entries as QR codes are collected from plaque photos

## Local Testing
```bash
cd shine-deploy && python3 -m http.server 8080
# Then open http://localhost:8080
```

## Data: Pending Work
- **QR codes**: Only 1 plaque mapped so far (Emmanuel Jarus, ID 23). More QR code photos to be uploaded and decoded, then added to `codeMap` in `js/qrcodes.js`.
- **Mural coordinates**: Precise GPS coordinates for each mural are being gathered via CSV. More accurate coords will improve both the map markers and the "Identify by Location" feature.

## Past Issues to Watch For
- **Escaped apostrophes in data.js**: Bio strings with `'` must use `\'` (single backslash). Double backslash `\\'` breaks JS parsing.
- **Fake HTML images**: Old `_redirects` catch-all served index.html for missing image paths. If images show as ~7KB, check with `file` command — they may be HTML.
- **Leaflet popup click handlers**: Must use DOM-based popups (`document.createElement` + `addEventListener`). HTML string popups lose event listeners.
- **Detail page z-index**: Must be 10000+ to render above Leaflet map layers (which go up to 1000+).
- **Image sources**: Real source images for 2023-2024 murals are in `/Users/robasselin/Downloads/shine-2023-2024/`. 2025 sources are in `/Users/robasselin/Documents/520 25th Avenue/Shine/murals by year/Shine 2025 Missing/`. Use macOS `sips --resampleWidth 1200` to resize.
- **html5-qrcode stop() in callback**: Never call `html5QrCode.stop()` synchronously inside the `onScanSuccess` callback — it freezes the scanner. Must defer with `setTimeout(() => { ... }, 0)`.
- **QR code 0 vs O ambiguity**: Different QR scanners (Python vs phone camera) may decode the same QR differently for ambiguous characters. The fuzzy matching in `qrcodes.js` handles this by collapsing 0/o and 1/l/i before comparing.
- **iOS camera requires HTTPS**: Camera API won't work on plain HTTP except localhost. Test on phone via Netlify deploy or ngrok.
