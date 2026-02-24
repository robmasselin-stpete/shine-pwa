# SHINE St. Pete Mural Guide — PWA

## Project Overview
Progressive Web App for the SHINE Mural Festival in St. Petersburg, FL. Interactive guide to 100+ murals with map, GPS-based nearby sorting, field photo gallery, in-app walking directions, and mural detail cards.

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
    app.js          # Main app logic — tabs, map, nearby, gallery, directions, detail pages
    data.js         # 106 mural entries with minified property names
    photos.js       # ~43 field photos with GPS coords + artist aliases
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
- **Map tab** — Leaflet.js with color-coded circle markers (radius 14px), popups link to detail, in-app walking directions overlay
- **Nearby tab** — GPS-sorted list with large 128px thumbnails for visual mural identification, mixing murals + field photos
- **Gallery tab** — clickable photo grid, opens photo detail cards
- **Detail pages** — hero image, artist info, in-app walking directions button, field photos, nearby murals
- **Photo detail** — separate detail view for field photos with linked/nearby murals
- **In-app walking directions** — dashed route line on map with distance/time panel (see below)
- **PWA install** — Android beforeinstallprompt + iOS Safari share banner

Tab order: **Explore, Map, Nearby, Gallery** (4 tabs)

### In-App Walking Directions
Replaces external Google Maps links. Tapping "Walking Directions" from any detail page stays inside the app.

**Flow:** Detail page → close detail → switch to Map tab → dashed polyline from user location to mural → bottom panel with thumbnail, distance, estimated walk time, and "Open in Maps" fallback link → close button clears route.

**Functions in `js/app.js`:**
- `showWalkingRoute(lat, lng, name, img)` — gets fresh GPS position, switches to Map tab, calls `drawRoute()`
- `drawRoute(fromLat, fromLng, toLat, toLng, name, img)` — draws dashed polyline + destination highlight marker, fits map bounds, creates bottom route panel
- `clearRoute()` — removes polyline, marker, and panel from map

**Three locations call `showWalkingRoute()`:**
1. Map popup "Directions →" button
2. Mural detail page "Walking Directions" button
3. Photo detail page "Walking Directions" button

**Walking time:** ~80m/min (~3 mph), minimum 1 minute display.

**GPS fallback:** Fresh geolocation → cached `state.userLat/userLng` → map center.

## Data: Pending Work
- **Mural coordinates**: Precise GPS coordinates for each mural are being gathered via CSV. More accurate coords will improve both the map markers and the Nearby tab identification feature.

## Local Testing
```bash
cd shine-deploy && python3 -m http.server 8080
# Then open http://localhost:8080
```

## Past Issues to Watch For
- **Escaped apostrophes in data.js**: Bio strings with `'` must use `\'` (single backslash). Double backslash `\\'` breaks JS parsing.
- **Fake HTML images**: Old `_redirects` catch-all served index.html for missing image paths. If images show as ~7KB, check with `file` command — they may be HTML.
- **Leaflet popup click handlers**: Must use DOM-based popups (`document.createElement` + `addEventListener`). HTML string popups lose event listeners.
- **Detail page z-index**: Must be 10000+ to render above Leaflet map layers (which go up to 1000+).
- **Image sources**: Real source images for 2023-2024 murals are in `/Users/robasselin/Downloads/shine-2023-2024/`. 2025 sources are in `/Users/robasselin/Documents/520 25th Avenue/Shine/murals by year/Shine 2025 Missing/`. Use macOS `sips --resampleWidth 1200` to resize.
- **Route panel z-index**: The `.route-panel` uses `z-index: 1000` and sits inside `#view-map` (which has `position: relative`). This keeps it above Leaflet layers but below the detail page overlay (z-index 10000).
