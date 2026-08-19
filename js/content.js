// js/content.js — v1.5 content-architecture client layer.
//
// data.js / routes.js remain the BUNDLED FALLBACK. This layer applies newer
// content fetched from the CDN by mutating the SAME array instances in place, so
// every existing `import { murals } from './data.js'` reference in app.js stays
// valid without changing a single call site.
//
// Bundled data always renders first (see app.js init). Remote content is an
// enhancement, never a requirement — the app is fully functional offline.

import { murals, pois, YEARS } from './data.js';
import { ROUTE_DEFS, ROUTE_PATHS } from './routes.js';
import { BUNDLED_CONTENT } from './content-meta.js';

// Where the OTA manifest lives — Cloudflare R2 bucket 'muralquest-content' via its
// custom domain. Empty string would disable remote (bundled/cache only).
// Dev/test override without editing this file: window.__MQ_CONTENT_BASE__ or
// localStorage 'mq_content_base'.
export const CONTENT_BASE_URL = 'https://cdn.muralquest.app';

const CACHE_KEY = 'mq_content_v1';
const FETCH_TIMEOUT_MS = 6000;

function baseUrl() {
  try {
    return (typeof window !== 'undefined' && window.__MQ_CONTENT_BASE__)
      || localStorage.getItem('mq_content_base')
      || CONTENT_BASE_URL || '';
  } catch (e) {
    return CONTENT_BASE_URL || '';
  }
}

// Replace an array's contents in place — preserves identity for all importers.
function replaceInPlace(target, next) {
  if (!Array.isArray(next)) return;
  target.length = 0;
  for (const item of next) target.push(item);
}

// Replace an object's keys in place — preserves identity (ROUTE_PATHS lookups).
function replaceObjInPlace(target, next) {
  if (!next || typeof next !== 'object') return;
  for (const k of Object.keys(target)) delete target[k];
  for (const k of Object.keys(next)) target[k] = next[k];
}

// Apply OTA routes onto ROUTE_DEFS (defs) + ROUTE_PATHS (geometry) in place.
// Skipped entirely if the manifest has no routes, so a routes-less manifest
// never wipes the bundled routes.
function applyRoutes(routes) {
  if (!Array.isArray(routes) || !routes.length) return;
  replaceInPlace(ROUTE_DEFS, routes.map(r => ({
    id: r.id, name: r.name, desc: r.desc, color: r.color, ids: r.ids,
  })));
  const paths = {};
  for (const r of routes) paths[r.id] = { distance: r.distance || 0, segments: r.segments || [] };
  replaceObjInPlace(ROUTE_PATHS, paths);
}

function applyContent(data) {
  if (!data) return;
  replaceInPlace(murals, data.murals);
  replaceInPlace(pois, data.pois);
  replaceInPlace(YEARS, data.YEARS);
  applyRoutes(data.routes);
}

// Highest content version currently applied to the in-memory arrays.
let appliedVersion = BUNDLED_CONTENT.version;
export function appliedContentVersion() { return appliedVersion; }
export function contentState() {
  return { appliedVersion, bundledVersion: BUNDLED_CONTENT.version, base: baseUrl() };
}

// ── Synchronous boot step: apply cached content if it's newer than the bundle.
// Runs at import time — before app.js renders — so first paint shows the freshest
// content already on device. localStorage is synchronous, so this is safe here.
(function applyCachedAtBoot() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const cached = JSON.parse(raw);
    if (cached && typeof cached.version === 'number'
        && cached.version > BUNDLED_CONTENT.version && cached.data) {
      applyContent(cached.data);
      appliedVersion = cached.version;
    }
  } catch (e) {
    /* corrupt cache — ignore, keep bundled */
  }
})();

// ── Async: fetch the remote manifest and cache it if newer. Newer content applies
// on the NEXT launch (via the boot step above) — simple and robust. Live
// mid-session re-render is a documented follow-up (would call a re-render hook here).
export async function hydrateContent() {
  // Dev preview (python server on 127.0.0.1): keep the local bundled data.js authoritative
  // so the live CDN content.json can't overwrite locally-added test murals (e.g. the SHINE
  // 2026 dummy). Real apps use capacitor://localhost or https://localhost, not 127.0.0.1.
  if (typeof location !== 'undefined' && location.hostname === '127.0.0.1') return { status: 'dev-skip' };
  const base = baseUrl();
  if (!base) return { status: 'no-remote' };
  let timer;
  try {
    const ctrl = new AbortController();
    timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(base.replace(/\/$/, '') + '/content.json',
      { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (!res.ok) return { status: 'http-' + res.status };
    const remote = await res.json();
    if (!remote || typeof remote.version !== 'number') return { status: 'bad-manifest' };
    if (remote.version <= appliedVersion) return { status: 'up-to-date', version: remote.version };
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      version: remote.version,
      hash: remote.hash,
      data: { murals: remote.murals, pois: remote.pois, YEARS: remote.YEARS, routes: remote.routes },
    }));
    return { status: 'cached', version: remote.version, appliesNextLaunch: true };
  } catch (e) {
    if (timer) clearTimeout(timer);
    return { status: 'error', error: String((e && e.message) || e) };
  }
}
