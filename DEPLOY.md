# SHINE PWA — Update Feb 23, 2026

## What Changed

### 1. Image Replacements (4 murals)
Old brochure images → `oimg` field (shown as "Other Work by Artist")
New painted mural photos → `img` field (primary display)

| Artist | New Image | Old Image (now "Other Work") |
|--------|-----------|------------------------------|
| Reid Jenkins | reid-jenkins-2025.jpg | reid-jenkins.jpg |
| Brain The Genius | brain-the-genius-2025.jpg | brain-the-genius.jpg |
| Zulu Painter | zulu-painter-2025.jpg | zulu-painter.jpg |
| Jenipher Chandley | jenipher-chandley-2025.jpg | jenipher-chandley.jpg |

### 2. Map Pin Fix
- Pins now show a popup with "View Details" link that opens the full mural detail page
- Previously pins only showed a popup with directions — no way to get to the detail view

### 3. "Other Works" Support
- New `oimg` field in data.js for murals that have alternate/portfolio images
- Detail page shows these under "Other Work by [Artist]" section

### 4. Service Worker Cache Bump
- Bumped to `shine-v3` to force users to get fresh assets

## Deployment Steps

1. **Merge with existing deploy**: Copy all existing image folders from your last deploy into this project:
   - `images/murals/2024/*`
   - `images/murals/2023/*`
   - `images/2022/*` (note: no `murals/` subfolder for 2022)
   - `images/2023/*` (rhys-meatyard lives here)
   - `images/2020/*`
   - `images/murals/2025/*` (keep existing + add new 4 files)

2. **Zip the merged folder**: `zip -r shine-deploy.zip shine-pwa/`

3. **Deploy to Netlify**: Drag zip to https://app.netlify.com/sites/shinestpete/deploys

## Data: 62 murals
- 2025: 19 murals (4 with new photos, 15 still need real SHINE 2025 photos)
- 2024: 15 murals
- 2023: 18 murals
- 2022: 8 murals
- 2020: 1 mural (Alex Yanes)
- 1 mural with no lat/lng or image (Amy Ilic-Volpe 2022, id varies)
