#!/usr/bin/env python3
"""
Convert KML and GPX route files into js/routes.js for the tour picker map.

Usage:
    python3 scripts/build-routes.py

Reads:   data/routes/*.kml, data/routes/*.gpx
Writes:  js/routes.js

Each file should be named {route-id}.kml or {route-id}.gpx (matching ROUTE_DEFS id
in app.js). If both exist for the same route-id, GPX takes priority.
The script extracts coordinates and simplifies with Douglas-Peucker.
"""

import os
import sys
import json
import math
import re
import glob as globmod
import xml.etree.ElementTree as ET

ROUTES_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'routes')
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), '..', 'js', 'routes.js')
MURALS_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'murals')
APP_JS = os.path.join(os.path.dirname(__file__), '..', 'js', 'app.js')

# Douglas-Peucker simplification tolerance in degrees (~1m at St. Pete latitude)
# Keep tight to preserve crosswalks and exact walking path
EPSILON = 0.00001

KML_NS = '{http://www.opengis.net/kml/2.2}'
GPX_NS = '{http://www.topografix.com/GPX/1/1}'


def haversine_miles(lat1, lon1, lat2, lon2):
    """Distance in miles between two GPS points."""
    R = 3958.8
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def track_distance(coords):
    """Total distance in miles along a list of [lat, lng] points."""
    total = 0
    for i in range(1, len(coords)):
        total += haversine_miles(coords[i-1][0], coords[i-1][1],
                                  coords[i][0], coords[i][1])
    return round(total, 2)


def perpendicular_distance(point, line_start, line_end):
    """Distance from point to line segment (in coordinate space)."""
    dx = line_end[0] - line_start[0]
    dy = line_end[1] - line_start[1]
    if dx == 0 and dy == 0:
        return math.hypot(point[0] - line_start[0], point[1] - line_start[1])
    t = ((point[0] - line_start[0]) * dx + (point[1] - line_start[1]) * dy) / (dx * dx + dy * dy)
    t = max(0, min(1, t))
    proj_x = line_start[0] + t * dx
    proj_y = line_start[1] + t * dy
    return math.hypot(point[0] - proj_x, point[1] - proj_y)


def douglas_peucker(points, epsilon):
    """Simplify a polyline using the Douglas-Peucker algorithm."""
    if len(points) <= 2:
        return points

    max_dist = 0
    max_idx = 0
    for i in range(1, len(points) - 1):
        d = perpendicular_distance(points[i], points[0], points[-1])
        if d > max_dist:
            max_dist = d
            max_idx = i

    if max_dist > epsilon:
        left = douglas_peucker(points[:max_idx + 1], epsilon)
        right = douglas_peucker(points[max_idx:], epsilon)
        return left[:-1] + right
    else:
        return [points[0], points[-1]]


def parse_kml(filepath):
    """Extract all LineString coordinates from a KML file and merge them."""
    tree = ET.parse(filepath)
    root = tree.getroot()

    all_coords = []
    for elem in root.iter(f'{KML_NS}LineString'):
        coords_text = elem.find(f'{KML_NS}coordinates').text.strip()
        # Split by whitespace (handles both newline-separated and space-separated)
        for token in coords_text.split():
            token = token.strip().rstrip(',')
            if not token:
                continue
            parts = token.split(',')
            lng, lat = float(parts[0]), float(parts[1])
            all_coords.append([lat, lng])  # Leaflet uses [lat, lng]

    return all_coords


def parse_gpx(filepath):
    """Extract track points from a GPX file."""
    tree = ET.parse(filepath)
    root = tree.getroot()

    coords = []
    for trkpt in root.iter(f'{GPX_NS}trkpt'):
        lat = float(trkpt.get('lat'))
        lon = float(trkpt.get('lon'))
        coords.append([lat, lon])

    return coords


