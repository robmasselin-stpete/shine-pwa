exports.handler = async (event) => {
  try {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Stripe key not configured' }),
      };
    }

    const stripe = require('stripe')(key);
    const origin = event.headers.origin || event.headers.referer?.replace(/\/$/, '') || 'https://legendary-bonbon-a5b20a.netlify.app';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Mural Quest — St. Pete',
            description: '2-month access to self-guided mural tours',
          },
          unit_amount: 399,
        },
        quantity: 1,
      }],
      mode: 'payment',
      allow_promotion_codes: true,
      success_url: `${origin}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: origin,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
