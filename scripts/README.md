# SHINE Mural Data Pipeline

**START HERE.** This directory contains everything needed to manage mural data for the SHINE PWA.

## What This Does

Each mural's data lives in its own YAML file (`data/murals/*.yaml`). A build script compiles approved YAML files into `js/data.js`, which the app consumes. No JavaScript editing needed — just edit YAML and build.

## Architecture

```
data/murals/*.yaml  +  data/config.yaml
          │
    [build-data.py]       ← run locally before git push
          │
    js/data.js (GENERATED — never hand-edit)
          │
    app.js (unchanged — consumes data.js as before)
```

## Prerequisites

```bash
python3 --version          # 3.8+
pip3 install -r scripts/requirements.txt
```

## Quickstart

```bash
# 1. Build data.js from approved YAML files
python3 scripts/build-data.py

# 2. Validate without writing (dry run)
python3 scripts/build-data.py --dry-run

# 3. See which murals need bio enhancement
python3 scripts/build-data.py --list-stale
```

## Adding a Mural

### With a detail card PDF:
```bash
python3 scripts/extract-card.py path/to/card.pdf
# Edit the generated YAML — fill in GPS, category, image
python3 scripts/build-data.py
```

### Without a PDF:
```bash
cp data/murals/_template.yaml data/murals/NNN-artist-name-YEAR.yaml
# Fill in all fields manually
python3 scripts/build-data.py
```

## Fixing Data

Edit the YAML file directly, then rebuild:
```bash
# Fix a bio, GPS, or any field
vim data/murals/042-artist-name-2023.yaml
python3 scripts/build-data.py
```

## Enhancing Bios with Claude

1. Open a YAML file and paste it into Claude
2. Ask Claude to rewrite the bio using the detail card PDF and web research
3. Copy enhanced fields back into the YAML
4. Update provenance: `source: "claude-enhanced"`
5. `python3 scripts/build-data.py`

See `docs/ENHANCING-WITH-CLAUDE.md` for detailed prompts.

## YAML Field Reference

### Required
| Field | Type | Example |
|-------|------|---------|
| `id` | int | `42` |
| `artist` | string | `"Aaron Tullo"` |
| `year` | int | `2025` (0 if unknown) |
| `lat` | float/null | `27.7728` |
| `lng` | float/null | `-82.6348` |
| `address` | string | `"253 2nd Ave N"` |
| `category` | string | `shine`, `shine-legacy`, `commercial` |
| `img` | string | `"images/murals/2025/aaron-tullo.jpg"` |

### Optional
| Field | Type |
|-------|------|
| `title` | Mural title |
| `building` | Building name |
| `instagram` | Handle (no @) |
| `basedIn` | City, State |
| `artistBio` | Multi-line bio (use `\|` block) |
| `muralDescription` | What the mural looks like |
| `muralInspiration` | Artist's inspiration |
| `muralAwards` | Awards for this mural |
| `artistAwards` | General artist awards |

### Provenance (not exported to data.js)
| Field | Values |
|-------|--------|
| `source` | `legacy`, `detail-card`, `claude-enhanced`, `manual` |
| `sourceNotes` | Free text notes |

## File Naming Convention

`{NNN}-{artist-slug}-{year}.yaml`

- 3-digit zero-padded ID
- Slugified artist name (lowercase, hyphens)
- Year or "unknown"

Examples: `001-aaron-tullo-2025.yaml`, `042-bask-2020.yaml`

## Scripts

| Script | Purpose |
|--------|---------|
| `build-data.py` | Compile YAML → data.js |
| `extract-card.py` | Extract detail card PDF → YAML |
| `migrate.py` | One-time: data.js → YAML (reference only) |

## Troubleshooting

**"No YAML files found"** — Run `migrate.py` first, or add files manually.

**"duplicate ID"** — Two YAML files have the same `id:` value. Fix one.

**"image not found"** — The `img:` path doesn't point to an existing file. Check the path.

**"lat outside Tampa Bay bounds"** — GPS coordinates look wrong. Verify on Google Maps.

**Build passes but app looks wrong** — Check browser console for JS errors. The generated data.js should be valid ES module syntax.
