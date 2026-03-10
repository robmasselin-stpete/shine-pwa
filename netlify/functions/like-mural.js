const { getStore } = require('@netlify/blobs');

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
    const store = getStore('mural-likes');

    // GET — return all like counts
    if (event.httpMethod === 'GET') {
      const counts = await store.getJSON('counts') || {};
      return { statusCode: 200, headers, body: JSON.stringify(counts) };
    }

    // POST — increment a mural's like count
    if (event.httpMethod === 'POST') {
      const { muralId } = JSON.parse(event.body || '{}');
      if (!muralId && muralId !== 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'muralId required' }) };
      }

      const counts = await store.getJSON('counts') || {};
      const key = String(muralId);
      counts[key] = (counts[key] || 0) + 1;
      await store.setJSON('counts', counts);

      return { statusCode: 200, headers, body: JSON.stringify({ likes: counts[key] }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
