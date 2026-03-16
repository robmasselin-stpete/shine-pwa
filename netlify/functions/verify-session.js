exports.handler = async (event) => {
  const sessionId = event.queryStringParameters?.session_id;

  if (!sessionId) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing session_id' }),
    };
  }

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
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const email = session.customer_details?.email || '';
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paid: session.payment_status === 'paid' || session.payment_status === 'no_payment_required', email }),
    };
  } catch (err) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid session' }),
    };
  }
};
