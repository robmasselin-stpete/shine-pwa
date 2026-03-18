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
import xml.etree.ElementTree as ET

ROUTES_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'routes')
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), '..', 'js', 'routes.js')

# Douglas-Peucker simplification tolerance in degrees (~10m at St. Pete latitude)
EPSILON = 0.0001

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


def main():
    routes = {}

    if not os.path.isdir(ROUTES_DIR):
        print(f'No routes directory: {ROUTES_DIR}')
        sys.exit(1)

    # Collect all route files — GPX takes priority over KML for same route-id
    route_files = {}
    for f in sorted(os.listdir(ROUTES_DIR)):
        if f.endswith('.kml'):
            route_id = f.replace('.kml', '')
            if route_id not in route_files:
                route_files[route_id] = os.path.join(ROUTES_DIR, f)
        elif f.endswith('.gpx'):
            route_id = f.replace('.gpx', '')
            route_files[route_id] = os.path.join(ROUTES_DIR, f)  # overrides KML

    if not route_files:
        print('No KML or GPX files found in', ROUTES_DIR)
        sys.exit(1)

    for route_id, filepath in sorted(route_files.items()):
        ext = os.path.splitext(filepath)[1]
        if ext == '.gpx':
            coords = parse_gpx(filepath)
        else:
            coords = parse_kml(filepath)

        if not coords:
            print(f'  WARNING: No coordinates found in {os.path.basename(filepath)}, skipping')
            continue

        original_count = len(coords)
        simplified = douglas_peucker(coords, EPSILON)

        # Round to 5 decimal places (~1m precision)
        simplified = [[round(lat, 5), round(lng, 5)] for lat, lng in simplified]

        dist = track_distance(coords)
        routes[route_id] = {'path': simplified, 'distance': dist}
        print(f'  {route_id}: {original_count} pts → {len(simplified)} pts, {dist} mi ({ext})')

    # Write JS module
    with open(OUTPUT_FILE, 'w') as f:
        f.write('// GENERATED by scripts/build-routes.py — do not hand-edit\n')
        f.write('// Source: data/routes/*.kml, data/routes/*.gpx\n\n')
        f.write('export const ROUTE_PATHS = ')
        f.write(json.dumps(routes, separators=(',', ':')))
        f.write(';\n')

    size_kb = os.path.getsize(OUTPUT_FILE) / 1024
    print(f'\nWrote {OUTPUT_FILE} ({size_kb:.1f} KB, {len(routes)} route(s))')


if __name__ == '__main__':
    sys.setrecursionlimit(5000)
    main()
