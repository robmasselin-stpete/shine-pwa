# Mural Quest — Marketing Brief

**Prepared April 18, 2026 — for use in marketing copy, brochures, App Store listing, and press materials.**

---

## What It Is

Mural Quest is a free mobile app for discovering and navigating between 150+ street murals in St. Petersburg, Florida. It is a walking tour companion — part map, part art guide, part compass. You pick a route, the app points you to the next mural, and when you arrive it tells you the story of the artist and the wall.

---

## The Numbers

| Stat | Value |
|------|-------|
| Murals in the app | 156 (and growing) |
| SHINE Mural Festival pieces | 119 |
| Commercial / independent murals | 37 |
| Unique artists | 128 |
| Years covered | 2014–2026 |
| Walking routes | 6 curated tours |
| Artist bios | 100% coverage — every mural has an original bio |
| Photos | All photos taken on-site by the developer |
| Price | Free |
| Platform | iOS (App Store) |

---

## The Six Walking Routes

| Route | Stops | Character |
|-------|-------|-----------|
| Downtown North | 15 | Where SHINE started. The 600 block, the waterfront, the Cordova Inn. |
| The Edge | 12 | The brewery belt. Green Bench to the Edge — murals between the craft beer and the train tracks. |
| Methodist Town | 7 | Seven walls along MLK. Shorter walk, bigger stories. |
| Tropicana Field | 10 | The stadium loop. Ten murals around Tropicana Field. |
| Central Ave | 9 | The main drag. Nine murals along Central — one of the avenues that defines the city. |
| Arts District | 13 | Warehouses turned canvases. Thirteen murals deep in the district where the studios are. |

---

## Key Features

### Compass Navigation
A real-time compass points you toward the next mural on your route. A radar blip sounds when you're aimed at the target. Haptic feedback (vibration) fires when the compass crosses the target bearing — so you can navigate with the phone in your pocket. Arrival detection announces when you've reached the mural.

### Artist Bios
Every mural has an original, fact-checked bio written in a specific editorial voice — not copied from any festival website. Each bio leads with the most interesting true thing about the artist, then tells their story in 400 words. A longer search bio (800+ words) contains full career details for discoverability. Bios cover 128 artists from 20+ countries.

### Mural Map
An interactive map shows all 156 murals with thumbnail photos at close zoom. Filter by SHINE year, category (SHINE, commercial, vintage), or search by artist name, title, or bio content.

### Walk / Explore / Arrive Flow
On a tour, the app cycles through three states:
- **Walk** — compass points to the next mural, shows distance and estimated walk time
- **Arrive** — the app detects you're within 50 feet and plays a chord + haptic
- **Explore** — read the bio, see the photo, mark it as "seen," then move on

### Offline Support
The app works offline. All mural images, data, and map tiles are cached on first load.

### Screen Wake Lock
The screen stays on during active navigation so you don't have to keep tapping.

---

## Who It's For

- **Tourists** visiting St. Petersburg who want to explore the mural scene on foot
- **Locals** who walk past these walls every day and want to know the stories behind them
- **Art lovers** interested in street art, public art, and mural festivals
- **Runners and cyclists** on the Pinellas Trail who pass dozens of murals without knowing it

---

## The SHINE Connection

SHINE Mural Festival has been painting St. Petersburg since 2015. It is one of the largest mural festivals in the southeastern United States. Mural Quest covers every accessible SHINE mural from 2015 through 2025, plus dozens of independent and commercial murals across the city. The app is not officially affiliated with SHINE — it is an independent guide built by a local.

---

## Technical Specs

| Spec | Detail |
|------|--------|
| Platform | iOS (iPhone) |
| Minimum iOS | 16.0 |
| Built with | Capacitor (web app in native shell) |
| Maps | Leaflet with CARTO Voyager tiles |
| Offline | Service worker with full asset caching |
| Haptics | CHHapticEngine via Capacitor native bridge |
| Compass | Device orientation API with exponential smoothing |
| GPS | High-accuracy watchPosition with arrival detection |
| Audio | Web Audio API for arrival tones and radar blips |
| Data source | Hand-curated YAML files compiled to JS |

---

## Voice & Tone — The Mural Quest Style Card

The app has a distinct editorial voice used across all artist bios. If you are writing marketing copy, App Store descriptions, social media, or press materials for Mural Quest, use the same voice:

### Principles

1. **Lead with the most interesting true thing.** Not the chronology. Not where they went to school. The thing that makes you lean in.
2. **Fact-only. Zero speculation.** No "perhaps," no "likely," no inferred motivations.
3. **Active voice, present tense where possible.** "He paints" not "he has been known to paint."
4. **Cut the resume recitation.** One concrete credential beats a list of five.
5. **Short sentences land harder.** Mix lengths. When in doubt, cut the last clause.
6. **Dry wit is allowed. Whimsy is not.** One knowing observation, earned by the facts. Never use exclamation points. Never call something "incredible," "amazing," or "stunning."
7. **No hollow openers.** Never start with "[Name] is a [city]-based artist who..."

### Example — Good

> He painted a T-Rex going fishing for AARP. That tells you most of what you need to know about Derek Donnelly.

### Example — Bad

> Derek Donnelly is a St. Petersburg-based muralist and artist who has been creating amazing works throughout the city for many years, bringing his incredible vision to walls across Florida.

### Applying to Marketing Copy

The same voice works for marketing. Be specific. Be factual. Let the numbers and the stories do the selling. Don't oversell — the murals are already interesting. Your job is to make people curious enough to go look.

**Good:** "156 murals. 128 artists. 6 walking routes. One app."

**Bad:** "Discover the incredible, vibrant world of St. Petersburg's amazing street art scene!"

---

## App Store Metadata (Current)

- **App Name:** Mural Quest — St. Pete Murals
- **Bundle ID:** com.muralquest.stpete
- **App ID:** 6761023231
- **Current Build:** 91
- **Developer:** Rob Asselin

---

## Photo Policy

Every mural photo in the app was taken on-site by the developer. No stock images. No screenshots from Google Maps. No images pulled from artist Instagram accounts. This is deliberate — the app shows you what the mural looks like right now, not what it looked like when it was freshly painted.

---

## Contact

Rob Asselin
St. Petersburg, FL
