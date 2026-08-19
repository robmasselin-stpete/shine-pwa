#!/usr/bin/env python3
"""
Generate smooth, street-following route paths using Valhalla walking directions.

Usage:
    python3 scripts/build-routes-osrm.py

Reads:   js/data.js (mural coordinates)
Writes:  js/routes.js

For each route, sends all mural waypoints to Valhalla's pedestrian routing API.
Returns detailed coordinates that follow actual streets/sidewalks.
"""

import os
import re
import json
import math
import time
import subprocess

BASE_DIR = os.path.join(os.path.dirname(__file__), '..')
DATA_FILE = os.path.join(BASE_DIR, 'js', 'data.js')
OUTPUT_FILE = os.path.join(BASE_DIR, 'js', 'routes.js')

VALHALLA_BASE = 'https://valhalla1.openstreetmap.de/route'

# Route definitions — must match ROUTE_DEFS in app.js
ROUTE_DEFS = [
    {'id': 'downtown-north',
     'ids': [6, 116, 23, 30, 1, 36, 66, 129, 109, 110, 7, 9, 111, 115, 73, 24]},
    {'id': 'the-edge',
     'ids': [119, 80, 75, 120, 57, 135, 40, 130, 89, 83, 98, 43, 34]},
    {'id': 'methodist-town',
     'ids': [4, 61, 108, 60, 24, 114, 64]},
    {'id': 'tropicana-field',
     'ids': [59, 103, 32, 20, 52, 44, 123, 87, 16, 125]},
    {'id': 'central-ave',
     'ids': [48, 122, 62, 55, 76, 71, 88, 38, 101]},
    {'id': 'arts-district',
     'ids': [140, 136, 90, 84, 72, 29, 39, 10, 25, 12, 93, 121, 50, 79]},
    {'id': 'chna-bike',
     'ids': [17, 6, 23, 30, 1, 109, 110, 7, 9, 73, 80, 98, 83, 59, 103, 44, 39, 19, 88, 38, 76, 55, 101, 62, 4, 113, 64]},
]


def haversine_miles(lat1, lon1, lat2, lon2):
    R = 3958.8
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def track_distance(coords):
    total = 0
    for i in range(1, len(coords)):
        total += haversine_miles(coords[i - 1][0], coords[i - 1][1],
                                 coords[i][0], coords[i][1])
    return round(total, 2)


def parse_murals(filepath):
    """Parse mural id/lat/lng from data.js using regex."""
    with open(filepath) as f:
        text = f.read()

    murals = {}
    for match in re.finditer(r'\{id:(\d+),.*?lat:([\d.-]+),lng:([\d.-]+)', text):
        mid = int(match.group(1))
        lat = float(match.group(2))
        lng = float(match.group(3))
        murals[mid] = (lat, lng)

    return murals


def decode_polyline6(encoded):
    """Decode Valhalla's encoded polyline (precision 6)."""
    coords = []
    i = 0
    lat = 0
    lng = 0
    while i < len(encoded):
        # Latitude
        shift = 0
        result = 0
        while True:
            b = ord(encoded[i]) - 63
            i += 1
            result |= (b & 0x1f) << shift
            shift += 5
            if b < 0x20:
                break
        dlat = ~(result >> 1) if (result & 1) else (result >> 1)
        lat += dlat

        # Longitude
        shift = 0
        result = 0
        while True:
            b = ord(encoded[i]) - 63
            i += 1
            result |= (b & 0x1f) << shift
            shift += 5
            if b < 0x20:
                break
        dlng = ~(result >> 1) if (result & 1) else (result >> 1)
        lng += dlng

        coords.append([round(lat / 1e6, 5), round(lng / 1e6, 5)])

    return coords


