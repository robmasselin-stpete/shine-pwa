# Mural Quest — Session Status (April 19, 2026)

## Where We Are

### App Stats
- **156 murals** in production build (161 total YAML files, 5 excluded pending photos)
- **100% bio coverage** — every mural has an original bio with hook
- **6 walking routes**: Downtown North (15), The Edge (12), Methodist Town (7), Tropicana Field (10), Central Ave (10), Arts District (13)
- **Current build**: 91 (TestFlight) — not yet submitted to App Store
- **Target launch**: May 1, 2026

### What We Did Today (April 19)

#### Route Segment Refactor (Major)
- **Converted segment format** from positional arrays to tagged objects: `{from: muralId, to: muralId, path: [[lat,lng],...]}`
- App now looks up segments by mural ID pair — order in the array doesn't matter
- Route editor updated to read/write tagged format
- **Added "Missing Segments" section** in route editor sidebar — shows which stop pairs lack paths, with green "Draw" button for each that pre-tags the from/to IDs
- Cleaned Downtown North: removed 5 bad placeholder segments, kept 10 good ones
- 5 segments still need drawing: 109→110, 110→7, 7→9, 9→111, 24→6

#### Explore Panel Redesign
- **Stacked layout** when arriving at a mural: big image full width on top, artist name below, then bullets + "Next Mural" button in a row
- Panel expands to 50vh min-height in explore mode
- Artist name moved to sit directly under the image via DOM manipulation
- Font sizes tuned: 20px artist name, 16px bullets, 20px button text

#### Navigation Improvements
- **Arrival haptic**: 5 escalating hits (400→600ms) instead of 3
- **Arrival tone**: maxed gain to 1.0, longer sustain
- **Radar blip**: audio ping on bearing hit — works even when phone is too hot for haptics
- **Route lines thinner**: active 5 (was 8), inactive 3 (was 6)
- **"Next Mural" → "Skip"** in top nav bar
- **Map redraws** properly when switching from explore to walk mode
- All segment lines now solid (removed dotted style for 2-point segments)

#### Route Editor Enhancements (v11)
- **Split Here** button — split a segment at any vertex into two segments
- **+ Segment** button — click two map points to create new segment
- **Delete Segment** — remove entire segment
- **Missing segments panel** — red section showing which pairs need paths, with Draw buttons
- **Available murals sorted by ID**
- **Segment popups** — click a path line to see from→to artist names and point count

#### GPS & Route Updates
- Multiple rounds of GPS position updates (dozens of murals repositioned)
- Downtown North, The Edge, Methodist Town, Tropicana Field, Central Ave, Arts District paths all updated
- Route definition changes: Tropicana Field reordered (125 moved), Central Ave added Jade Rivera (#151)

#### Detail Page Directions
- Map enlarged to 65vh (was 55vh)
- Page scrolls to top and locks when entering goto mode
- Clicking DIRECTIONS again toggles it off (restores normal detail page)

#### Compass & Haptics
- **Compass watchdog**: if no deviceorientation event for 3s, tears down and re-attaches listener
- **Visibility recovery**: when app returns from background, kicks compass listeners and re-acquires wake lock
- **Thermal haptic issue identified**: iPhone Taptic Engine silently disables when phone is hot (GPS + screen + charging). Calls succeed but no vibration. Radar blip audio added as backup.
- Debug overlay tested and removed from production build

#### Bio Updates
- Andrea Wan (#35) — full rewrite with Apple/NYT client hook
- Derek Donnelly Sonshine (#159) — full bio from other entries
- Dreamweaver 20th St (#169) — full bio
- Kosharekart (#147) — full rewrite, Smithsonian hook
- Jujmo (#163, #167) — military kid/anime hook
- Mikael B (#146) — graffiti at 15, viral world map
- Matt Kress (#119) — Mooney Anomaly/Skittles hook
- Ernesto Maranje (#127) — Coast Guard knee injury hook
- Justin Bass (#154) — DropTheLove hook
- J&S Signs (#114) — ceramics majors hook

#### Murals Removed (Pending Photos)
- Quinn Cale #14, Naomi Haverland #28, Baghead #56, Chad Mize SHINE 2022 #58, Nneka Jones #67

### What's Next

#### Immediate (Before Launch)
1. **Draw missing segments** for Downtown North (5 pairs) and verify all other routes
2. **Field test remaining routes**: The Edge, Methodist Town, Tropicana Field, Central Ave, Arts District
3. **App Store submission prep**: screenshots, description, icon, keywords
4. **Submit for review** by April 25 (buffer for rejection)
5. **Ship final build to Apple** with all fixes

#### Post-Launch
- Native Swift plugin for compass + haptics
- Android release
- Add murals with photos for the 5 removed entries
- Continue adding new murals as discovered

### Files Modified This Session
- `js/app.js` — explore panel, arrival haptics, segment resolution, map redraw, compass watchdog
- `css/app.css` — explore expanded layout, route line weights
- `js/routes.js` — converted to tagged segment format, all paths updated
- `tools/route-editor.html` — v11: split, add, delete segments, missing segments panel, tagged format
- `data/murals/*.yaml` — dozens of GPS updates, bio rewrites
- `docs/marketing-brief.md` — created
- `docs/launch-plan.md` — created
- `docs/launch-checklist.docx` — created
- `docs/all-artists.md` — created (156 artist bios for marketing)
