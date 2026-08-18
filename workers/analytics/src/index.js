// mural-quest analytics — first-party event collector (v1.5).
//
//   POST /e      body { events: [{ ts, sid, event, props }] }  → writes to D1
//   GET  /stats?key=<STATS_KEY>                                 → basic aggregates
//   OPTIONS *                                                   → CORS preflight
//
// Privacy: anonymous session ids only. No PII, no IP address, no cross-app
// tracking is stored. Usage-only data.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // ── Ingest a batch of events ──────────────────────────────────────────────
    if (request.method === 'POST' && url.pathname === '/e') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
      const events = Array.isArray(body && body.events) ? body.events : [];
      if (!events.length) return json({ ok: true, n: 0 });

      const now = Date.now();
      const rows = events.slice(0, 50).map((e) => {
        const ts = Number(e && e.ts) || now;
        const day = new Date(ts).toISOString().slice(0, 10);
        return env.DB
          .prepare('INSERT INTO events (ts, day, sid, event, props) VALUES (?,?,?,?,?)')
          .bind(
            ts,
            day,
            String((e && e.sid) || '').slice(0, 64),
            String((e && e.event) || '').slice(0, 64),
            JSON.stringify((e && e.props) || {}).slice(0, 1000),
          );
      });
      try { await env.DB.batch(rows); } catch { return json({ error: 'db' }, 500); }
      return json({ ok: true, n: rows.length });
    }

    // ── Basic aggregates (admin, gated by STATS_KEY) ──────────────────────────
    if (request.method === 'GET' && url.pathname === '/stats') {
      if (!env.STATS_KEY || url.searchParams.get('key') !== env.STATS_KEY) {
        return json({ error: 'unauthorized' }, 401);
      }
      const rows = async (sql) => (await env.DB.prepare(sql).all()).results;
      const [total, byEvent, byDay, topMurals] = await Promise.all([
        env.DB.prepare('SELECT COUNT(*) n, COUNT(DISTINCT sid) sessions FROM events').first(),
        rows('SELECT event, COUNT(*) n FROM events GROUP BY event ORDER BY n DESC LIMIT 30'),
        rows('SELECT day, COUNT(*) n, COUNT(DISTINCT sid) sessions FROM events GROUP BY day ORDER BY day DESC LIMIT 30'),
        // GROUP BY the expression (not the alias): the events table has its OWN `id` column
        // (row PK), so `GROUP BY id` was grouping by unique row id → every mural showed n=1.
        // CAST to INTEGER also folds numeric vs string ids logged by different app builds.
        rows("SELECT CAST(json_extract(props,'$.id') AS INTEGER) id, COUNT(*) n FROM events WHERE event='mural_open' AND json_extract(props,'$.id') IS NOT NULL GROUP BY CAST(json_extract(props,'$.id') AS INTEGER) ORDER BY n DESC LIMIT 20"),
      ]);
      return json({ total, byEvent, byDay, topMurals });
    }

    return new Response('mural-quest analytics', { status: 200, headers: CORS });
  },
};
