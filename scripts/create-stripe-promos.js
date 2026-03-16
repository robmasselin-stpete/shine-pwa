#!/usr/bin/env node
/**
 * One-time script to create 50 promo codes in Stripe.
 * Creates a 100% off coupon, then 50 promotion codes linked to it.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_xxx node scripts/create-stripe-promos.js
 */

const CODES = [
  'SHINE', 'MURAL', 'PAINT', 'BRUSH', 'COLOR', 'BLOOM', 'SPARK', 'FLAME', 'OCEAN', 'BEACH',
  'CORAL', 'WHALE', 'CRANE', 'HERON', 'LOTUS', 'SUNNY', 'STORM', 'CLOUD', 'LIGHT', 'DREAM',
  'MAGIC', 'GRACE', 'BRAVE', 'PRIDE', 'PEARL', 'CROWN', 'ROYAL', 'TIGER', 'EAGLE', 'RAVEN',
  'GHOST', 'LUNAR', 'SOLAR', 'NORTH', 'SOUTH', 'URBAN', 'FRESH', 'VIVID', 'FLASH', 'SWIFT',
  'DELTA', 'HAVEN', 'CREST', 'BLAZE', 'PULSE', 'DRIFT', 'GLEAM', 'PRISM', 'FROST', 'STONE',
];

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error('Set STRIPE_SECRET_KEY env var');
    process.exit(1);
  }

  const stripe = require('stripe')(key);

  // 1. Create a 100% off coupon
  console.log('Creating 100% off coupon...');
  const coupon = await stripe.coupons.create({
    percent_off: 100,
    duration: 'once',
    name: 'Mural Quest — Free Access',
  });
  console.log(`  Coupon created: ${coupon.id}`);

  // 2. Create promotion codes
  let created = 0;
  let skipped = 0;
  for (const code of CODES) {
    try {
      await stripe.promotionCodes.create({
        coupon: coupon.id,
        code: code,
        active: true,
      });
      created++;
      process.stdout.write(`  ${code} `);
    } catch (err) {
      if (err.message.includes('already been taken')) {
        skipped++;
        process.stdout.write(`  ${code}(exists) `);
      } else {
        console.error(`\n  Error creating ${code}: ${err.message}`);
      }
    }
  }

  console.log(`\n\nDone! Created ${created}, skipped ${skipped} (already existed).`);
}

main().catch(err => { console.error(err); process.exit(1); });
