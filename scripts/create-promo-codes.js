#!/usr/bin/env node
// One-time script: creates a 100%-off coupon and 20 unique promo codes in Stripe
// Usage: node scripts/create-promo-codes.js sk_test_YOUR_KEY_HERE

const key = process.argv[2];
if (!key || !key.startsWith('sk_')) {
  console.error('Usage: node scripts/create-promo-codes.js sk_test_...');
  process.exit(1);
}

const stripe = require('stripe')(key);

const PREFIXES = [
  'STPETE', 'MURAL', 'QUEST', 'ARTWALK',
  'SHINE', 'SUNNY', 'DTSP', 'WELCOME',
  'EXPLORE', 'FRIEND',
];

// Generate 20 unique codes like STPETE-A1B2, MURAL-C3D4, etc.
function generateCodes(count) {
  const codes = new Set();
  let i = 0;
  while (codes.size < count) {
    const prefix = PREFIXES[i % PREFIXES.length];
    const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    codes.add(`${prefix}-${suffix}`);
    i++;
  }
  return [...codes];
}

async function main() {
  // Create a coupon: 100% off, one-time use
  const coupon = await stripe.coupons.create({
    percent_off: 100,
    duration: 'once',
    name: 'Mural Quest — Free Access (Testing)',
    max_redemptions: 20,
  });
  console.log(`Coupon created: ${coupon.id}\n`);

  // Create 20 promo codes
  const codes = generateCodes(20);
  console.log('Promo codes:');
  console.log('─'.repeat(30));

  for (const code of codes) {
    await stripe.promotionCodes.create({
      coupon: coupon.id,
      code,
      max_redemptions: 1,
    });
    console.log(code);
  }

  console.log('─'.repeat(30));
  console.log(`\nDone! ${codes.length} codes created. Each is single-use.`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
