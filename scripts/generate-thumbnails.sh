#!/bin/bash
# Generate 96x96 thumbnails for map icons (displayed at 48x48, 2x for retina)
# Uses macOS sips — no external dependencies

SRC="images/murals"
DEST="images/thumbs"

mkdir -p "$DEST"

count=0
skipped=0

while IFS= read -r file; do
  # Preserve subdirectory structure: images/murals/2025/foo.jpeg → images/thumbs/2025/foo.jpeg
  rel="${file#$SRC/}"
  dest="$DEST/$rel"
  destdir="$(dirname "$dest")"
  mkdir -p "$destdir"

  # Skip if thumbnail already exists and is newer than source
  if [ -f "$dest" ] && [ "$dest" -nt "$file" ]; then
    skipped=$((skipped + 1))
    continue
  fi

  # Copy then resize — sips modifies in place
  cp "$file" "$dest"
  sips --resampleHeightWidthMax 96 "$dest" >/dev/null 2>&1
  count=$((count + 1))
done < <(find "$SRC" -type f \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" -o -name "*.webp" \))

echo "Generated $count thumbnails, skipped $skipped up-to-date"