def parse_geojson(filepath):
    """Extract coordinates from a GeoJSON file.

    If the file has alternating Point/LineString features (per-stop segments),
    returns a dict with 'segments' (list of segment coord arrays).
    Otherwise returns a flat list of coords (legacy single-path format).
    """
    with open(filepath) as f:
        data = json.load(f)

    features = data.get('features', [])

    # Detect per-segment format: starts with Point, has multiple Points as stop markers
    types = [f.get('geometry', {}).get('type') for f in features]
    num_points = types.count('Point')
    has_segments = num_points >= 3 and types[0] == 'Point'

    if has_segments:
        # Group LineStrings between consecutive Points into segments.
        # Multiple consecutive LineStrings are merged into one segment.
        # Also collect the Point coordinates (stop locations).
        segments = []
        stop_points = []
        current_seg = []
        for feat in features:
            geom = feat.get('geometry', {})
            gtype = geom.get('type')
            if gtype == 'Point':
                c = geom['coordinates']
                stop_points.append([c[1], c[0]])  # [lat, lng]
                if current_seg:
                    segments.append(current_seg)
                    current_seg = []
            elif gtype == 'LineString':
                coords = [[c[1], c[0]] for c in geom['coordinates']]
                # Skip duplicate join point
                if current_seg and current_seg[-1] == coords[0]:
                    coords = coords[1:]
                current_seg.extend(coords)
        # Final segment (closing leg back to start)
        if current_seg:
            segments.append(current_seg)
        return {'segments': segments, 'stop_points': stop_points}

    # Legacy: concatenate all LineStrings into one path
    all_coords = []
    for feat in features:
        geom = feat.get('geometry', {})
        if geom.get('type') == 'LineString':
            for coord in geom['coordinates']:
                pt = [coord[1], coord[0]]
                if all_coords and all_coords[-1] == pt:
                    continue
                all_coords.append(pt)

    return all_coords


def parse_route_defs():
    """Read ROUTE_DEFS from app.js to get route-id → ordered mural IDs."""
    with open(APP_JS) as f:
        text = f.read()
    # Find the ROUTE_DEFS array
    match = re.search(r'const ROUTE_DEFS\s*=\s*\[(.*?)\];', text, re.DOTALL)
    if not match:
        return {}
    block = match.group(1)
    defs = {}
    # Extract each { id: '...', ... ids: [...] }
    for m in re.finditer(r"\{\s*id:\s*'([^']+)'.*?ids:\s*\[([^\]]+)\]", block, re.DOTALL):
        route_id = m.group(1)
        ids = [int(x.strip()) for x in m.group(2).split(',') if x.strip()]
        defs[route_id] = ids
    return defs


def update_yaml_coords(mural_id, lat, lng):
    """Update lat/lng in a mural's YAML file."""
    pattern = os.path.join(MURALS_DIR, f'{mural_id:03d}-*.yaml')
    files = globmod.glob(pattern)
    if not files:
        return False
    filepath = files[0]
    with open(filepath) as f:
        content = f.read()

    old_lat = re.search(r'^lat:\s*(.+)$', content, re.MULTILINE)
    old_lng = re.search(r'^lng:\s*(.+)$', content, re.MULTILINE)
    if not old_lat or not old_lng:
        return False

    old_lat_val = float(old_lat.group(1).strip())
    old_lng_val = float(old_lng.group(1).strip())

    # Only update if the difference is meaningful (> ~1m)
    if abs(old_lat_val - lat) < 0.00001 and abs(old_lng_val - lng) < 0.00001:
        return False  # already aligned

    content = re.sub(r'^lat:\s*.+$', f'lat: {lat}', content, count=1, flags=re.MULTILINE)
    content = re.sub(r'^lng:\s*.+$', f'lng: {lng}', content, count=1, flags=re.MULTILINE)
    with open(filepath, 'w') as f:
        f.write(content)
    return True


