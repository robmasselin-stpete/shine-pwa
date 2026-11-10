// mural-quest analytics — first-party event collector (v1.5).
//
//   POST /e      body { events: [{ ts, sid, event, props }] }  → writes to D1
//   GET  /stats?key=<STATS_KEY>[&from=YYYY-MM-DD&to=YYYY-MM-DD&tz=<min>] → basic aggregates
//        from/to (inclusive) are calendar days in the viewer's time zone; tz = minutes
//        east of UTC (St. Pete: -300 in winter, -240 in summer). With no range: all time.
//        Rob's own devices (sids in the excluded_sids table) are left out unless &mine=1.
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
    // no-store so the /stats endpoint always returns fresh aggregates (Cloudflare was
    // edge-caching the response by URL, serving stale numbers on repeat requests).
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
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
      // Optional date range. Filters on ts (epoch ms) so a "day" is the viewer's local day,
      // not the stored UTC `day` (in St. Pete, everything after 7 pm lands on the next UTC day).
      const dayRe = /^\d{4}-\d{2}-\d{2}$/;
      const tzRaw = Number(url.searchParams.get('tz'));
      const tz = Number.isFinite(tzRaw) && Math.abs(tzRaw) <= 840 ? Math.round(tzRaw) : 0;
      const from = url.searchParams.get('from'), to = url.searchParams.get('to');
      const dayStart = (d) => Date.parse(d + 'T00:00:00Z') - tz * 60000;
      const ranged = !!(from && to && dayRe.test(from) && dayRe.test(to) && from <= to);
      const lo = ranged ? dayStart(from) : 0;
      const hi = ranged ? dayStart(to) + 86400000 : 8.64e15;
      // Leave out Rob's own devices (testing distorts the numbers) unless &mine=1. The list is
      // the excluded_sids table, so adding a device is a D1 insert, not a deploy. If the table
      // is missing, nothing is excluded rather than the stats failing.
      const mine = url.searchParams.get('mine') === '1';
      let ex = [];
      if (!mine) {
        try { ex = (await env.DB.prepare('SELECT sid FROM excluded_sids').all()).results.map((r) => r.sid); } catch {}
      }
      const W = 'ts >= ?1 AND ts < ?2' + (ex.length ? ` AND sid NOT IN (${ex.map((_, i) => '?' + (i + 3)).join(',')})` : '');
      const args = [lo, hi, ...ex];
      const localDay = `strftime('%Y-%m-%d', ts / 1000 + ${tz * 60}, 'unixepoch')`;   // tz is a validated integer
      const rows = async (sql) => (await env.DB.prepare(sql).bind(...args).all()).results;
      const [total, byEvent, byDay, topMurals, qrSources] = await Promise.all([
        env.DB.prepare(`SELECT COUNT(*) n, COUNT(DISTINCT sid) sessions FROM events WHERE ${W}`).bind(...args).first(),
        rows(`SELECT event, COUNT(*) n FROM events WHERE ${W} GROUP BY event ORDER BY n DESC LIMIT 30`),
        rows(`SELECT ${localDay} day, COUNT(*) n, COUNT(DISTINCT sid) sessions FROM events WHERE ${W} GROUP BY ${localDay} ORDER BY day DESC LIMIT ${ranged ? 400 : 30}`),
        // GROUP BY the expression (not the alias): the events table has its OWN `id` column
        // (row PK), so `GROUP BY id` was grouping by unique row id → every mural showed n=1.
        // CAST to INTEGER also folds numeric vs string ids logged by different app builds.
        rows(`SELECT CAST(json_extract(props,'$.id') AS INTEGER) id, COUNT(*) n FROM events WHERE ${W} AND event='mural_open' AND json_extract(props,'$.id') IS NOT NULL GROUP BY CAST(json_extract(props,'$.id') AS INTEGER) ORDER BY n DESC LIMIT 250`),
        // QR lead-source scans (from the app-download redirect page).
        rows(`SELECT json_extract(props,'$.source') source, COUNT(*) n, SUM(json_extract(props,'$.device')='ios') ios, SUM(json_extract(props,'$.device')='android') android FROM events WHERE ${W} AND event='qr_scan' AND json_extract(props,'$.source') IS NOT NULL GROUP BY json_extract(props,'$.source') ORDER BY n DESC LIMIT 50`),
      ]);
      return json({ total, byEvent, byDay, topMurals, qrSources,
                    range: ranged ? { from, to, tz } : null,
                    excluded: mine ? null : ex.length });
    }

    return new Response('mural-quest analytics', { status: 200, headers: CORS });
  },
};
