// tour-counter — anonymous aggregate counter for tour starts.
//
// POST { tourId: "downtown-north" }   → { count: <new total for that tour> }
// GET  ?token=<TOUR_COUNTER_TOKEN>     → { "downtown-north": 42, "the-edge": 17, ... }
//
// What we store: just an integer per tour ID. No IP, no device ID, no timestamp,
// no user identifier. Lossy on purpose so it's compliant by construction.
//
// Set TOUR_COUNTER_TOKEN in Netlify env vars to gate the GET endpoint.

const { getStore } = require('@netlify/blobs');

const VALID_TOUR_IDS = new Set([
  'downtown-north',
  'the-edge',
  'methodist-town',
  'tropicana-field',
  'central-ave',
  'arts-district',
  'pinellas-trail',
  'chna-bike',
]);

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    const store = getStore('tour-counts');

    if (event.httpMethod === 'GET') {
      const token = event.queryStringParameters?.token || '';
      const expected = process.env.TOUR_COUNTER_TOKEN || '';
      if (!expected || token !== expected) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'unauthorized' }) };
      }
      const counts = (await store.getJSON('counts')) || {};
      return { statusCode: 200, headers, body: JSON.stringify(counts) };
    }

    if (event.httpMethod === 'POST') {
      const { tourId } = JSON.parse(event.body || '{}');
      if (!tourId || typeof tourId !== 'string' || !VALID_TOUR_IDS.has(tourId)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid tourId' }) };
      }
      const counts = (await store.getJSON('counts')) || {};
      counts[tourId] = (counts[tourId] || 0) + 1;
      await store.setJSON('counts', counts);
      return { statusCode: 200, headers, body: JSON.stringify({ count: counts[tourId] }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
