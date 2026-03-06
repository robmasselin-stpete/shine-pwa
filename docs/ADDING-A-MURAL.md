# Adding a Mural — Checklist

## Option 1: From a Detail Card PDF

1. Run the extraction script:
   ```bash
   python3 scripts/extract-card.py path/to/card.pdf
   ```
2. Open the generated YAML file in `data/murals/`
3. Fill in TODO fields:
   - `img`: path to the mural image (e.g., `images/murals/2025/artist-name.jpg`)
   - `category`: `shine`, `shine-legacy`, or `commercial`
   - `basedIn`: artist's home city
4. Verify extracted data is correct (especially GPS, address, bio)
5. Add the mural image to the appropriate `images/murals/YEAR/` directory
6. Build and test:
   ```bash
   python3 scripts/build-data.py
   python3 -m http.server 8080   # test locally
   ```
7. Commit and push

## Option 2: Manual Entry

1. Copy the template:
   ```bash
   cp data/murals/_template.yaml data/murals/NNN-artist-slug-YEAR.yaml
   ```
   Use the next available number for NNN.

2. Fill in all required fields:
   - `id`: next available integer
   - `artist`: full artist name
   - `year`: festival year (0 if unknown)
   - `lat`, `lng`: GPS coordinates (use Google Maps → right-click → copy coordinates)
   - `address`: street address
   - `category`: `shine`, `shine-legacy`, or `commercial`
   - `img`: path to mural image

3. Fill in optional fields as available

4. Build and test (same as above)

## Getting GPS Coordinates

1. Open Google Maps
2. Find the mural location
3. Right-click → "What's here?" or copy coordinates
4. Format: `lat: 27.7728` and `lng: -82.6348`

## Image Requirements

- Place images in `images/murals/YEAR/` (e.g., `images/murals/2025/`)
- Filename: lowercase artist slug (e.g., `aaron-tullo.jpg`)
- Supported formats: `.jpg`, `.jpeg`, `.png`, `.webp`, `.avif`
- Recommended size: 800-1200px wide
