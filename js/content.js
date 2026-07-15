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

function applyContent(data) {
  if (!data) return;
  replaceInPlace(murals, data.murals);
  replaceInPlace(pois, data.pois);
  replaceInPlace(YEARS, data.YEARS);
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
      data: { murals: remote.murals, pois: remote.pois, YEARS: remote.YEARS },
    }));
    return { status: 'cached', version: remote.version, appliesNextLaunch: true };
  } catch (e) {
    if (timer) clearTimeout(timer);
    return { status: 'error', error: String((e && e.message) || e) };
  }
}
