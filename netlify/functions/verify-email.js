exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Stripe key not configured' }) };
    }

    const { email } = JSON.parse(event.body || '{}');
    if (!email) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email required' }) };
    }

    const stripe = require('stripe')(key);

    // Look up completed checkout sessions by customer email
    const sessions = await stripe.checkout.sessions.list({
      limit: 10,
      customer_details: { email },
    });

    const paid = sessions.data.some(s => s.payment_status === 'paid');

    return { statusCode: 200, headers, body: JSON.stringify({ paid }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