def fetch_valhalla_route(waypoints, costing='pedestrian'):
    """
    Query Valhalla for a walking route through all waypoints.
    waypoints: list of (lat, lng) tuples
    Returns list of [lat, lng] coordinates.
    """
    locations = [{'lat': lat, 'lon': lng} for lat, lng in waypoints]
    request_body = json.dumps({
        'locations': locations,
        'costing': costing,
        'directions_options': {'units': 'miles'}
    })

    result = subprocess.run(
        ['curl', '-s', '--max-time', '30', '-X', 'POST',
         '-H', 'Content-Type: application/json',
         '-d', request_body, VALHALLA_BASE],
        capture_output=True, text=True, timeout=35
    )

    if not result.stdout.strip():
        raise RuntimeError('Empty response from Valhalla')

    data = json.loads(result.stdout)

    if 'trip' not in data:
        raise RuntimeError(f"Valhalla error: {data.get('error', 'unknown')}")

    # Combine all leg shapes into one path
    all_coords = []
    for leg in data['trip']['legs']:
        shape = leg.get('shape', '')
        if shape:
            leg_coords = decode_polyline6(shape)
            if all_coords and leg_coords:
                # Skip first point of subsequent legs (it's the same as last point of previous)
                all_coords.extend(leg_coords[1:])
            else:
                all_coords.extend(leg_coords)

    return all_coords


def main():
    print('Parsing mural coordinates from data.js...')
    murals = parse_murals(DATA_FILE)
    print(f'  Found {len(murals)} murals with coordinates\n')

    routes = {}

    for route_def in ROUTE_DEFS:
        route_id = route_def['id']
        mural_ids = route_def['ids']
        costing = 'bicycle' if 'bike' in route_id else 'pedestrian'

        # Get waypoints for this route
        waypoints = []
        missing = []
        for mid in mural_ids:
            if mid in murals:
                waypoints.append(murals[mid])
            else:
                missing.append(mid)

        if missing:
            print(f'  WARNING: {route_id} missing murals: {missing}')

        if len(waypoints) < 2:
            print(f'  SKIP: {route_id} — fewer than 2 waypoints')
            continue

        # Close the loop: route back to the first stop
        waypoints.append(waypoints[0])

        print(f'  {route_id}: {len(waypoints)} stops, {costing} → ', end='', flush=True)

        try:
            # Split long routes into chunks of max 10 waypoints (with overlap)
            MAX_STOPS = 10
            if len(waypoints) > MAX_STOPS:
                all_path = []
                i = 0
                while i < len(waypoints) - 1:
                    chunk_end = min(i + MAX_STOPS, len(waypoints))
                    chunk = waypoints[i:chunk_end]
                    chunk_path = fetch_valhalla_route(chunk, costing)
                    if all_path and chunk_path:
                        all_path.extend(chunk_path[1:])  # skip duplicate join point
                    else:
                        all_path.extend(chunk_path)
                    i = chunk_end - 1  # overlap by 1 for continuity
                    if i < len(waypoints) - 1:
                        time.sleep(1.5)
                path = all_path
            else:
                path = fetch_valhalla_route(waypoints, costing)

            dist = track_distance(path)
            routes[route_id] = {'path': path, 'distance': dist}
            print(f'{len(path)} pts, {dist} mi')
        except Exception as e:
            print(f'FAILED: {e}')
            continue

        # Be polite to the free server
        time.sleep(1.5)

    # Write JS module
    with open(OUTPUT_FILE, 'w') as f:
        f.write('// GENERATED by scripts/build-routes-osrm.py — do not hand-edit\n')
        f.write('// Source: Valhalla pedestrian/bicycle routing API\n\n')
        f.write('export const ROUTE_PATHS = ')
        f.write(json.dumps(routes, separators=(',', ':')))
        f.write(';\n')

    size_kb = os.path.getsize(OUTPUT_FILE) / 1024
    print(f'\nWrote {OUTPUT_FILE} ({size_kb:.1f} KB, {len(routes)} route(s))')


if __name__ == '__main__':
    main()
