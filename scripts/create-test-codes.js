#!/usr/bin/env node
// Creates 40 easy 5-letter test promo codes in Stripe
// Usage: node scripts/create-test-codes.js sk_live_YOUR_KEY

const key = process.argv[2];
if (!key || !key.startsWith('sk_')) {
  console.error('Usage: node scripts/create-test-codes.js sk_live_...');
  process.exit(1);
}

const stripe = require('stripe')(key);

const CODES = [
  'APPLE', 'BEACH', 'CRANE', 'DANCE', 'EAGLE',
  'FLAME', 'GRAPE', 'HOUSE', 'IVORY', 'JUICE',
  'KNOTS', 'LEMON', 'MANGO', 'NIGHT', 'OCEAN',
  'PEACH', 'QUEEN', 'RIVER', 'STONE', 'TIGER',
  'UNITY', 'VIPER', 'WHALE', 'XENON', 'YOUTH',
  'ZEBRA', 'BLAZE', 'CLOUD', 'DRIFT', 'EMBER',
  'FROST', 'GLEAM', 'HAVEN', 'INLET', 'JOKER',
  'LUNAR', 'MAPLE', 'NORTH', 'OASIS', 'PLUME',
];

async function main() {
  const coupon = await stripe.coupons.create({
    percent_off: 100,
    duration: 'once',
    name: 'Mural Quest — Testing Batch',
    max_redemptions: 40,
  });
  console.log(`Coupon created: ${coupon.id}\n`);

  console.log('Promo codes:');
  console.log('─'.repeat(20));

  for (const code of CODES) {
    await stripe.promotionCodes.create({
      coupon: coupon.id,
      code,
      max_redemptions: 1,
    });
    console.log(code);
  }

  console.log('─'.repeat(20));
  console.log(`\nDone! ${CODES.length} codes created. Each is single-use.`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
