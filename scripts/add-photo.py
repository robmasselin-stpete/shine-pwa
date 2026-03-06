#!/usr/bin/env python3
"""
add-photo.py — Import a photo into a mural's YAML file

Takes your photo and a mural YAML file. Reads GPS from the photo's EXIF,
copies the photo to images/murals/YEAR/, and updates the YAML with:
  - img: path to the new image
  - lat/lng: from your photo's GPS (where you stood to see the mural)

Usage:
    python3 scripts/add-photo.py data/murals/001-aaron-tullo-2025.yaml ~/Photos/IMG_1234.jpeg
    python3 scripts/add-photo.py 001-aaron-tullo-2025.yaml ~/Desktop/mural.jpg

    # Just read GPS from a photo (no YAML update):
    python3 scripts/add-photo.py --gps ~/Photos/IMG_1234.jpeg
"""

import os
import sys
import re
import shutil
import unicodedata

try:
    from PIL import Image
    from PIL.ExifTags import TAGS, GPSTAGS
except ImportError:
    print("ERROR: Pillow required. Run: pip3 install Pillow")
    sys.exit(1)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
MURALS_DIR = os.path.join(PROJECT_ROOT, 'data', 'murals')
IMAGES_DIR = os.path.join(PROJECT_ROOT, 'images', 'murals')


def get_exif_gps(image_path):
    """Extract GPS coordinates from image EXIF data. Returns (lat, lng) or (None, None)."""
    try:
        img = Image.open(image_path)
        exif_data = img._getexif()
    except Exception as e:
        print(f"  Could not read EXIF: {e}")
        return None, None

    if not exif_data:
        return None, None

    gps_info = {}
    for tag_id, value in exif_data.items():
        tag = TAGS.get(tag_id, tag_id)
        if tag == 'GPSInfo':
            for gps_tag_id, gps_value in value.items():
                gps_tag = GPSTAGS.get(gps_tag_id, gps_tag_id)
                gps_info[gps_tag] = gps_value

    if not gps_info:
        return None, None

    def dms_to_decimal(dms, ref):
        """Convert degrees/minutes/seconds to decimal degrees."""
        degrees = float(dms[0])
        minutes = float(dms[1])
        seconds = float(dms[2])
        decimal = degrees + minutes / 60 + seconds / 3600
        if ref in ('S', 'W'):
            decimal = -decimal
        return round(decimal, 6)

    try:
        lat = dms_to_decimal(
            gps_info['GPSLatitude'],
            gps_info['GPSLatitudeRef']
        )
        lng = dms_to_decimal(
            gps_info['GPSLongitude'],
            gps_info['GPSLongitudeRef']
        )
        return lat, lng
    except (KeyError, TypeError, IndexError) as e:
        print(f"  GPS data incomplete: {e}")
        return None, None


def slugify(text):
    text = unicodedata.normalize('NFKD', text)
    text = text.encode('ascii', 'ignore').decode('ascii')
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '-', text)
    return text.strip('-')


def read_yaml_field(content, field):
    """Read a simple scalar field from YAML content."""
    match = re.search(rf'^{field}:\s*["\']?([^"\'\n]*)["\']?\s*$', content, re.MULTILINE)
    if match:
        return match.group(1).strip()
    return ''


def update_yaml_field(content, field, value):
    """Update a simple scalar field in YAML content."""
    # Match the field line and replace the value
    pattern = rf'^({field}:\s*).*$'
    replacement = rf'\g<1>{value}'
    new_content, count = re.subn(pattern, replacement, content, count=1, flags=re.MULTILINE)
    if count == 0:
        print(f"  WARNING: field '{field}' not found in YAML")
    return new_content


def main():
    # Handle --gps mode (just read GPS from a photo)
    if '--gps' in sys.argv:
        photo_path = [a for a in sys.argv[1:] if a != '--gps'][0]
        photo_path = os.path.expanduser(photo_path)
        lat, lng = get_exif_gps(photo_path)
        if lat and lng:
            print(f"GPS: {lat}, {lng}")
            print(f"  lat: {lat}")
            print(f"  lng: {lng}")
            print(f"  Google Maps: https://maps.google.com/?q={lat},{lng}")
        else:
            print("No GPS data found in this image.")
        return

    if len(sys.argv) < 3:
        print("Usage: python3 scripts/add-photo.py <yaml-file> <photo>")
        print("       python3 scripts/add-photo.py --gps <photo>")
        sys.exit(1)

    yaml_path = sys.argv[1]
    photo_path = os.path.expanduser(sys.argv[2])

    # Resolve YAML path (allow just filename)
    if not os.path.exists(yaml_path):
        yaml_path = os.path.join(MURALS_DIR, yaml_path)
    if not os.path.exists(yaml_path):
        print(f"ERROR: YAML file not found: {sys.argv[1]}")
        sys.exit(1)

    if not os.path.exists(photo_path):
        print(f"ERROR: Photo not found: {photo_path}")
        sys.exit(1)

    # Read YAML
    with open(yaml_path, 'r', encoding='utf-8') as f:
        content = f.read()

    artist = read_yaml_field(content, 'artist')
    year = read_yaml_field(content, 'year')

    print(f"Mural: {artist} ({year})")
    print(f"Photo: {photo_path}")

    # 1. Read GPS from photo
    lat, lng = get_exif_gps(photo_path)
    if lat and lng:
        print(f"  GPS found: {lat}, {lng}")
        print(f"  Google Maps: https://maps.google.com/?q={lat},{lng}")
    else:
        print("  WARNING: No GPS in photo. lat/lng will NOT be updated.")
        print("  You can set them manually in the YAML file.")

    # 2. Copy photo to images/murals/YEAR/
    ext = os.path.splitext(photo_path)[1].lower()
    slug = slugify(artist)
    dest_dir = os.path.join(IMAGES_DIR, str(year))
    os.makedirs(dest_dir, exist_ok=True)

    dest_filename = f"{slug}{ext}"
    dest_path = os.path.join(dest_dir, dest_filename)

    # Check for conflict
    if os.path.exists(dest_path):
        print(f"  Image already exists: {dest_path}")
        print(f"  Overwrite? [y/N] ", end='')
        answer = input().strip().lower()
        if answer != 'y':
            print("  Skipped image copy.")
            return

    shutil.copy2(photo_path, dest_path)
    img_relative = f"images/murals/{year}/{dest_filename}"
    print(f"  Copied to: {img_relative}")

    # 3. Update YAML
    content = update_yaml_field(content, 'img', f'"{img_relative}"')

    if lat and lng:
        content = update_yaml_field(content, 'lat', str(lat))
        content = update_yaml_field(content, 'lng', str(lng))

    with open(yaml_path, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"\n  Updated: {os.path.basename(yaml_path)}")
    print(f"  Run 'python3 scripts/build-data.py --dry-run' to validate")


if __name__ == '__main__':
    main()
