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
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Mural Quest — St. Pete',
            description: 'Access to self-guided mural tours in St. Pete',
          },
          unit_amount: 499,
        },
        quantity: 1,
      }],
      mode: 'payment',
      allow_promotion_codes: true,
      payment_method_collection: 'if_required',
      custom_text: {
        submit: {
          message: 'Enter your email above — this is how we verify your access. Then click Continue.',
        },
      },
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
