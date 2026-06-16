# Mural Quest — Session Status (April 19-23, 2026)

## Builds 91-103

### New Murals Added
- **#172** Ya La'Ford "Golden Wave" — Morean Arts Center (commercial)
- **#173** Phi Phi Artland (Sara Salem) — Central Ave (commercial)
- **#174** Vitale Bros owl — Central Ave (commercial)
- **#175** Low Bros "Post Internet Explorers" — SHINE 2019, MLK St
- **#176** Drew Merritt "Mask Off" — SHINE 2019, MLK St
- **#177** Derek Donnelly "Cultasaurus" — commercial
- **#58** Chad Mize "We Are St. Pete" — restored with photo (was needs-photo)

### Murals Marked Gone
- **#35** Andrea Wan "Earth Song" — building torn down, April 2026. Banner overlay on hero image.

### Route Changes
- **Downtown North**: 66/129 swapped in order. New segments 1→66, 66→129, 129→109. 116→23 redrawn. All 15 segments clean.
- **Tropicana Field**: Added #133, #163, #171, #138. Removed #20. Now 14 stops.
- **Central Ave**: Added #156, #173, #174. Restored #151. Now 13 stops.
- **Methodist Town**: Paths redrawn. 7 stops unchanged.
- **CH Test**: Route remains in routes.js but removed from app.js ROUTE_DEFS.

### GPS Updates (dozens across sessions)
- Major moves: #100 Happy Mural Project, #138 PHYBR, #171 Taj Tenfold, #8 Elizabeth Barenis
- #118 Healing Palms photo corrected (was swapped with #8)
- #129 John Vitale GPS refined

### Bio Updates
- Chad Mize bio (Twiggy version) copied to all 4 entries (#77, #116, #166)
- Sarah Sheppard bio opener rewritten across all 4 entries
- "Commercial" renamed to "Commissioned" throughout app

### Major UI Changes

#### Tour Detail Page
- **Floating nav**: Title, back button, Reverse Tour, Jump To Next float over map with frosted glass
- **Compass HUD**: Pushed down to clear floating nav (95px + safe-area)
- **Back button**: White circle with border and shadow for visibility
- **Pelican stickers**: Non-tour murals shown as pelican logos (48px icon, 66px tap target)
- **Tour stop icons**: Other tour stops shown as small grayed photo thumbnails with numbers
- **Field Notes**: New `fieldNotes` YAML field — 3 bullet-point teasers per mural. 73 tour murals populated. Shown in explore panel below image.
- **"Not on [Tour Name]"**: Label on detail page when opening non-tour mural from tour map
- **"Click mural for details"**: Added to active tour cheat sheet
- **Navigation arrows**: Frequency increased (30m intervals, was 50m)
- **Route line**: Thinner (3px) and dotted
- **Map grayed in explore mode**: Desaturated + faded, compass stays full color
- **"Jump To Next"**: Renamed from "Skip", moved to second row below title

#### Mural Detail Page
- **"Connect to Artist"**: Replaces "Further Work". Inline expand with Instagram + website links.
- **Directions map**: North-up (no rotation), scrollable, 50vh, fitBounds, pinch-to-zoom
- **Gone murals**: `gone: true` YAML field. Hero image gets dark banner overlay. Explore grid card desaturated.

#### Visual Design
- **Coral** (#E8736C) replaces orange (#FF7043) throughout
- **Warm background** (#F7F4EF) replaces gray (#E5E0D6) for --bg and --card
- **Border** updated to #E8E3DC
- **All borders/lines halved**: Tour dividers 2px, image borders 2px, map pin borders 2px
- **Cheat sheet**: All text white, arrows removed, positions finalized
- **Pelican logo**: Moved to right side on tab headers
- **Map page**: Title changed to "Mural Quest", borders removed
- **Discover Mode**: Button hidden, cheat sheet reference removed (code preserved)
- **Map FAB buttons**: Moved down 5%

#### Route Editor (tools/route-editor.html)
- **Segment labels**: Stop numbers at each end of every segment
- **Mural IDs**: Shown in sidebar stop list
- **+ Segment flow**: Prompts for from/to stop numbers before drawing
- **Green dots fixed**: Temporary markers cleaned up after segment placed
- **Segment shows immediately**: Fixed routeId null bug after cancelAddSegment

### Arrival Feedback
- **Haptics**: 5 strong 500ms hits evenly spaced
- **Tone**: Triangle wave chord, full gain, 2.5s sustain, two sparkle notes (C5 + E5)

### Build Script Changes
- `fieldNotes` → `fn` array exported to data.js
- `gone` → `gone:true` exported to data.js

### Current Build: 103 (TestFlight)

### What's Next
1. Field notes layout: artist name positioning (directly under image, right-aligned)
2. Field test remaining routes with new stops
3. App Store submission prep
4. Target launch: May 1, 2026