def sync_stop_coords(all_stop_points):
    """Match GeoJSON stop points to mural IDs via ROUTE_DEFS, update YAMLs."""
    route_defs = parse_route_defs()
    if not route_defs:
        print('\n  WARNING: Could not parse ROUTE_DEFS from app.js, skipping coord sync')
        return

    updated = 0
    for route_id, stop_points in all_stop_points.items():
        if route_id not in route_defs:
            continue
        mural_ids = route_defs[route_id]
        if len(stop_points) != len(mural_ids):
            print(f'  {route_id}: {len(stop_points)} points != {len(mural_ids)} mural IDs, skipping sync')
            continue
        for i, mid in enumerate(mural_ids):
            lat = round(stop_points[i][0], 6)
            lng = round(stop_points[i][1], 6)
            if update_yaml_coords(mid, lat, lng):
                updated += 1
                print(f'    mural {mid}: lat/lng updated to [{lat}, {lng}]')
    if updated:
        print(f'\n  Synced {updated} mural coordinate(s) from GeoJSON stop points')
    else:
        print('\n  All mural coordinates already aligned with GeoJSON points')


def main():
    routes = {}
    all_stop_points = {}  # route_id → list of [lat, lng] from GeoJSON Points

    if not os.path.isdir(ROUTES_DIR):
        print(f'No routes directory: {ROUTES_DIR}')
        sys.exit(1)

    # Collect all route files — GPX takes priority over KML for same route-id
    # GeoJSON is also supported at the same level as GPX
    route_files = {}
    for f in sorted(os.listdir(ROUTES_DIR)):
        if f.endswith('.kml'):
            route_id = f.replace('.kml', '')
            if route_id not in route_files:
                route_files[route_id] = os.path.join(ROUTES_DIR, f)
        elif f.endswith('.gpx'):
            route_id = f.replace('.gpx', '')
            route_files[route_id] = os.path.join(ROUTES_DIR, f)  # overrides KML
        elif f.endswith('.geojson'):
            route_id = f.replace('.geojson', '')
            route_files[route_id] = os.path.join(ROUTES_DIR, f)  # overrides KML

    if not route_files:
        print('No KML or GPX files found in', ROUTES_DIR)
        sys.exit(1)

    for route_id, filepath in sorted(route_files.items()):
        ext = os.path.splitext(filepath)[1]
        if ext == '.geojson':
            coords = parse_geojson(filepath)
        elif ext == '.gpx':
            coords = parse_gpx(filepath)
        else:
            coords = parse_kml(filepath)

        if not coords:
            print(f'  WARNING: No coordinates found in {os.path.basename(filepath)}, skipping')
            continue

        # Per-segment GeoJSON format
        if isinstance(coords, dict) and 'segments' in coords:
            segments = coords['segments']
            if 'stop_points' in coords:
                all_stop_points[route_id] = coords['stop_points']
            rounded_segs = []
            total_pts = 0
            total_dist = 0
            for seg in segments:
                rseg = [[round(lat, 5), round(lng, 5)] for lat, lng in seg]
                rounded_segs.append(rseg)
                total_pts += len(seg)
                total_dist += track_distance(seg)
            routes[route_id] = {'segments': rounded_segs, 'distance': round(total_dist, 2)}
            print(f'  {route_id}: {len(segments)} segments, {total_pts} pts, {round(total_dist, 2)} mi ({ext})')
            continue

        original_count = len(coords)

        # Round to 5 decimal places (~1m precision), no simplification
        rounded = [[round(lat, 5), round(lng, 5)] for lat, lng in coords]

        dist = track_distance(coords)
        routes[route_id] = {'path': rounded, 'distance': dist}
        print(f'  {route_id}: {original_count} pts (no simplification), {dist} mi ({ext})')

    # Write JS module
    with open(OUTPUT_FILE, 'w') as f:
        f.write('// GENERATED by scripts/build-routes.py — do not hand-edit\n')
        f.write('// Source: data/routes/*.kml, data/routes/*.gpx\n\n')
        f.write('export const ROUTE_PATHS = ')
        f.write(json.dumps(routes, separators=(',', ':')))
        f.write(';\n')

    size_kb = os.path.getsize(OUTPUT_FILE) / 1024
    print(f'\nWrote {OUTPUT_FILE} ({size_kb:.1f} KB, {len(routes)} route(s))')

    # Sync GeoJSON stop point coords → mural YAML files
    if all_stop_points:
        print('\nSyncing mural coordinates from GeoJSON stop points...')
        sync_stop_coords(all_stop_points)


if __name__ == '__main__':
    sys.setrecursionlimit(5000)
    main()
