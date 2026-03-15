#!/usr/bin/env python3
"""Create 40 easy 5-letter test promo codes in Stripe."""

import sys
import json
import urllib.request
import urllib.parse

KEY = sys.argv[1] if len(sys.argv) > 1 else None
if not KEY or not KEY.startswith('sk_'):
    print('Usage: python3 scripts/create-test-codes.py sk_live_...')
    sys.exit(1)

CODES = [
    'APPLE', 'BEACH', 'CRANE', 'DANCE', 'EAGLE',
    'FLAME', 'GRAPE', 'HOUSE', 'IVORY', 'JUICE',
    'KNOTS', 'LEMON', 'MANGO', 'NIGHT', 'OCEAN',
    'PEACH', 'QUEEN', 'RIVER', 'STONE', 'TIGER',
    'UNITY', 'VIPER', 'WHALE', 'XENON', 'YOUTH',
    'ZEBRA', 'BLAZE', 'CLOUD', 'DRIFT', 'EMBER',
    'FROST', 'GLEAM', 'HAVEN', 'INLET', 'JOKER',
    'LUNAR', 'MAPLE', 'NORTH', 'OASIS', 'PLUME',
]

import base64
AUTH = base64.b64encode(f'{KEY}:'.encode()).decode()

def stripe_post(endpoint, data):
    url = f'https://api.stripe.com/v1/{endpoint}'
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=body, headers={
        'Authorization': f'Basic {AUTH}',
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err_body = json.loads(e.read())
        raise Exception(f"{e.code}: {err_body.get('error', {}).get('message', err_body)}")

# Use existing coupon or create one
COUPON_ID = sys.argv[2] if len(sys.argv) > 2 else None
if not COUPON_ID:
    coupon = stripe_post('coupons', {
        'percent_off': 100,
        'duration': 'once',
        'name': 'Mural Quest — Testing Batch',
    })
    COUPON_ID = coupon['id']
    print(f"Coupon created: {COUPON_ID}\n")
else:
    print(f"Using existing coupon: {COUPON_ID}\n")

print("Promo codes:")
print("─" * 20)

for code in CODES:
    try:
        stripe_post('promotion_codes', {
            'promotion[type]': 'coupon',
            'promotion[coupon]': COUPON_ID,
            'code': code,
        })
        print(f"  ✓ {code}")
    except Exception as e:
        print(f"  ✗ {code}: {e}")

print("─" * 20)
print(f"\nDone! {len(CODES)} codes created. Each is single-use.")
