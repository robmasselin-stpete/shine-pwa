// js/analytics.js — first-party, privacy-clean usage analytics (v1.5).
//
// Anonymous session id + offline-queued events, flushed via sendBeacon to the
// analytics Worker (analytics.muralquest.app). No PII, no IP, no cross-app
// tracking. Entirely best-effort: any failure is swallowed and never affects
// the app. Beacons use a text/plain body to stay a "simple" CORS request (no
// preflight); the Worker parses the JSON regardless of content-type.

const ENDPOINT = 'https://analytics.muralquest.app/e';
const SID_KEY = 'mq_sid';
const QUEUE_KEY = 'mq_evq';
const MAX_QUEUE = 200;
const FLUSH_DELAY_MS = 4000;

function sid() {
  try {
    let s = localStorage.getItem(SID_KEY);
    if (!s) {
      s = 'x' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
      localStorage.setItem(SID_KEY, s);
    }
    return s;
  } catch { return 'anon'; }
}

let queue = [];
try { queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { queue = []; }
function persist() { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE))); } catch {} }

let flushTimer = null;
function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => { flushTimer = null; flush(); }, FLUSH_DELAY_MS);
}

/** Record a usage event. props must be small, non-personal (e.g. {id, tab, term}). */
export function track(event, props) {
  try {
    queue.push({ ts: Date.now(), sid: sid(), event: String(event), props: props || {} });
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    persist();
    scheduleFlush();
  } catch {}
}

/** Send queued events. Called on a timer, on going online, and on the way out. */
export function flush() {
  try {
    if (!queue.length) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const batch = queue.slice(0, 50);
    const payload = JSON.stringify({ events: batch });
    let ok = false;
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      ok = navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'text/plain' }));
    } else {
      fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: payload, keepalive: true }).catch(() => {});
      ok = true;
    }
    if (ok) { queue = queue.slice(batch.length); persist(); }
  } catch {}
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', flush);
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
}
