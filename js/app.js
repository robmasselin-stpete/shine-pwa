/**
 * SHINE St. Pete — Main Application
 *
 * Single-file vanilla JS app. No framework, no build step.
 *
 * Architecture:
 *   - All UI state lives in the `state` object (line ~20)
 *   - State changes trigger explicit render calls (no reactivity)
 *   - All HTML is rendered via template literals into container divs
 *   - Three tabs: Explore (card grid), Map (Leaflet), Loops
 *   - Detail page is a fixed overlay that can appear on top of any tab
 *
 * Data:
 *   - data.js is GENERATED from YAML — never hand-edit it
 *   - Mural fields use abbreviated keys: a(artist), t(title), loc(address),
 *     bldg(building), y(year), cat(category), ig(instagram), from(basedIn)
 *   - See scripts/README.md for the full field reference
 *
 * Key patterns:
 *   - render*() functions fully replace innerHTML of their container
 *   - Event listeners are re-attached after each render (no delegation)
 *   - Map initializes once (guarded by state.mapReady), subsequent visits
 *     just call invalidateSize()
 *   - Routes use nearest-neighbor ordering for walk optimization
 */

import { murals, YEARS, YEAR_COLORS, CATEGORY_COLORS } from './data.js';
import { fieldPhotos, ARTIST_ALIASES } from './photos.js';
import { ROUTE_PATHS } from './routes.js';

// =============================================
// Payment gate — check access before showing app
// =============================================
const ACCESS_KEY = 'mural_quest_access';
const ACCESS_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

// IndexedDB fallback — persists across Safari/PWA boundary
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('mural_quest', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbSave(data) {
  idbOpen().then(db => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(data, ACCESS_KEY);
  }).catch(() => {});
}

function idbLoad() {
  return idbOpen().then(db => new Promise((resolve) => {
    const tx = db.transaction('kv', 'readonly');
    const req = tx.objectStore('kv').get(ACCESS_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  })).catch(() => null);
}

// Cookie fallback — most reliable across Safari/PWA boundary
function setCookieAccess(expires) {
  const d = new Date(expires);
  document.cookie = `mq_access=${expires};expires=${d.toUTCString()};path=/;SameSite=Lax`;
}

function getCookieAccess() {
  const match = document.cookie.match(/mq_access=(\d+)/);
  if (match) {
    const expires = parseInt(match[1], 10);
    if (Date.now() < expires) return { expires };
  }
  return null;
}

// Store customer email in cookie for auto-restore across Safari/PWA boundary
function setEmailCookie(email, duration = ACCESS_DURATION) {
  const d = new Date(Date.now() + duration);
  document.cookie = `mq_email=${encodeURIComponent(email)};expires=${d.toUTCString()};path=/;SameSite=Lax`;
}

function getEmailCookie() {
  const match = document.cookie.match(/mq_email=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function hasAccess() {
  if (['localhost','127.0.0.1'].includes(location.hostname)) return true;
  try {
    const data = JSON.parse(localStorage.getItem(ACCESS_KEY));
    if (data && Date.now() < data.expires) return true;
  } catch {}
  return !!getCookieAccess();
}

function grantAccess(duration = ACCESS_DURATION) {
  const data = { expires: Date.now() + duration };
  try { localStorage.setItem(ACCESS_KEY, JSON.stringify(data)); } catch {}
  idbSave(data);
  setCookieAccess(data.expires);
}

function showGate() {
  document.getElementById('gate-page').hidden = false;
  document.getElementById('app').hidden = true;
}

function hideGate() {
  document.getElementById('gate-page').hidden = true;
  document.getElementById('restore-page').style.display = 'none';
  document.getElementById('app').hidden = false;
  // Map may have initialized while #app was hidden — fix size
  setTimeout(() => {
    if (typeof leafletMap !== 'undefined' && leafletMap) leafletMap.invalidateSize();
  }, 200);
}

function showRestorePage() {
  document.getElementById('restore-page').style.display = 'flex';
  document.getElementById('gate-page').hidden = true;
  document.getElementById('app').hidden = true;
}

// Auto-restore access by email (silent, no UI)
function autoRestoreByEmail(email) {
  fetch('/.netlify/functions/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
    .then(r => r.json())
    .then(data => {
      if (data.paid) {
        grantAccess();
        setEmailCookie(email);
        hideGate();
      } else {
        isStandalone ? showRestorePage() : showGate();
      }
    })
    .catch(() => {
      isStandalone ? showRestorePage() : showGate();
    });
}

// Install-to-home-screen prompt
const isCapacitor = window.Capacitor?.isNativePlatform?.() ?? false;

// Hide iOS keyboard accessory bar (up/down arrows + checkmark)
if (isCapacitor) {
  import('@capacitor/keyboard').then(({ Keyboard }) => {
    Keyboard.setAccessoryBarVisible({ isVisible: false });
  }).catch(() => {});
}
const isStandalone = isCapacitor || window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isAndroid = /android/i.test(navigator.userAgent);

function showInstallPrompt() {
  if (isStandalone) return; // Already installed — skip
  if (sessionStorage.getItem('mq_install_seen')) return;
  // 3-day snooze after user dismisses the install overlay
  const dismissed = Number(localStorage.getItem('mq_install_dismissed') || 0);
  if (dismissed && Date.now() - dismissed < 3 * 24 * 60 * 60 * 1000) return;
  const overlay = document.getElementById('install-overlay');
  if (!overlay) return;

  // Show the right platform instructions
  const iosEl = document.getElementById('install-ios');
  const androidEl = document.getElementById('install-android');
  if (isAndroid) {
    iosEl.style.display = 'none';
    androidEl.style.display = 'block';
  } else {
    iosEl.style.display = 'block';
    androidEl.style.display = 'none';
  }

  overlay.style.display = 'flex';
}

function hideInstallPrompt() {
  const overlay = document.getElementById('install-overlay');
  if (overlay) overlay.style.display = 'none';
  sessionStorage.setItem('mq_install_seen', '1');
  localStorage.setItem('mq_install_dismissed', Date.now());
  // Ensure map resizes correctly after overlay removal
  if (state.mapReady && leafletMap) {
    setTimeout(() => leafletMap.invalidateSize(), 150);
  }
}

// Skip button
document.getElementById('install-overlay-dismiss')?.addEventListener('click', hideInstallPrompt);

// Handle Stripe success redirect
const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get('session_id');

if (sessionId) {
  // Verify the payment with our serverless function
  fetch(`/.netlify/functions/verify-session?session_id=${sessionId}`)
    .then(r => r.json())
    .then(data => {
      if (data.paid) {
        grantAccess();
        if (data.email) setEmailCookie(data.email);
        // Only strip session_id from URL if storage actually worked
        if (hasAccess()) {
          window.history.replaceState({}, '', '/');
        }
        hideGate();
        showInstallPrompt();
      } else {
        showGate();
      }
    })
    .catch(() => showGate());
} else if (isCapacitor || hasAccess() || location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  hideGate();
  showInstallPrompt();
} else {
  // localStorage empty — try IndexedDB fallback before showing gate/restore
  idbLoad().then(data => {
    if (data && Date.now() < data.expires) {
      // Found valid access in IndexedDB — sync to localStorage and enter
      localStorage.setItem(ACCESS_KEY, JSON.stringify(data));
      hideGate();
    } else {
      // Try auto-restore using stored email cookie
      const savedEmail = getEmailCookie();
      if (savedEmail) {
        autoRestoreByEmail(savedEmail);
      } else if (isStandalone) {
        showRestorePage();
      } else {
        showGate();
      }
    }
  }).catch(() => {
    const savedEmail = getEmailCookie();
    if (savedEmail) {
      autoRestoreByEmail(savedEmail);
    } else {
      isStandalone ? showRestorePage() : showGate();
    }
  });
}

// Buy button click → create Stripe checkout session
document.getElementById('gate-buy-btn')?.addEventListener('click', async () => {
  const btn = document.getElementById('gate-buy-btn');
  btn.disabled = true;
  btn.textContent = 'Loading...';

  try {
    const res = await fetch('/.netlify/functions/create-checkout');
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error(data.error || 'Checkout failed');
    }
  } catch (err) {
    btn.disabled = false;
    btn.innerHTML = 'Click Here to Purchase<span class="gate-buy-sub">$4.99</span>';
    alert('Something went wrong. Please try again.');
  }
});

// Promo codes are handled by Stripe Checkout (allow_promotion_codes)
// No client-side promo code logic needed.

// Restore access by email
document.getElementById('gate-restore-btn')?.addEventListener('click', () => {
  document.getElementById('gate-restore-form').hidden = false;
  document.getElementById('gate-restore-btn').hidden = true;
});

document.getElementById('gate-restore-submit')?.addEventListener('click', async () => {
  const email = document.getElementById('gate-restore-email').value.trim();
  const msg = document.getElementById('gate-restore-msg');
  if (!email) return;

  msg.hidden = false;
  msg.textContent = 'Checking...';
  msg.className = 'gate-restore-msg';

  try {
    const res = await fetch('/.netlify/functions/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (data.paid) {
      grantAccess();
      setEmailCookie(email);
      msg.textContent = 'Access restored!';
      msg.className = 'gate-restore-msg success';
      setTimeout(() => { hideGate(); showInstallPrompt(); }, 500);
    } else {
      msg.textContent = 'No purchase found for this email.';
      msg.className = 'gate-restore-msg error';
    }
  } catch {
    msg.textContent = 'Something went wrong. Try again.';
    msg.className = 'gate-restore-msg error';
  }
});

// Standalone restore page (dedicated screen)
document.getElementById('restore-submit')?.addEventListener('click', async () => {
  const email = document.getElementById('restore-email').value.trim();
  const msg = document.getElementById('restore-msg');
  if (!email) return;

  msg.hidden = false;
  msg.textContent = 'Checking...';
  msg.className = 'restore-msg';

  try {
    const res = await fetch('/.netlify/functions/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (data.paid) {
      grantAccess();
      setEmailCookie(email);
      msg.textContent = 'Access restored! Opening app...';
      msg.className = 'restore-msg success';
      setTimeout(() => {
        // Directly hide restore page and show app
        document.getElementById('restore-page').style.display = 'none';
        document.getElementById('gate-page').hidden = true;
        document.getElementById('app').hidden = false;
        showInstallPrompt();
      }, 800);
    } else {
      msg.textContent = 'No purchase found for this email.';
      msg.className = 'restore-msg error';
    }
  } catch {
    msg.textContent = 'Something went wrong. Try again.';
    msg.className = 'restore-msg error';
  }
});

// =============================================
// Favorites / Likes
// =============================================
const LIKES_KEY = 'mural_quest_likes';
const myLikes = new Set(JSON.parse(localStorage.getItem(LIKES_KEY) || '[]'));
let likeCounts = {};

function saveLikes() {
  localStorage.setItem(LIKES_KEY, JSON.stringify([...myLikes]));
}

function hasLiked(muralId) {
  return myLikes.has(muralId);
}

async function fetchLikeCounts() {
  try {
    const res = await fetch('/.netlify/functions/like-mural');
    if (res.ok) likeCounts = await res.json();
  } catch { /* offline — counts stay at 0 */ }
}

async function toggleLike(muralId) {
  const btn = document.getElementById('like-btn');

  if (hasLiked(muralId)) {
    // Unlike
    myLikes.delete(muralId);
    saveLikes();
    if (btn) btn.classList.remove('liked');
    return;
  }

  // Like
  myLikes.add(muralId);
  saveLikes();
  if (btn) btn.classList.add('liked');
}

// Fetch counts on load
fetchLikeCounts();

// =============================================
// Seen It Tracking
// =============================================
const SEEN_KEY = 'mural_quest_seen';
const mySeen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));

function saveSeen() {
  localStorage.setItem(SEEN_KEY, JSON.stringify([...mySeen]));
}

function hasSeen(muralId) { return mySeen.has(muralId); }

function toggleSeen(muralId) {
  if (mySeen.has(muralId)) mySeen.delete(muralId);
  else mySeen.add(muralId);
  saveSeen();
}

function toggleSeenFromDetail(muralId) {
  toggleSeen(muralId);
  const btn = document.getElementById('seen-btn');
  if (btn) btn.classList.toggle('seen', mySeen.has(muralId));
}

// =============================================
// Detail Text Size
// =============================================
const TEXT_SIZE_KEY = 'mural_quest_text_size';
const TEXT_SIZES = [
  { label: 'A', class: '', size: 15 },
  { label: 'A+', class: 'text-large', size: 18 },
  { label: 'A++', class: 'text-xl', size: 22 },
];
let textSizeIdx = TEXT_SIZES.findIndex(t => t.class === (localStorage.getItem(TEXT_SIZE_KEY) || ''));
if (textSizeIdx < 0) textSizeIdx = 0;

function cycleTextSize() {
  textSizeIdx = (textSizeIdx + 1) % TEXT_SIZES.length;
  const ts = TEXT_SIZES[textSizeIdx];
  localStorage.setItem(TEXT_SIZE_KEY, ts.class);
  const body = document.querySelector('.detail-body');
  if (body) {
    TEXT_SIZES.forEach(t => { if (t.class) body.classList.remove(t.class); });
    if (ts.class) body.classList.add(ts.class);
  }
  const btn = document.getElementById('text-size-btn');
  if (btn) btn.textContent = ts.label;
}
window.cycleTextSize = cycleTextSize;

// Audio clip player
let _audioPlayer = null;
function toggleAudioClip(url) {
  const btn = document.getElementById('audio-btn');
  if (_audioPlayer && !_audioPlayer.paused) {
    _audioPlayer.pause();
    _audioPlayer.currentTime = 0;
    _audioPlayer = null;
    if (btn) btn.classList.remove('playing');
    return;
  }
  _audioPlayer = new Audio(url);
  if (btn) btn.classList.add('playing');
  _audioPlayer.play();
  _audioPlayer.addEventListener('ended', () => {
    if (btn) btn.classList.remove('playing');
    _audioPlayer = null;
  });
}

// =============================================
// State — single mutable object drives all UI
// =============================================
const state = {
  tab: 'map',
  searchQuery: '',
  exploreFilter: null,  // null=all, or array e.g. ['shine'], ['shine','commercial']
  exploreYears: [],     // empty=all years, or array of selected years e.g. [2025, 2024]
  userLat: null,
  userLng: null,
  mapReady: false,
  selectedMural: null,
  activeMapTab: 'shine',
  activeMapYears: null,
  directionsRoute: null,   // L.polyline on map
  directionsMarker: null,  // destination marker
  directionsProfile: 'foot', // 'foot' or 'car'
  directionsMural: null,   // target mural object
  // Tour loop state
  activeTour: null,        // current ROUTE_DEF or null
  tourStops: [],           // ordered mural array for active tour
  tourIndex: 0,            // index of first upcoming stop (below the map)
  tourMapReady: false,
  tourRoute: null,         // L.polyline on tour map
  tourAdjacentRoutes: [],  // L.polyline array for prev/next segments (gray)
  tourMarkers: [],         // L.marker array on tour map
  tourFetching: false,
  tourDirection: 'fwd',
  // Discover Mode state
  walkMode: false,
  walkWatchId: null,
  walkAlerted: new Set(),
  // Compass Arc state
  compassAvailable: false,
  compassHeading: null,
  compassWatchId: null,
  compassPermission: false,
};

// Discover Mode module-level vars
let walkAudioCtx = null;
let proximityBannerEl = null;
let proximityBannerTimeout = null;
const RADIUS_OPTIONS = [
  { ft: 50,  m: 15.24 },
  { ft: 100, m: 30.48 },
  { ft: 200, m: 60.96 },
  { ft: 300, m: 91.44 },
];
const RADIUS_KEY = 'mural_quest_walk_radius';
let walkRadiusIdx = RADIUS_OPTIONS.findIndex(r => r.ft === Number(localStorage.getItem(RADIUS_KEY)));
if (walkRadiusIdx === -1) walkRadiusIdx = 1; // default 100 ft
function getProximityThreshold() { return RADIUS_OPTIONS[walkRadiusIdx].m; }
function getRadiusFt() { return RADIUS_OPTIONS[walkRadiusIdx].ft; }

// Compass Arc module-level vars
let compassHandler = null;
let compassAnimFrame = null;
let compassSmoothedHeading = null;
let compassGpsWatchId = null;
const COMPASS_ARC_DOTS = 21;
const COMPASS_ARC_SPAN_DEG = 140;
let compassGrantedThisSession = false;

// Year buckets for category filtering — update these when adding new festival years
const SHINE_YEARS = [2025, 2024, 2023, 2022, 2021, 2020];
const VINTAGE_YEARS = [2019, 2018, 2017, 2016, 2015];

// =============================================
// DOM refs
// =============================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const views = {
  explore: $('#view-explore'),
  map: $('#view-map'),
  loops: $('#view-loops'),
};

const detailPage = $('#detail-page');
const detailContent = $('#detail-content');
const searchBar = $('#search-bar');
const exploreFilters = $('#explore-filters');
const filterPills = $('#filter-pills');
const yearSubPills = $('#year-sub-pills');
const searchInput = $('#search-input');

// =============================================
// Tab navigation
// =============================================
$$('.tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

/** Switch active tab — hides other views, shows search/filters for Explore only, triggers render. */
function switchTab(tab) {
  state.tab = tab;
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  Object.entries(views).forEach(([key, el]) => { el.hidden = key !== tab; });

  searchBar.hidden = tab !== 'explore';
  exploreFilters.hidden = tab !== 'explore';
  stopDetailCompass();
  detailPage.hidden = true;

  // Show/hide route bar on map tab
  const routeBar = document.querySelector('.map-route-bar');
  if (routeBar) routeBar.classList.toggle('visible', tab === 'map');

  // Directions now open in Apple/Google Maps — no in-app state to clear
  // Keep active tour alive when switching tabs so user can return to it
  if (tab === 'explore') { renderFilterPills(); renderExplore(); }
  if (tab === 'map') { initMap(); flashFabLabels(); }
  if (tab === 'loops') {
    if (state.activeTour && state.tourStops.length) renderTourLoop();
    else renderTourList();
  }
}

// =============================================
// Geo utilities
// =============================================

/** Great-circle distance between two lat/lng points. Returns meters. */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Initial bearing from point 1 to point 2 in degrees (0-360). */
function bearing(lat1, lng1, lat2, lng2) {
  const toRad = (d) => d * Math.PI / 180;
  const toDeg = (r) => r * 180 / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Format meters as "X ft" or "X.X mi" for display. */
function formatDistance(meters) {
  const feet = meters * 3.28084;
  if (feet < 1000) return `${Math.round(feet)} ft`;
  return `${(feet / 5280).toFixed(1)} mi`;
}

// =============================================
// Discover Mode — Proximity Alerts
// =============================================

/** Create or resume AudioContext (must be called from user gesture on iOS). */
function ensureWalkAudio() {
  if (!walkAudioCtx) walkAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (walkAudioCtx.state === 'suspended') walkAudioCtx.resume();
}

/** Play a pleasant two-note ascending chime (C5 → E5) via Web Audio API. */
function playProximityChime() {
  if (!walkAudioCtx) return;
  const now = walkAudioCtx.currentTime;
  const notes = [523.25, 659.25]; // C5, E5

  notes.forEach((freq, i) => {
    const osc = walkAudioCtx.createOscillator();
    const gain = walkAudioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.3, now + i * 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.2 + 0.3);
    osc.connect(gain);
    gain.connect(walkAudioCtx.destination);
    osc.start(now + i * 0.2);
    osc.stop(now + i * 0.2 + 0.3);
  });
}

/** Show the Discover Mode settings dialog. */
function showDiscoverDialog() {
  // Remove existing dialog if any
  const existing = document.querySelector('.discover-dialog-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'discover-dialog-overlay';
  overlay.innerHTML = `
    <div class="discover-dialog">
      <div class="discover-dialog-header">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="var(--teal)"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
        Discover Mode
      </div>
      <p class="discover-dialog-desc">Get alerted when you're near an unseen mural. Uses GPS and haptic feedback.</p>
      <div class="discover-dialog-toggle-row">
        <span>Discover Mode</span>
        <button class="discover-toggle ${state.walkMode ? 'on' : ''}" id="discover-toggle-btn">
          <span class="discover-toggle-knob"></span>
        </button>
      </div>
      <div class="discover-dialog-radius-section">
        <span class="discover-dialog-radius-label">Alert Distance</span>
        <div class="discover-dialog-radius-options">
          ${RADIUS_OPTIONS.map((r, i) => `<button class="discover-radius-opt ${i === walkRadiusIdx ? 'active' : ''}" data-idx="${i}">${r.ft} ft</button>`).join('')}
        </div>
      </div>
      <div class="discover-dialog-stats">
        <span>${mySeen.size} seen</span>
        <span class="discover-dialog-stats-sep">&middot;</span>
        <span>${murals.length - mySeen.size} remaining</span>
      </div>
      <button class="discover-dialog-done">Done</button>
    </div>
  `;
  document.body.appendChild(overlay);

  // Close on overlay tap
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });

  // Toggle button
  overlay.querySelector('#discover-toggle-btn').addEventListener('click', () => {
    toggleDiscoverMode();
    const btn = overlay.querySelector('#discover-toggle-btn');
    btn.classList.toggle('on', state.walkMode);
  });

  // Radius options
  overlay.querySelectorAll('.discover-radius-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      walkRadiusIdx = Number(btn.dataset.idx);
      localStorage.setItem(RADIUS_KEY, RADIUS_OPTIONS[walkRadiusIdx].ft);
      overlay.querySelectorAll('.discover-radius-opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateDiscoverPill();
    });
  });

  // Done button
  overlay.querySelector('.discover-dialog-done').addEventListener('click', () => overlay.remove());
}

/** Toggle Discover Mode on/off (internal). */
function toggleDiscoverMode() {
  state.walkMode = !state.walkMode;
  const fab = document.getElementById('fab-discover');

  if (state.walkMode) {
    ensureWalkAudio();
    fab && fab.classList.add('active');
    showDiscoverPill();
    state.walkWatchId = navigator.geolocation.watchPosition(
      pos => {
        state.userLat = pos.coords.latitude;
        state.userLng = pos.coords.longitude;
        updateTourUserLocation();
        checkProximityAlerts();
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  } else {
    fab && fab.classList.remove('active');
    if (state.walkWatchId !== null) {
      navigator.geolocation.clearWatch(state.walkWatchId);
      state.walkWatchId = null;
    }
    state.walkAlerted.clear();
    removeDiscoverPill();
    dismissProximityBanner();
  }
}

/** Play haptic feedback on native platforms. */
async function playProximityHaptic() {
  if (window.Capacitor?.isNativePlatform?.()) {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Heavy });
    setTimeout(() => Haptics.impact({ style: ImpactStyle.Heavy }), 200);
  }
}

/** Check all murals for proximity and alert on the first match. */
function checkProximityAlerts() {
  if (!state.walkMode || !state.userLat) return;
  for (const m of murals) {
    if (state.walkAlerted.has(m.id)) continue;
    if (mySeen.has(m.id)) continue;
    const dist = haversine(state.userLat, state.userLng, m.lat, m.lng);
    if (dist <= getProximityThreshold()) {
      state.walkAlerted.add(m.id);
      playProximityChime();
      playProximityHaptic();
      showProximityBanner(m, dist);
      break;
    }
  }
}

/** Show proximity alert banner above tab bar. */
function showProximityBanner(mural, dist) {
  dismissProximityBanner();

  const el = document.createElement('div');
  el.className = 'proximity-banner';
  el.innerHTML = `
    <img class="proximity-banner-img" src="${mural.img || ''}" alt="${mural.a}" onerror="this.style.background='#ddd'">
    <div class="proximity-banner-info">
      <div class="proximity-banner-artist">${mural.a}</div>
      <div class="proximity-banner-title">${mural.t || ''}</div>
      <div class="proximity-banner-dist">${formatDistance(dist)} away</div>
    </div>
    <button class="proximity-banner-seen">I've Seen It</button>
    <button class="proximity-banner-view">Let's Go</button>
  `;
  document.body.appendChild(el);
  proximityBannerEl = el;

  // Trigger slide-up animation
  requestAnimationFrame(() => el.classList.add('visible'));

  el.querySelector('.proximity-banner-view').addEventListener('click', () => {
    dismissProximityBanner();
    openDetail(mural);
    // Show toast hint about direction lights
    showDiscoverToast();
  });
  el.querySelector('.proximity-banner-seen').addEventListener('click', () => {
    mySeen.add(mural.id);
    saveSeen();
    dismissProximityBanner();
  });

  proximityBannerTimeout = setTimeout(dismissProximityBanner, 12000);
}

/** Show a brief toast: "Use direction lights to discover mural" */
function showDiscoverToast() {
  const existing = document.querySelector('.discover-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'discover-toast';
  toast.textContent = 'Use direction lights to find this mural';
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

/** Dismiss the proximity banner if showing. */
function dismissProximityBanner() {
  clearTimeout(proximityBannerTimeout);
  if (proximityBannerEl) {
    proximityBannerEl.remove();
    proximityBannerEl = null;
  }
}

/** Show the persistent "Discover ON" pill at top of screen. */
function showDiscoverPill() {
  if (document.querySelector('.discover-pill')) return;
  const pill = document.createElement('div');
  pill.className = 'discover-pill';
  pill.innerHTML = `
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
    Discover ON
    <span class="discover-pill-sep">&middot;</span>
    <span class="discover-pill-radius">${getRadiusFt()} ft</span>
    <button class="discover-pill-x" aria-label="Turn off Discover Mode">&times;</button>
  `;
  document.body.appendChild(pill);
  pill.querySelector('.discover-pill-x').addEventListener('click', () => {
    toggleDiscoverMode();
    // Update dialog toggle if open
    const toggle = document.querySelector('#discover-toggle-btn');
    if (toggle) toggle.classList.remove('on');
  });
}

/** Update radius display in the discover pill. */
function updateDiscoverPill() {
  const span = document.querySelector('.discover-pill-radius');
  if (span) span.textContent = getRadiusFt() + ' ft';
}

/** Remove the Discover pill. */
function removeDiscoverPill() {
  const pill = document.querySelector('.discover-pill');
  if (pill) pill.remove();
}

// =============================================
// Explore filtering
// =============================================
/**
 * Apply the current filter/search state to the full mural list.
 * Chain: category filter → year sub-filter → text search.
 * Returns a new filtered array (does not mutate `murals`).
 */
function getFilteredMurals() {
  let list = murals;

  // Category filter (multi-select array or null=all)
  const filters = state.exploreFilter;
  if (filters && filters.length > 0) {
    list = list.filter(m => {
      if (filters.includes('shine') && m.cat !== 'commercial' && SHINE_YEARS.includes(m.y)) return true;
      if (filters.includes('vintage') && m.cat !== 'commercial' && (VINTAGE_YEARS.includes(m.y) || m.y === 0)) return true;
      if (filters.includes('commercial') && m.cat === 'commercial') return true;
      return false;
    });
  }

  // Year sub-filter
  if (state.exploreYears.length > 0) {
    list = list.filter(m => state.exploreYears.includes(m.y));
  }

  // Search — split into terms, ALL must match (each can match any field)
  if (state.searchQuery) {
    const terms = state.searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
    list = list.filter(m => {
      const haystack = [
        m.a, m.loc, m.t, m.bldg, m.desc, m.bio,
        m.imp ? m.imp.join(' ') : ''
      ].filter(Boolean).join(' ').toLowerCase();
      return terms.every(term => haystack.includes(term));
    });
  }
  return list;
}

// =============================================
// Explore filter pills
// =============================================
/** Render the top-level category pills (All/Shine/Vintage/Commercial) and attach click handlers. */
function renderFilterPills() {
  const f = state.exploreFilter; // null or array
  const isActive = (cat) => f && f.includes(cat);
  filterPills.innerHTML = `
    <button class="year-pill ${!f ? 'active' : ''}" data-filter="">All</button>
    <button class="year-pill ${isActive('shine') ? 'active' : ''}" data-filter="shine">Shine</button>
    <button class="year-pill ${isActive('vintage') ? 'active' : ''}" data-filter="vintage">Vintage</button>
    <button class="year-pill ${isActive('commercial') ? 'active' : ''}" data-filter="commercial">Commercial</button>
  `;
  filterPills.querySelectorAll('.year-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.filter;
      if (!cat) {
        state.exploreFilter = null;
      } else {
        state.exploreFilter = [cat];
      }
      state.exploreYears = [];
      renderFilterPills();
      renderYearSubPills();
      renderExplore();
    });
  });
  renderYearSubPills();
}

/** Render year sub-pills (2025, 2024...) below the category pills. Only shown for Shine/Vintage. */
function renderYearSubPills() {
  const f = state.exploreFilter;
  if (f && f.includes('shine') && f.length === 1) {
    const years = SHINE_YEARS;
    const yearsWithData = years.filter(y => murals.some(m => m.y === y && m.cat !== 'commercial'));
    const sel = state.exploreYears;
    yearSubPills.innerHTML = `
      ${yearsWithData.map(y => `
        <button class="year-pill year-sub ${sel.includes(y) ? 'active' : ''}" data-year="${y}">
          <span class="year-dot" style="background:${YEAR_COLORS[y] || '#999'}"></span>${y}
        </button>
      `).join('')}
    `;
    yearSubPills.hidden = false;
    yearSubPills.querySelectorAll('.year-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const y = Number(btn.dataset.year);
        if (sel.includes(y)) {
          state.exploreYears = sel.filter(v => v !== y);
        } else {
          state.exploreYears = [...sel, y];
        }
        renderYearSubPills();
        renderExplore();
      });
    });
  } else {
    yearSubPills.innerHTML = '';
    yearSubPills.hidden = true;
  }
}

// =============================================
// Search
// =============================================
searchInput.addEventListener('input', (e) => {
  state.searchQuery = e.target.value.trim();
  renderExplore();
});

// =============================================
// Explore view (mural grid)
// =============================================
/** Render the Explore tab — 2-column card grid of filtered murals. Full innerHTML replace. */
function renderExplore() {
  const sub = document.getElementById('explore-subtitle');
  if (sub) sub.textContent = `${murals.length} murals across St. Petersburg`;
  const filtered = getFilteredMurals();

  if (filtered.length === 0) {
    views.explore.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🎨</div>
        <div class="empty-state-text">No murals found.<br>Try a different filter or search.</div>
      </div>
    `;
    return;
  }

  views.explore.innerHTML = `
    <div class="mural-grid">
      ${filtered.map(m => `
        <div class="mural-card" data-id="${m.id}">
          <img class="mural-card-img" src="${m.img || ''}" alt="${m.a}" loading="lazy" onerror="this.style.background='#ddd'">
          <div class="mural-card-info">
            <div class="mural-card-artist">${m.a}</div>
            <div class="mural-card-meta">${m.bldg || m.loc || ''} · ${m.y || (m.cat === 'commercial' ? 'Commercial' : 'Pre-SHINE')}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  views.explore.querySelectorAll('.mural-card').forEach(card => {
    card.addEventListener('click', () => {
      const mural = murals.find(m => m.id === Number(card.dataset.id));
      if (mural) openDetail(mural);
    });
  });
}

// =============================================
// Map view
// =============================================
let leafletMap = null;
let tourMap = null; // Second Leaflet instance for tour loop view
let tourUserDot = null; // persistent user location marker on tour map
let tourUserPulse = null;
let tourPickerMap = null; // Third Leaflet instance for tour picker overview
const tourPickerCache = new Map(); // routeId → [[lat,lng],...] cached OSRM coords
let pickerActiveRoute = 0; // index into ROUTE_DEFS for currently shown route
// (routeBarActive removed — horizontal pills don't need focus tracking)
let pickerLayers = [];     // current polyline + label on picker map
const mapMarkers = []; // Array of { dot, imgMarker, mural, visible } for each mural
const routePolylines = []; // Route polylines on the main map

// At this zoom level and above, markers switch from colored dots to thumbnail images
const ICON_ZOOM_THRESHOLD = 16;

// (RB_CARD_H, updateRouteBarPositions, setupRouteBarTouch removed — horizontal pills)

/**
 * Initialize the Leaflet map (runs once) or just resize it on subsequent tab visits.
 * Creates two marker types per mural (dot + image icon) and sets up category/year filtering.
 */
function initMap() {
  if (state.mapReady) {
    setTimeout(() => leafletMap.invalidateSize(), 100);
    return;
  }

  const routeKeyHtml = ROUTE_DEFS.map(def => {
    const color = TOUR_COLORS[def.id] || '#999';
    const stops = def.ids ? def.ids.length : 0;
    const rd = ROUTE_PATHS[def.id];
    const dist = rd && rd.distance ? rd.distance : '';
    const isBike = def.id.includes('bike');
    const timeEst = dist ? (isBike ? '~20 min bike' : '~30 min walk') : '';
    const meta = [stops + ' stops', dist ? dist + ' mi' : '', timeEst].filter(Boolean).join(' · ');
    return `<div class="route-bar-card route-key-off" data-route="${def.id}" style="--route-color:${color}"><div class="route-bar-accent" style="background:${color}"></div><div class="route-bar-body"><div class="route-bar-name">${def.name}</div><div class="route-bar-meta">${meta}</div></div></div>`;
  }).join('');

  views.map.innerHTML = `
    <div id="map-container" style="position:relative;flex:1;width:100%;min-height:0"></div>
  `;

  // Floating header (over the map, pointer-events pass through)
  const mapContainer = document.getElementById('map-container');
  const floatHeader = document.createElement('div');
  floatHeader.className = 'map-float-header';
  floatHeader.innerHTML = `
    <h1 class="map-float-title">Map</h1>
    <p class="map-float-subtitle">${murals.length} murals across St. Petersburg</p>
    <div class="filter-pills" id="map-cat-pills"></div>
    <div class="filter-pills" id="map-year-pills" hidden></div>
  `;
  mapContainer.appendChild(floatHeader);

  // Route bar — fixed panel above tab bar (appended to #app, not map container)
  let routeBar = document.querySelector('.map-route-bar');
  if (!routeBar) {
    routeBar = document.createElement('div');
    routeBar.className = 'map-route-bar visible';
    routeBar.innerHTML = `<div class="route-bar-title">Tour Overlays</div><div class="route-bar-track" id="route-bar-track">${routeKeyHtml}</div>`;
    document.getElementById('app').appendChild(routeBar);
  }

  leafletMap = L.map('map-container', {
    center: [27.777, -82.646],
    zoom: 13,
    zoomControl: false,
  });

  // Base tiles (no labels) — sits below markers
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: '\u00a9 OpenStreetMap \u00a9 CARTO',
    maxZoom: 19,
    keepBuffer: 6,
  }).addTo(leafletMap);

  // Labels-only layer — sits above markers
  leafletMap.createPane('labels');
  leafletMap.getPane('labels').style.zIndex = 650;
  leafletMap.getPane('labels').style.pointerEvents = 'none';
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    pane: 'labels',
  }).addTo(leafletMap);

  // Tap anywhere on map to dismiss nearest popup / out-of-range banner
  document.getElementById('map-container').addEventListener('click', (e) => {
    if (e.target.closest('.nearest-popup') || e.target.closest('.map-range-banner') ||
        e.target.closest('.map-fab-stack') || e.target.closest('.directions-bar') ||
        e.target.closest('.directions-chip')) return;
    dismissNearestPopup();
  });

  // Create both dot markers and icon markers for each mural
  murals.forEach(m => {
    if (!m.lat || !m.lng) return;
    const color = YEAR_COLORS[m.y] || '#999';

    // Circle marker (zoomed out)
    const dot = L.circleMarker([m.lat, m.lng], {
      radius: 7,
      fillColor: color,
      color: '#fff',
      weight: 2,
      fillOpacity: 0.9,
    });
    dot.on('click', () => openDetail(m));

    // Image icon marker (zoomed in)
    const icon = L.divIcon({
      className: 'mural-map-icon',
      html: `<img src="${m.img}" alt="${m.a}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">`,
      iconSize: [48, 48],
      iconAnchor: [24, 24],
    });
    const imgMarker = L.marker([m.lat, m.lng], { icon });
    imgMarker.on('click', () => openDetail(m));

    mapMarkers.push({ dot, imgMarker, mural: m, visible: false });
  });

  // Draw neighborhood route polylines (behind markers, visible at zoom >= 14)
  drawRoutePolylines();

  // Route key toggle handlers (tap = toggle visibility, long-press = launch tour)
  document.querySelectorAll('.route-bar-card[data-route]').forEach(el => {
    let routePressTimer = null;
    let routeLongPressed = false;

    el.addEventListener('touchstart', () => {
      routeLongPressed = false;
      routePressTimer = setTimeout(() => {
        routeLongPressed = true;
        const def = ROUTE_DEFS.find(d => d.id === el.dataset.route);
        if (def) openTour(def);
      }, 500);
    }, { passive: true });
    el.addEventListener('touchend', (e) => {
      clearTimeout(routePressTimer);
      if (routeLongPressed) { e.preventDefault(); return; }
    });
    el.addEventListener('touchmove', () => { clearTimeout(routePressTimer); });

    el.addEventListener('click', () => {
      if (routeLongPressed) return;
      const id = el.dataset.route;

      const wasHidden = hiddenRoutes.has(id);

      // Single-select: hide all routes first
      ROUTE_DEFS.forEach(d => hiddenRoutes.add(d.id));
      document.querySelectorAll('.route-bar-card[data-route]').forEach(item => {
        item.classList.add('route-key-off');
      });

      // Toggle: if it was hidden, show it; if it was visible, leave all off
      if (wasHidden) {
        hiddenRoutes.delete(id);
        el.classList.remove('route-key-off');
        // Zoom to fit the route
        const rd = ROUTE_PATHS[id];
        const allPts = rd?.path || (rd?.segments ? rd.segments.flat() : null);
        if (allPts && allPts.length > 1) {
          const bounds = L.latLngBounds(allPts.map(p => [p[0], p[1]]));
          leafletMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
        }
      }

      updateRoutePolylineVisibility();
    });
  });

  // Swap between dots and icons on zoom, and toggle route polylines
  leafletMap.on('zoomend', () => {
    swapMarkerStyle(); updateRoutePolylineVisibility();
  });


  // Year legend (hidden — kept for possible future use)
  const legendDiv = document.createElement('div');
  legendDiv.className = 'map-legend';
  legendDiv.id = 'map-legend';
  legendDiv.hidden = true;
  document.getElementById('map-container').appendChild(legendDiv);

  state.activeMapTab = 'all';
  state.activeMapYears = null;
  renderMapCatPills();
  updateMapMarkers();

  // Floating action buttons (Komoot-style)
  addMapFabs();

  state.mapReady = true;
  setTimeout(() => leafletMap.invalidateSize(), 100);

  // Persistent user location — always show the blue dot on the map
  if (window.isSecureContext && 'geolocation' in navigator) {
    navigator.geolocation.watchPosition(
      pos => {
        state.userLat = pos.coords.latitude;
        state.userLng = pos.coords.longitude;
        showUserOnMap();
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
  }
}

/** Toggle between dot markers (zoomed out) and image markers (zoomed in) based on current zoom. */
function swapMarkerStyle() {
  const useIcons = leafletMap.getZoom() >= ICON_ZOOM_THRESHOLD;
  mapMarkers.forEach(({ dot, imgMarker, visible }) => {
    if (!visible) return;
    if (useIcons) {
      dot.removeFrom(leafletMap);
      imgMarker.addTo(leafletMap);
    } else {
      imgMarker.removeFrom(leafletMap);
      dot.addTo(leafletMap);
    }
  });
}

const ROUTE_POLYLINE_ZOOM = 13; // show route lines at this zoom and above

/** Load coords for all routes and draw polylines on the main map. */
function drawRoutePolylines() {
  ROUTE_DEFS.forEach(def => {
    const color = TOUR_COLORS[def.id] || '#999';
    loadRouteCoords(def).then(() => {
      const coords = tourPickerCache.get(def.id);
      if (!coords || coords.length < 2) return;
      const dashed = coords.length === getRouteOrdered(def).length;
      const opts = { color, weight: 2.5, opacity: 0.55 };
      if (dashed) opts.dashArray = '4 4';
      const line = L.polyline(coords, opts);
      line._routeId = def.id;
      routePolylines.push(line);
      updateRoutePolylineVisibility();
    });
  });
}

let hiddenRoutes = new Set(); // Populated after ROUTE_DEFS is defined

/** Show/hide route polylines based on zoom level and user toggles. */
function updateRoutePolylineVisibility() {
  const zoomOk = leafletMap.getZoom() >= ROUTE_POLYLINE_ZOOM;
  routePolylines.forEach(line => {
    const show = zoomOk && !hiddenRoutes.has(line._routeId);
    if (show && !leafletMap.hasLayer(line)) line.addTo(leafletMap);
    if (!show && leafletMap.hasLayer(line)) line.removeFrom(leafletMap);
  });
}

// ── Map Floating Action Buttons ──────────────────────────────

const DOWNTOWN_CENTER = [27.7676, -82.6403];
const IN_RANGE_MILES = 10;

let userLocationMarker = null;
let nearestPopupEl = null;

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dlat = (lat2 - lat1) * Math.PI / 180;
  const dlon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dlat/2)**2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
    Math.sin(dlon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function isInRange() {
  if (!state.userLat) return null; // unknown
  return haversineMiles(state.userLat, state.userLng, DOWNTOWN_CENTER[0], DOWNTOWN_CENTER[1]) <= IN_RANGE_MILES;
}

function addMapFabs() {
  const container = document.getElementById('map-container');
  const stack = document.createElement('div');
  stack.className = 'map-fab-stack';
  stack.innerHTML = `
    <div class="map-fab-row">
      <span class="map-fab-label">My Location</span>
      <button class="map-fab" id="fab-location" title="My location">
        <svg viewBox="0 0 24 24"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>
      </button>
    </div>
    <div class="map-fab-row">
      <span class="map-fab-label">Nearest Mural</span>
      <button class="map-fab" id="fab-nearest" title="Nearest mural">
        <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
      </button>
    </div>
    <div class="map-fab-row">
      <span class="map-fab-label">Nearest Tour Stop</span>
      <button class="map-fab" id="fab-nearest-tour" title="Nearest tour stop">
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
      </button>
    </div>
    <div class="map-fab-row">
      <span class="map-fab-label">Discover</span>
      <button class="map-fab" id="fab-discover" title="Discover nearby murals">
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
      </button>
    </div>
  `;
  container.appendChild(stack);

  document.getElementById('fab-location').addEventListener('click', requestAndShowLocation);
  document.getElementById('fab-nearest').addEventListener('click', fabFindNearestMural);
  document.getElementById('fab-nearest-tour').addEventListener('click', fabFindNearestTourStop);
  document.getElementById('fab-discover').addEventListener('click', showDiscoverDialog);

  // Long-press on any FAB shows labels, auto-hides after 2s
  let labelTimer = null;
  let pressTimer = null;
  const showLabels = () => {
    clearTimeout(labelTimer);
    stack.classList.add('show-labels');
    labelTimer = setTimeout(() => stack.classList.remove('show-labels'), 3500);
  };
  stack.querySelectorAll('.map-fab').forEach(btn => {
    btn.addEventListener('touchstart', () => {
      pressTimer = setTimeout(showLabels, 400);
    }, { passive: true });
    btn.addEventListener('touchend', () => clearTimeout(pressTimer));
    btn.addEventListener('touchmove', () => clearTimeout(pressTimer));
    btn.addEventListener('mouseenter', showLabels);
  });
}

function flashFabLabels() {
  const stack = document.querySelector('.map-fab-stack');
  if (!stack) return;
  setTimeout(() => {
    stack.classList.add('show-labels');
    setTimeout(() => stack.classList.remove('show-labels'), 1500);
  }, 300);
  // Discover FAB is self-managed via dialog
}

function requestAndShowLocation() {
  if (!window.isSecureContext || !('geolocation' in navigator)) return;

  const fab = document.getElementById('fab-location');
  fab.classList.add('active');

  navigator.geolocation.getCurrentPosition(
    pos => {
      state.userLat = pos.coords.latitude;
      state.userLng = pos.coords.longitude;
      showUserOnMap();
      leafletMap.setView([state.userLat, state.userLng], 15, { animate: true });
      setTimeout(() => fab.classList.remove('active'), 1000);
    },
    () => {
      fab.classList.remove('active');
    },
    { enableHighAccuracy: true }
  );
}

function showUserOnMap() {
  if (!state.userLat || !leafletMap) return;
  if (userLocationMarker) userLocationMarker.remove();
  if (window._userPulseMarker) window._userPulseMarker.remove();
  // Pulsing halo ring
  const pulseIcon = L.divIcon({
    className: 'user-loc-pulse',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
  window._userPulseMarker = L.marker([state.userLat, state.userLng], { icon: pulseIcon, interactive: false }).addTo(leafletMap);
  // Solid center dot with arrow
  const dotIcon = L.divIcon({
    className: 'user-loc-dot',
    html: '<div class="user-loc-inner"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
  userLocationMarker = L.marker([state.userLat, state.userLng], { icon: dotIcon, zIndexOffset: 1000 })
    .addTo(leafletMap).bindPopup('You are here');
}

function ensureLocation() {
  return new Promise((resolve, reject) => {
    if (state.userLat && state.userLng) return resolve();
    if (!window.isSecureContext || !('geolocation' in navigator)) return reject();
    navigator.geolocation.getCurrentPosition(
      pos => {
        state.userLat = pos.coords.latitude;
        state.userLng = pos.coords.longitude;
        showUserOnMap();
        resolve();
      },
      reject,
      { enableHighAccuracy: true }
    );
  });
}

function fabFindNearestMural() {
  ensureLocation().then(() => {
    const sorted = murals
      .filter(m => m.lat && m.lng)
      .map(m => ({ ...m, dist: haversineMiles(state.userLat, state.userLng, m.lat, m.lng) }))
      .sort((a, b) => a.dist - b.dist);

    if (!sorted.length) return;
    const nearest = sorted[0];

    if (!isInRange()) {
      showOutOfRangePopup();
      return;
    }

    showNearestPopup(nearest, null);
    leafletMap.setView([nearest.lat, nearest.lng], 16, { animate: true });
  }).catch(() => {});
}

function fabFindNearestTourStop() {
  ensureLocation().then(() => {
    if (!isInRange()) {
      showOutOfRangePopup();
      return;
    }

    // If user has toggled specific routes on, search only those; otherwise search all
    const activeRoutes = ROUTE_DEFS.filter(d => !hiddenRoutes.has(d.id));
    const searchRoutes = activeRoutes.length > 0 ? activeRoutes : ROUTE_DEFS;

    const tourMuralIds = new Set();
    const muralToRoutes = {};
    searchRoutes.forEach(def => {
      (def.ids || []).forEach(id => {
        tourMuralIds.add(id);
        if (!muralToRoutes[id]) muralToRoutes[id] = [];
        muralToRoutes[id].push(def);
      });
    });

    const sorted = murals
      .filter(m => m.lat && m.lng && tourMuralIds.has(m.id))
      .map(m => ({ ...m, dist: haversineMiles(state.userLat, state.userLng, m.lat, m.lng) }))
      .sort((a, b) => a.dist - b.dist);

    if (!sorted.length) return;
    const nearest = sorted[0];
    const routes = muralToRoutes[nearest.id] || [];

    const scopeLabel = activeRoutes.length > 0
      ? activeRoutes.map(r => r.name).join(', ')
      : 'all routes';
    showNearestPopup(nearest, routes, scopeLabel);
    leafletMap.setView([nearest.lat, nearest.lng], 16, { animate: true });
  }).catch(() => {});
}

function showNearestPopup(mural, routes, scopeLabel) {
  dismissNearestPopup();

  const distFt = Math.round(mural.dist * 5280);
  const distStr = mural.dist < 0.15
    ? `${distFt} ft away`
    : `${mural.dist.toFixed(2)} mi away`;

  const routeInfo = routes && routes.length
    ? `<p class="nearest-popup-route">On: ${routes.map(r => r.name).join(', ')}</p>`
    : '';

  const scopeInfo = scopeLabel
    ? `<p class="nearest-popup-scope">Searching: ${scopeLabel}</p>`
    : '';

  const joinBtn = routes && routes.length
    ? `<button class="nearest-popup-btn green" onclick="window.joinTourAt(${mural.id})">Join Tour at this Mural</button>`
    : '';

  const el = document.createElement('div');
  el.className = 'nearest-popup';
  el.innerHTML = `
    <div class="nearest-popup-top">
      <img src="${mural.img}" alt="${mural.a}">
      <div class="nearest-popup-info">
        <h4>${mural.a}</h4>
        <p>${distStr}${mural.t ? ' \u2022 ' + mural.t : ''}</p>
        ${routeInfo}
        ${scopeInfo}
      </div>
    </div>
    <div class="nearest-popup-actions">
      <button class="nearest-popup-btn green" onclick="window.dismissNearestPopup();window.startDirections(${mural.id})">Go To Mural</button>
      ${joinBtn}
    </div>
  `;

  document.getElementById('map-container').appendChild(el);
  nearestPopupEl = el;
}

function showOutOfRangePopup() {
  dismissNearestPopup();
  const el = document.createElement('div');
  el.className = 'map-range-banner';
  el.innerHTML = `
    <button class="nearest-popup-close" onclick="this.parentElement.remove()">&times;</button>
    <p>You're not in St. Pete yet!</p>
    <small>Catch a flight, hop a bus, board a plane, drive a car — get to St. Pete to start exploring murals.</small>
  `;
  document.getElementById('map-container').appendChild(el);
  nearestPopupEl = el;
}

function dismissNearestPopup() {
  if (nearestPopupEl) { nearestPopupEl.remove(); nearestPopupEl = null; }
}

function joinTourAt(muralId) {
  // Find which route this mural belongs to (pick the first one)
  for (const def of ROUTE_DEFS) {
    if (def.ids && def.ids.includes(muralId)) {
      dismissNearestPopup();
      switchTab('loops');
      openTour(def, muralId);
      return;
    }
  }
}
window.joinTourAt = joinTourAt;
window.dismissNearestPopup = dismissNearestPopup;
window.startDirections = startDirections;

/** Render category filter pills for the map view (All/Shine/Vintage/Commercial). */
function renderMapCatPills() {
  const catPillsEl = document.getElementById('map-cat-pills');
  const t = state.activeMapTab;
  catPillsEl.innerHTML = `
    <button class="year-pill ${t === 'all' ? 'active' : ''}" data-cat="all">All</button>
    <button class="year-pill ${t === 'shine' ? 'active' : ''}" data-cat="shine">Shine</button>
    <button class="year-pill ${t === 'vintage' ? 'active' : ''}" data-cat="vintage">Vintage</button>
    <button class="year-pill ${t === 'commercial' ? 'active' : ''}" data-cat="commercial">Commercial</button>
  `;
  catPillsEl.querySelectorAll('.year-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeMapTab = btn.dataset.cat;
      state.activeMapYears = null;
      renderMapCatPills();
      updateMapMarkers();
    });
  });
}

/**
 * Show/hide map markers based on active category + year filters.
 * Also re-renders year sub-pills and the year legend.
 */
function updateMapMarkers() {
  const tab = state.activeMapTab || 'all';
  const yearPillsEl = document.getElementById('map-year-pills');
  const legendEl = document.getElementById('map-legend');
  const useIcons = leafletMap.getZoom() >= ICON_ZOOM_THRESHOLD;

  let visibleYears;
  let visibleCats;
  if (tab === 'all') {
    visibleYears = null;
    visibleCats = null; // show all
  } else if (tab === 'shine') {
    visibleYears = state.activeMapYears || SHINE_YEARS;
    visibleCats = ['shine'];
  } else if (tab === 'vintage') {
    visibleYears = state.activeMapYears || [...VINTAGE_YEARS, 0];
    visibleCats = ['shine', 'shine-legacy'];
  } else {
    visibleYears = null;
    visibleCats = ['commercial'];
  }

  mapMarkers.forEach(entry => {
    const { dot, imgMarker, mural } = entry;
    const catMatch = visibleCats === null || visibleCats.includes(mural.cat);
    const yearMatch = visibleYears === null || visibleYears.includes(mural.y);
    const show = catMatch && yearMatch;
    entry.visible = show;
    if (show) {
      if (useIcons) {
        dot.removeFrom(leafletMap);
        imgMarker.addTo(leafletMap);
      } else {
        imgMarker.removeFrom(leafletMap);
        dot.addTo(leafletMap);
      }
    } else {
      dot.removeFrom(leafletMap);
      imgMarker.removeFrom(leafletMap);
    }
  });

  // Year sub-pills for Shine only
  if (tab === 'shine') {
    const years = SHINE_YEARS;
    const selected = state.activeMapYears;
    yearPillsEl.innerHTML = `
      <button class="year-pill year-sub ${!selected ? 'active' : ''}" data-year="">All</button>
      ${years.map(y => `
        <button class="year-pill year-sub ${selected && selected.includes(y) ? 'active' : ''}" data-year="${y}">
          <span class="year-dot" style="background:${YEAR_COLORS[y] || '#999'}"></span>${y}
        </button>
      `).join('')}
    `;
    yearPillsEl.hidden = false;
    yearPillsEl.querySelectorAll('.year-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const y = btn.dataset.year;
        if (!y) {
          state.activeMapYears = null;
        } else {
          const num = Number(y);
          if (!state.activeMapYears) state.activeMapYears = [];
          const idx = state.activeMapYears.indexOf(num);
          if (idx >= 0) {
            state.activeMapYears.splice(idx, 1);
            if (state.activeMapYears.length === 0) state.activeMapYears = null;
          } else {
            state.activeMapYears.push(num);
          }
        }
        renderMapCatPills();
        updateMapMarkers();
      });
    });
  } else {
    yearPillsEl.innerHTML = '';
    yearPillsEl.hidden = true;
  }

  // Legend — hide for vintage/commercial (no year breakdown)
  if (legendEl) {
    if (tab === 'vintage' || tab === 'commercial') {
      legendEl.innerHTML = `<div class="map-legend-item"><span class="map-legend-dot" style="background:#4285F4"></span>You</div>`;
    } else {
      const shownYears = [...new Set(
        mapMarkers
          .filter(({ mural }) => {
            const catMatch = visibleCats === null || visibleCats.includes(mural.cat);
            const yearMatch = visibleYears === null || visibleYears.includes(mural.y);
            return catMatch && yearMatch;
          })
          .map(({ mural }) => mural.y)
      )].sort((a, b) => b - a);

      legendEl.innerHTML = shownYears.map(y => {
        const color = YEAR_COLORS[y] || '#999';
        const label = y === 0 ? 'Other' : y;
        return `<div class="map-legend-item"><span class="map-legend-dot" style="background:${color}"></span>${label}</div>`;
      }).join('') + `<div class="map-legend-item"><span class="map-legend-dot" style="background:#4285F4"></span>You</div>`;
    }
  }
}

// =============================================
// Tours (Loop Tours — replaces Routes)
// =============================================
/**
 * Get murals for a route, ordered by nearest-neighbor walk.
 * Starts from the mural closest to the group centroid, then greedily
 * picks the nearest unvisited mural. Not optimal TSP, but good enough.
 */
function getRouteMurals(filterFn) {
  const list = murals.filter(m => m.lat && m.lng && filterFn(m));
  if (list.length < 2) return list;

  const avgLat = list.reduce((s, m) => s + m.lat, 0) / list.length;
  const avgLng = list.reduce((s, m) => s + m.lng, 0) / list.length;
  const sorted = [];
  const remaining = [...list];

  remaining.sort((a, b) => haversine(avgLat, avgLng, a.lat, a.lng) - haversine(avgLat, avgLng, b.lat, b.lng));
  sorted.push(remaining.shift());

  while (remaining.length) {
    const last = sorted[sorted.length - 1];
    remaining.sort((a, b) => haversine(last.lat, last.lng, a.lat, a.lng) - haversine(last.lat, last.lng, b.lat, b.lng));
    sorted.push(remaining.shift());
  }
  return sorted;
}

/** Sum haversine distances between consecutive stops. Returns total meters. */
function calcRouteTotalDist(orderedMurals) {
  let total = 0;
  for (let i = 1; i < orderedMurals.length; i++) {
    total += haversine(orderedMurals[i-1].lat, orderedMurals[i-1].lng, orderedMurals[i].lat, orderedMurals[i].lng);
  }
  return total;
}

// Tour color palette for picker map
const TOUR_COLORS = {
  'downtown-north':  '#E53935',
  'the-edge':        '#1E88E5',
  'methodist-town':  '#7B1FA2',
  'tropicana-field': '#43A047',
  'central-ave':     '#FB8C00',
  'arts-district':   '#F06292',
};

// Neighborhood walking routes + bike tour
const ROUTE_DEFS = [
  { id: 'downtown-north', name: 'Downtown North', desc: 'Hollander to Fintan Magee — 15 stops through the waterfront & 600 block',
    ids: [6, 116, 23, 30, 1, 129, 66, 109, 110, 7, 9, 111, 115, 73, 24] },
  { id: 'the-edge', name: 'The Edge', desc: 'Matt Kress to Zulu Painter — 12 stops along the Edge District',
    ids: [119, 80, 75, 120, 57, 135, 40, 130, 89, 98, 43, 34] },
  { id: 'methodist-town', name: 'Methodist Town', desc: 'Cecilia Lueza to Jeff Williams — 8 stops along MLK Jr corridor',
    ids: [4, 61, 113, 112, 108, 24, 114, 64] },
  { id: 'tropicana-field', name: 'Tropicana Field', desc: 'Dream Weaver to Illsol — 8 stops around the stadium district',
    ids: [59, 103, 20, 52, 44, 123, 16, 125] },
  { id: 'central-ave', name: 'Central Ave', desc: 'Michael Vasquez to IBOMS — 9 stops along Grand Central',
    ids: [48, 122, 62, 55, 76, 71, 88, 38, 101] },
  { id: 'arts-district', name: 'Arts District', desc: 'Cecilia Lueza to Gleo — 13 stops through the Warehouse Arts District',
    ids: [140, 90, 84, 72, 29, 39, 10, 25, 12, 93, 121, 50, 79] },
];

// All routes off by default
hiddenRoutes = new Set(ROUTE_DEFS.map(d => d.id));

function getRouteOrdered(def) {
  if (def.ids) {
    return def.ids.map(id => murals.find(m => m.id === id)).filter(m => m && m.lat && m.lng);
  }
  return getRouteMurals(def.filter);
}

/** Modular wrap for continuous loop indexing. */
function wrapIndex(i, len) {
  return ((i % len) + len) % len;
}

/** Find tour stop closest to user's GPS. Returns index or 0. */
function findNearestTourStop(stops) {
  if (!state.userLat || !state.userLng || stops.length === 0) return 0;
  let best = 0;
  let bestDist = Infinity;
  stops.forEach((m, i) => {
    const d = haversine(state.userLat, state.userLng, m.lat, m.lng);
    if (d < bestDist) { bestDist = d; best = i; }
  });
  return best;
}

/** Build HTML for one tour stop card. type: 'active' (prominent) or 'faded' (grayed). */
function buildTourCard(mural, num, type) {
  const cls = type === 'faded' ? ' faded' : '';
  return `
    <div class="tour-stop-card${cls}" data-id="${mural.id}">
      <img class="tour-stop-img" src="${mural.img || ''}" alt="${mural.a}" loading="lazy" onerror="this.style.background='#ddd'">
      <div class="tour-stop-body">
        <div class="tour-stop-num">${num}</div>
        <div class="tour-stop-text">
          <div class="tour-stop-artist">${mural.a}</div>
          <div class="tour-stop-loc">${mural.bldg || mural.loc || ''}</div>
        </div>
      </div>
    </div>
  `;
}

/** Render the tour list screen — shows picker map or loop view. */
function renderTourList() {
  if (state.activeTour) {
    renderTourLoop();
    return;
  }
  renderTourPicker();
}

let pickerMiniMaps = {};

/** Destroy all rotary mini-maps. */
function destroyPickerMiniMaps() {
  Object.values(pickerMiniMaps).forEach(m => { try { m.remove(); } catch(e) {} });
  pickerMiniMaps = {};
}

/** Create or refresh a mini Leaflet map inside a rotary card. */
function ensureRotaryMap(i) {
  if (pickerMiniMaps[i]) {
    pickerMiniMaps[i].invalidateSize();
    return;
  }

  const def = ROUTE_DEFS[i];
  const container = document.getElementById(`rmap-${i}`);
  if (!container) return;

  const color = TOUR_COLORS[def.id] || '#999';
  const ordered = getRouteOrdered(def);
  if (ordered.length < 2) return;

  // Use cached route coords or fallback to stop coords
  const coords = tourPickerCache.get(def.id) || ordered.map(m => [m.lat, m.lng]);

  const m = L.map(container, {
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: false,
    keyboard: false,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
  }).addTo(m);

  // Route polyline
  const line = L.polyline(coords, { color, weight: 4, opacity: 0.8, lineCap: 'round' }).addTo(m);

  // Stop dots
  ordered.forEach((s, j) => {
    L.circleMarker([s.lat, s.lng], {
      radius: 5, fillColor: color, fillOpacity: 1, color: '#fff', weight: 2,
    }).addTo(m);
  });

  // Numbered first & last
  const mkIcon = (num) => L.divIcon({
    className: '',
    html: `<div style="background:${color};color:#fff;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;font-family:Quicksand,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,0.3);border:2px solid #fff">${num}</div>`,
    iconSize: [20, 20], iconAnchor: [10, 10],
  });
  L.marker([ordered[0].lat, ordered[0].lng], { icon: mkIcon(1) }).addTo(m);
  L.marker([ordered[ordered.length-1].lat, ordered[ordered.length-1].lng], { icon: mkIcon(ordered.length) }).addTo(m);

  m.fitBounds(line.getBounds(), { padding: [20, 20], maxZoom: 15 });
  pickerMiniMaps[i] = m;
}

const ROTARY_COMPACT_H = 72;
const ROTARY_EXPANDED_H = 300;
const ROTARY_GAP = 10;

/** Calculate Y-offset so the focused card is centered in the zone. */
function updateRotaryPositions() {
  const zone = document.getElementById('rotary-zone');
  const track = document.getElementById('rotary-track');
  if (!zone || !track) return;

  const zoneH = zone.clientHeight;
  const centerY = zoneH / 2;

  let aboveH = 0;
  for (let i = 0; i < pickerActiveRoute; i++) aboveH += ROTARY_COMPACT_H + ROTARY_GAP;
  const offset = centerY - (ROTARY_EXPANDED_H / 2) - aboveH;
  track.style.transform = `translateY(${offset}px)`;

  const cards = track.querySelectorAll('.rotary-card');
  cards.forEach((card, i) => {
    const dist = Math.abs(i - pickerActiveRoute);
    card.classList.remove('compact', 'expanded', 'near');
    if (i === pickerActiveRoute) {
      card.classList.add('expanded');
    } else {
      card.classList.add('compact');
      if (dist === 1) card.classList.add('near');
    }
  });

  // Lazy-init the focused mini-map after transition
  setTimeout(() => ensureRotaryMap(pickerActiveRoute), 480);
}

/** Set up touch (flick) handling on the rotary zone. */
function setupRotaryTouch(zone) {
  let touchStartY = 0;
  let touchStartTime = 0;
  let dragging = false;

  zone.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
    dragging = true;
  }, { passive: true });

  zone.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    e.preventDefault();
  }, { passive: false });

  zone.addEventListener('touchend', (e) => {
    if (!dragging) return;
    dragging = false;

    const dy = e.changedTouches[0].clientY - touchStartY;
    const dt = Date.now() - touchStartTime;
    const velocity = dy / dt;

    let steps = 0;
    if (Math.abs(dy) > 25) {
      steps = dy < 0 ? 1 : -1;
    }

    const newIdx = Math.max(0, Math.min(ROUTE_DEFS.length - 1, pickerActiveRoute + steps));
    if (newIdx !== pickerActiveRoute) {
      pickerActiveRoute = newIdx;
      updateRotaryPositions();
    }
  }, { passive: true });

  // Mouse wheel for desktop
  let wheelTimeout;
  zone.addEventListener('wheel', (e) => {
    e.preventDefault();
    clearTimeout(wheelTimeout);
    wheelTimeout = setTimeout(() => {
      if (e.deltaY > 0 && pickerActiveRoute < ROUTE_DEFS.length - 1) pickerActiveRoute++;
      else if (e.deltaY < 0 && pickerActiveRoute > 0) pickerActiveRoute--;
      updateRotaryPositions();
    }, 50);
  }, { passive: false });
}

/** Render the tour picker: scrollable card list with lazy mini-maps. */
function renderTourPicker() {
  // Destroy any stale picker map / mini-maps
  if (tourPickerMap) {
    try { tourPickerMap.remove(); } catch(e) {}
    tourPickerMap = null;
  }
  destroyPickerMiniMaps();

  // Prefetch route coords for all routes
  ROUTE_DEFS.forEach(def => loadRouteCoords(def));

  function buildCardHtml(def, i, withMap) {
    const ordered = getRouteOrdered(def);
    const color = TOUR_COLORS[def.id] || '#999';
    const rd = ROUTE_PATHS[def.id];
    const dist = rd && rd.distance ? rd.distance + ' mi' : '';
    const isBike = def.id.includes('bike');
    const timeEst = dist ? (isBike ? '~20 min bike' : '~30 min walk') : '';
    const mapSection = withMap
      ? `<div class="tour-list-card-map"><div id="rmap-${i}" style="width:100%;height:100%"></div><div class="tour-list-card-map-fade"></div></div>`
      : `<div class="tour-list-card-map" style="background:linear-gradient(135deg, ${color}22 0%, ${color}08 100%)"></div>`;
    return `
      <div class="tour-list-card" data-index="${i}">
        ${mapSection}
        <div class="tour-list-card-info">
          <div class="tour-list-card-accent" style="background:${color}"></div>
          <div class="tour-list-card-details">
            <div class="tour-list-card-name">${def.name}</div>
            <div class="tour-list-card-desc">${def.desc}</div>
            <div class="tour-list-card-stats">
              <span class="tour-list-card-stat">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
                ${ordered.length} stops
              </span>
              ${dist ? `<span class="tour-list-card-stat">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                ${dist}
              </span>` : ''}
              ${timeEst ? `<span class="tour-list-card-stat">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                ${timeEst}
              </span>` : ''}
            </div>
          </div>
          <div>
            <button class="tour-list-go-btn" data-index="${i}">
              Go
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
        </div>
      </div>`;
  }
  const cardsHtml = ROUTE_DEFS.map((def, i) => buildCardHtml(def, i, true)).join('');
  const cloneHtml = ROUTE_DEFS.map((def, i) => buildCardHtml(def, i, false)).join('');

  views.loops.innerHTML = `
    <div class="tour-picker-layout">
      <div class="tours-large-title">
        <h1>Tours</h1>
        <p>Scroll to Browse, Tap Go</p>
      </div>
      <div class="tour-list-scroll" id="tour-list-scroll">
        ${cloneHtml}${cardsHtml}${cloneHtml}
      </div>
    </div>
  `;

  // Click to start tour
  views.loops.addEventListener('click', (e) => {
    const goBtn = e.target.closest('.tour-list-go-btn');
    if (goBtn) {
      const idx = Number(goBtn.dataset.index);
      openTour(ROUTE_DEFS[idx]);
      return;
    }
    const card = e.target.closest('.tour-list-card');
    if (card) {
      const idx = Number(card.dataset.index);
      openTour(ROUTE_DEFS[idx]);
    }
  });

  // Lazy-init mini-maps using IntersectionObserver
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const idx = Number(entry.target.dataset.index);
        setTimeout(() => ensureRotaryMap(idx), 100);
        observer.unobserve(entry.target);
      }
    });
  }, { rootMargin: '100px' });

  views.loops.querySelectorAll('.tour-list-card').forEach(card => observer.observe(card));

  // Infinite scroll — reset to middle copy when near edges
  const scrollEl = document.getElementById('tour-list-scroll');
  if (scrollEl) {
    const resetToMiddle = () => {
      const totalH = scrollEl.scrollHeight;
      const oneSetH = totalH / 3;
      scrollEl.scrollTop = oneSetH;
    };
    // Start at middle copy
    requestAnimationFrame(resetToMiddle);

    scrollEl.addEventListener('scroll', () => {
      const totalH = scrollEl.scrollHeight;
      const oneSetH = totalH / 3;
      if (scrollEl.scrollTop < oneSetH * 0.15) {
        scrollEl.scrollTop += oneSetH;
      } else if (scrollEl.scrollTop > oneSetH * 1.85) {
        scrollEl.scrollTop -= oneSetH;
      }
    }, { passive: true });
  }
}

/** Create the Leaflet map for the tour picker. */
function initTourPickerMap() {
  const container = document.getElementById('tour-picker-map');
  if (!container) return;

  tourPickerMap = L.map(container, {
    center: [27.7706, -82.6341],
    zoom: 14,
    zoomControl: false,
    attributionControl: false,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
  }).addTo(tourPickerMap);

  // Show user location
  if (state.userLat && state.userLng) {
    const pos = [state.userLat, state.userLng];
    L.marker(pos, { icon: L.divIcon({ className: 'user-loc-pulse', iconSize: [40,40], iconAnchor: [20,20] }), interactive: false }).addTo(tourPickerMap);
    L.marker(pos, { icon: L.divIcon({ className: 'user-loc-dot', html: '<div class="user-loc-inner"></div>', iconSize: [18,18], iconAnchor: [9,9] }), zIndexOffset: 1000 }).addTo(tourPickerMap).bindPopup('You are here');
  }

  // Fetch active route first, show it immediately, then prefetch the rest
  setTimeout(() => {
    if (tourPickerMap) tourPickerMap.invalidateSize();
    fetchAndShowRoute(pickerActiveRoute).then(() => prefetchRemainingRoutes());
  }, 50);
}

/** Load route coords into cache — uses static KML data if available, else OSRM. */
function loadRouteCoords(def) {
  if (tourPickerCache.has(def.id)) return Promise.resolve();

  // Use pre-built route if available
  if (ROUTE_PATHS[def.id]) {
    const rd = ROUTE_PATHS[def.id];
    const coords = rd.path || (rd.segments ? rd.segments.flat() : null);
    if (coords) {
      tourPickerCache.set(def.id, coords);
      return Promise.resolve();
    }
  }

  // Fallback: fetch from OSRM
  const ordered = getRouteOrdered(def);
  if (ordered.length < 2) return Promise.resolve();

  const waypoints = ordered.map(m => `${m.lng},${m.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson`;

  return fetch(url)
    .then(r => r.json())
    .then(data => {
      if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error('No route');
      tourPickerCache.set(def.id, data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]));
    })
    .catch(() => {
      tourPickerCache.set(def.id, ordered.map(m => [m.lat, m.lng]));
    });
}

/** Fetch a single route into cache and show it on the picker map. */
function fetchAndShowRoute(idx) {
  const def = ROUTE_DEFS[idx];
  return loadRouteCoords(def).then(() => showPickerRoute(idx));
}

/** Prefetch remaining routes in the background (not the active one). */
function prefetchRemainingRoutes() {
  ROUTE_DEFS.forEach((def, i) => {
    if (i === pickerActiveRoute) return;
    loadRouteCoords(def);
  });
}

/** Calculate total distance in meters from an array of [lat,lng] coords. */
function routeDistance(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversine(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]);
  }
  return total;
}

/** Show a single route on the picker map by ROUTE_DEFS index. */
function showPickerRoute(idx) {
  if (!tourPickerMap) return;

  // Clear previous layers
  pickerLayers.forEach(layer => layer.removeFrom(tourPickerMap));
  pickerLayers = [];

  const def = ROUTE_DEFS[idx];
  const color = TOUR_COLORS[def.id] || '#999';
  const ordered = getRouteOrdered(def);
  if (ordered.length < 2) return;

  const coords = tourPickerCache.get(def.id);
  if (!coords) return;

  // Draw polyline
  const dashed = ordered.length === coords.length; // fallback = same count as stops
  const opts = { color, weight: 5, opacity: 0.85 };
  if (dashed) { opts.weight = 3; opts.opacity = 0.5; opts.dashArray = '8, 8'; }
  const polyline = L.polyline(coords, opts).addTo(tourPickerMap);
  polyline.on('click', () => openTour(def));
  pickerLayers.push(polyline);

  // Stop markers with numbers
  ordered.forEach((m, i) => {
    const marker = L.marker([m.lat, m.lng], {
      icon: L.divIcon({
        className: 'tour-picker-stop',
        html: `<span style="background:${color}">${i + 1}</span>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      })
    }).addTo(tourPickerMap);
    pickerLayers.push(marker);
  });

  // Fit bounds
  tourPickerMap.fitBounds(polyline.getBounds(), { padding: [40, 40], maxZoom: 15 });

  // Route stats info box
  const distM = routeDistance(coords);
  const distMi = (distM / 1609.34).toFixed(1);
  const isBike = def.id.includes('bike');
  const totalMins = isBike ? Math.round(distM / 200) : Math.round(distM / 80);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const timeText = hrs > 0 ? `~${hrs}h ${mins}m ${isBike ? 'bike' : 'walk'}` : `~${mins}m ${isBike ? 'bike' : 'walk'}`;

  // Remove old info box
  const oldBox = document.querySelector('.tour-stats-box');
  if (oldBox) oldBox.remove();

  const box = document.createElement('div');
  box.className = 'tour-stats-box';
  box.innerHTML = `
    <strong>${def.name}</strong>
    <span>${ordered.length} stops · ${distMi} mi · ${timeText}</span>
  `;
  document.getElementById('tour-picker-map').appendChild(box);
}

/** Open a tour — set state, find start index, render loop view. */
function openTour(def, startAtMuralId) {
  // Destroy picker map / rotary mini-maps before container gets replaced
  if (tourPickerMap) {
    tourPickerMap.remove();
    tourPickerMap = null;
  }
  destroyPickerMiniMaps();

  const stops = getRouteOrdered(def);
  if (stops.length === 0) return;

  state.activeTour = def;
  state.tourStops = stops;
  state.tourDirection = 'fwd';

  // If a specific mural ID was provided, start there
  if (startAtMuralId != null) {
    const idx = stops.findIndex(m => m.id === startAtMuralId);
    state.tourIndex = idx >= 0 ? idx : findNearestTourStop(stops);
  } else {
    state.tourIndex = findNearestTourStop(stops);
  }
  state.tourMapReady = false;
  state.tourRoute = null;
  state.tourMarkers = [];
  state.tourFetching = false;

  renderTourLoop();
}

// =============================================
// Compass Bearing Arc
// =============================================

/** Generate compass arc HTML: 21 dots in a frown curve + enable button + label. */
function buildCompassArcHTML() {
  let dots = '';
  const mid = Math.floor(COMPASS_ARC_DOTS / 2); // 10
  for (let i = 0; i < COMPASS_ARC_DOTS; i++) {
    // Parabolic frown curve: center high, edges low
    const norm = (i - mid) / mid; // -1 to 1
    const arcY = Math.round((1 - norm * norm) * 6); // 6 at center, 0 at edges
    dots += `<span class="compass-dot" data-heat="cold" style="--arc-y:${arcY}px"></span>`;
  }
  return `
    <div class="compass-arc" hidden>
      <span class="compass-arrow compass-arrow-left" hidden>&larr;</span>
      <div class="compass-arc-dots">${dots}</div>
      <span class="compass-arrow compass-arrow-right" hidden>&rarr;</span>
    </div>
    <div class="compass-cal-hint" hidden>Compass calibrating — accuracy improves as you walk</div>
    <button class="compass-enable-btn" hidden>Enable Compass</button>
  `;
}

/** Init compass arc: check availability, show enable button on iOS or auto-start on Android. */
function initCompassArc() {
  if (!window.DeviceOrientationEvent) return;

  const arcEl = views.loops.querySelector('.compass-arc');
  const btnEl = views.loops.querySelector('.compass-enable-btn');
  if (!arcEl || !btnEl) return;

  // iOS requires a user gesture to request permission
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    if (compassGrantedThisSession) {
      // Already granted this session — start directly
      startCompassListener(arcEl);
    } else {
      btnEl.hidden = false;
      btnEl.addEventListener('click', () => requestCompassPermission(arcEl, btnEl));
    }
  } else {
    // Android — start directly
    startCompassListener(arcEl);
  }
}

/** iOS permission flow — must be called from a user gesture. */
function requestCompassPermission(arcEl, btnEl) {
  DeviceOrientationEvent.requestPermission().then(perm => {
    if (perm === 'granted') {
      state.compassPermission = true;
      compassGrantedThisSession = true;
      localStorage.setItem('compassGranted', '1');
      btnEl.hidden = true;
      startCompassListener(arcEl);
    } else {
      console.warn('Compass permission:', perm);
    }
  }).catch(err => { console.warn('Compass permission error:', err); });
}

/** Attach deviceorientation listener + start GPS for compass. */
function startCompassListener(arcEl) {
  state.compassAvailable = true;
  arcEl.hidden = false;

  // Show calibration hint, fade out after 6s
  const hint = arcEl.parentElement?.querySelector('.compass-cal-hint');
  if (hint) {
    hint.hidden = false;
    hint.style.opacity = '1';
    setTimeout(() => { hint.style.opacity = '0'; }, 12000);
    setTimeout(() => { hint.hidden = true; }, 13000);
  }

  compassHandler = (e) => {
    // iOS: webkitCompassHeading (0=N, clockwise). Android: 360 - alpha.
    let heading = e.webkitCompassHeading != null
      ? e.webkitCompassHeading
      : (e.alpha != null ? (360 - e.alpha) % 360 : null);
    if (heading == null) return;

    // Exponential smoothing to reduce jitter (lower = smoother)
    const ALPHA = 0.3;
    if (compassSmoothedHeading == null) {
      compassSmoothedHeading = heading;
    } else {
      let diff = heading - compassSmoothedHeading;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      compassSmoothedHeading = (compassSmoothedHeading + diff * ALPHA + 360) % 360;
    }
    state.compassHeading = compassSmoothedHeading;
    scheduleArcUpdate();
  };
  window.addEventListener('deviceorientation', compassHandler, true);

  ensureGpsForCompass();
}

/** Start a GPS watcher for compass if walk mode isn't already providing one. */
function ensureGpsForCompass() {
  if (state.walkWatchId != null) return; // discover mode is running, piggyback
  if (compassGpsWatchId != null) return; // already watching
  compassGpsWatchId = navigator.geolocation.watchPosition(
    pos => {
      state.userLat = pos.coords.latitude;
      state.userLng = pos.coords.longitude;
      updateTourUserLocation();
      scheduleArcUpdate();
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 0 }
  );
}

/** Throttle arc updates to rAF. */
function scheduleArcUpdate() {
  if (compassAnimFrame) return;
  compassAnimFrame = requestAnimationFrame(() => {
    compassAnimFrame = null;
    updateCompassArc();
  });
}

/** Core HUD update: compute bearing, translate indicator bar toward target mural. */
function updateCompassArc() {
  const arcEl = views.loops.querySelector('.compass-arc');
  if (!arcEl || arcEl.hidden) return;
  if (state.compassHeading == null || state.userLat == null) return;
  if (!state.tourStops.length) return;

  const tLen = state.tourStops.length;
  const tIdx = state.tourIndex;
  const targetIdx = state.tourDirection === 'fwd'
    ? wrapIndex(tIdx + 1, tLen)
    : wrapIndex(tIdx - 1, tLen);
  const target = state.tourStops[targetIdx];
  if (!target || !target.lat || !target.lng) return;

  const dist = haversine(state.userLat, state.userLng, target.lat, target.lng);
  const targetBearing = bearing(state.userLat, state.userLng, target.lat, target.lng);

  // Relative angle: positive = target to right, negative = left
  let rel = targetBearing - state.compassHeading;
  if (rel > 180) rel -= 360;
  if (rel < -180) rel += 360;

  // Translate the entire bar so the green chevron points toward the target
  // When target is to the right (rel > 0), shift bar left so chevron moves right
  const bar = arcEl.querySelector('.hud-indicator-bar');
  if (bar) {
    const clampedRel = Math.max(-90, Math.min(90, rel));
    const halfBarWidth = bar.offsetWidth / 2;
    const offset = (clampedRel / 90) * halfBarWidth * 0.6;
    bar.style.transform = `translateX(${offset}px)`;
  }

  // Show directional arrows when target is off-screen (beyond ±90°)
  const leftArrow = arcEl.querySelector('.hud-offscreen-left');
  const rightArrow = arcEl.querySelector('.hud-offscreen-right');
  if (leftArrow) leftArrow.hidden = rel >= -90;
  if (rightArrow) rightArrow.hidden = rel <= 90;

  // Update distance/time
  const distEl = document.getElementById('tour-nav-dist');
  const timeEl = document.getElementById('tour-nav-time');
  if (distEl) distEl.textContent = formatDistance(dist);
  if (timeEl) {
    const mins = Math.max(1, Math.round(dist / 80));
    timeEl.textContent = mins < 60 ? `${mins} min walk` : `${(mins / 60).toFixed(1)} hr walk`;
  }
}

/** Stop compass arc: remove listeners, cancel rAF, clear GPS watcher. */
function stopCompassArc() {
  if (compassHandler) {
    window.removeEventListener('deviceorientation', compassHandler, true);
    compassHandler = null;
  }
  if (compassAnimFrame) {
    cancelAnimationFrame(compassAnimFrame);
    compassAnimFrame = null;
  }
  if (compassGpsWatchId != null) {
    navigator.geolocation.clearWatch(compassGpsWatchId);
    compassGpsWatchId = null;
  }
  compassSmoothedHeading = null;
  state.compassAvailable = false;
  state.compassHeading = null;
  state.compassPermission = false;
}

// =============================================
// Detail Page Compass (reuses compass infrastructure)
// =============================================

let detailCompassHandler = null;
let detailCompassAnimFrame = null;
let detailCompassGpsWatchId = null;
let detailCompassSmoothed = null;
let detailCompassHeading = null;

/** Init compass arc on the detail page, targeting the selected mural. */
function initDetailCompass(mural) {
  if (!mural || !mural.lat || !mural.lng) return;
  if (!window.DeviceOrientationEvent) return;

  const wrap = detailContent.querySelector('.detail-compass-wrap');
  if (!wrap) return;
  const arcEl = wrap.querySelector('.compass-arc');
  const btnEl = wrap.querySelector('.compass-enable-btn');
  if (!arcEl || !btnEl) return;

  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    if (compassGrantedThisSession) {
      startDetailCompassListener(arcEl, mural);
    } else {
      btnEl.hidden = false;
      btnEl.addEventListener('click', () => requestDetailCompassPermission(arcEl, btnEl, mural));
    }
  } else {
    startDetailCompassListener(arcEl, mural);
  }
}

function requestDetailCompassPermission(arcEl, btnEl, mural) {
  DeviceOrientationEvent.requestPermission().then(perm => {
    if (perm === 'granted') {
      compassGrantedThisSession = true;
      localStorage.setItem('compassGranted', '1');
      btnEl.hidden = true;
      startDetailCompassListener(arcEl, mural);
    }
  }).catch(err => { console.warn('Detail compass permission error:', err); });
}

function startDetailCompassListener(arcEl, mural) {
  arcEl.hidden = false;
  const infoEl = detailContent.querySelector('.detail-nav-info');
  if (infoEl) infoEl.hidden = false;

  // Show calibration hint, fade out after 6s
  const hint = arcEl.parentElement?.querySelector('.compass-cal-hint');
  if (hint) {
    hint.hidden = false;
    hint.style.opacity = '1';
    setTimeout(() => { hint.style.opacity = '0'; }, 12000);
    setTimeout(() => { hint.hidden = true; }, 13000);
  }

  detailCompassHandler = (e) => {
    let heading = e.webkitCompassHeading != null
      ? e.webkitCompassHeading
      : (e.alpha != null ? (360 - e.alpha) % 360 : null);
    if (heading == null) return;

    const ALPHA = 0.3;
    if (detailCompassSmoothed == null) {
      detailCompassSmoothed = heading;
    } else {
      let diff = heading - detailCompassSmoothed;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      detailCompassSmoothed = (detailCompassSmoothed + diff * ALPHA + 360) % 360;
    }
    detailCompassHeading = detailCompassSmoothed;
    scheduleDetailArcUpdate(mural);
  };
  window.addEventListener('deviceorientation', detailCompassHandler, true);

  // GPS watcher for detail compass
  if (detailCompassGpsWatchId == null && state.walkWatchId == null && compassGpsWatchId == null) {
    detailCompassGpsWatchId = navigator.geolocation.watchPosition(
      pos => {
        state.userLat = pos.coords.latitude;
        state.userLng = pos.coords.longitude;
        scheduleDetailArcUpdate(mural);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0 }
    );
  }

  // Update distance/time immediately if we have a position
  if (state.userLat && state.userLng) {
    updateDetailNavInfo(mural);
  }
}

function scheduleDetailArcUpdate(mural) {
  if (detailCompassAnimFrame) return;
  detailCompassAnimFrame = requestAnimationFrame(() => {
    detailCompassAnimFrame = null;
    updateDetailCompass(mural);
  });
}

function updateDetailCompass(mural) {
  const arcEl = detailContent?.querySelector('.detail-compass-arc');
  if (!arcEl || arcEl.hidden) return;
  if (detailCompassHeading == null || state.userLat == null) return;
  if (!mural || !mural.lat || !mural.lng) return;

  const targetBearing = bearing(state.userLat, state.userLng, mural.lat, mural.lng);
  let rel = targetBearing - detailCompassHeading;
  if (rel > 180) rel -= 360;
  if (rel < -180) rel += 360;

  // Translate the HUD bar so the green chevron points toward the mural
  const bar = arcEl.querySelector('.hud-indicator-bar');
  if (bar) {
    const clampedRel = Math.max(-90, Math.min(90, rel));
    const halfBarWidth = bar.offsetWidth / 2;
    const offset = (clampedRel / 90) * halfBarWidth * 0.6;
    bar.style.transform = `translateX(${offset}px)`;
  }

  // Show directional arrows when target is off-screen (beyond ±90°)
  const leftArrow = arcEl.querySelector('.hud-offscreen-left');
  const rightArrow = arcEl.querySelector('.hud-offscreen-right');
  if (leftArrow) leftArrow.hidden = rel >= -90;
  if (rightArrow) rightArrow.hidden = rel <= 90;

  updateDetailNavInfo(mural);
}

function updateDetailNavInfo(mural) {
  if (!state.userLat || !state.userLng || !mural.lat || !mural.lng) return;
  const dist = haversine(state.userLat, state.userLng, mural.lat, mural.lng);
  const distEl = detailContent?.querySelector('.detail-nav-dist');
  const timeEl = detailContent?.querySelector('.detail-nav-time');
  if (distEl) distEl.textContent = formatDistance(dist);
  if (timeEl) {
    const mins = Math.max(1, Math.round(dist / 80));
    timeEl.textContent = mins < 60 ? `${mins} min walk` : `${(mins / 60).toFixed(1)} hr walk`;
  }
}

function stopDetailCompass() {
  if (detailCompassHandler) {
    window.removeEventListener('deviceorientation', detailCompassHandler, true);
    detailCompassHandler = null;
  }
  if (detailCompassAnimFrame) {
    cancelAnimationFrame(detailCompassAnimFrame);
    detailCompassAnimFrame = null;
  }
  if (detailCompassGpsWatchId != null) {
    navigator.geolocation.clearWatch(detailCompassGpsWatchId);
    detailCompassGpsWatchId = null;
  }
  detailCompassSmoothed = null;
  detailCompassHeading = null;
}

/** Destroy tour mini-map, reset state, show list. */
function closeTour() {
  stopCompassArc();
  if (tourMap) {
    tourMap.remove();
    tourMap = null;
  }
  destroyPickerMiniMaps();
  state.activeTour = null;
  state.tourStops = [];
  state.tourIndex = 0;
  state.tourMapReady = false;
  state.tourRoute = null;
  state.tourAdjacentRoutes = [];
  state.tourMarkers = [];
  state.tourFetching = false;
}

/** Build HTML for tour step dot indicators. */
function buildTourDots(len, activeIdx, color) {
  let html = '';
  for (let i = 0; i < len; i++) {
    let cls = 'active-tour-dot';
    if (i === activeIdx) cls += ' active';
    else if (i < activeIdx) cls += ' visited';
    const style = i === activeIdx ? ` style="background:${color}"` : '';
    html += `<span class="${cls}"${style}></span>`;
  }
  return html;
}

/** Render the full tour loop view: nav bar, map, bottom panel. */
function renderTourLoop() {
  const stops = state.tourStops;
  const len = stops.length;
  const idx = state.tourIndex;
  const curr = idx;
  const prev = wrapIndex(idx - 1, len);
  const next = wrapIndex(idx + 1, len);

  const routeColor = TOUR_COLORS[state.activeTour.id] || '#0E918C';
  const pct = Math.round(((curr + 1) / len) * 100);

  views.loops.innerHTML = `
    <div class="tour-layout">
      <!-- Nav bar -->
      <div class="active-tour-nav">
        <button class="active-tour-back" aria-label="Back to tour list">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div class="active-tour-nav-info">
          <div class="active-tour-nav-name">${state.activeTour.name}</div>
        </div>
        <button class="active-tour-close" aria-label="End tour">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>

      <!-- Map zone -->
      <div class="active-tour-map-zone">
        <div id="tour-map-container" style="width:100%;height:100%"></div>
        <div class="tour-hud-overlay">
          <div class="compass-arc tour-compass-arc" hidden>
            <span class="hud-offscreen hud-offscreen-left" hidden>&larr;</span>
            <div class="hud-indicator-bar">${(() => {
              let segs = '';
              const TICKS = 81;
              const MID = Math.floor(TICKS / 2);
              for (let i = 0; i < TICKS; i++) {
                const norm = (i - MID) / MID;
                const arcY = Math.round((1 - norm * norm) * 28);
                if (i === MID) {
                  segs += '<div class="hud-chevron" style="margin-bottom:' + arcY + 'px"><svg width="36" height="16" viewBox="0 0 36 16"><path d="M2,15 L18,2 L34,15" fill="none" stroke="#22C55E" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>';
                } else {
                  const d = Math.abs(i - MID);
                  const cls = d <= 3 ? 'hud-tick warm' : d <= 9 ? 'hud-tick hot' : d <= 19 ? 'hud-tick faint' : d <= 29 ? 'hud-tick faint2' : (i % 5 === 0 ? 'hud-tick major' : 'hud-tick');
                  segs += '<span class="' + cls + '" style="margin-bottom:' + arcY + 'px"></span>';
                }
              }
              return segs;
            })()}</div>
            <span class="hud-offscreen hud-offscreen-right" hidden>&rarr;</span>
          </div>
          <div class="hud-info">
            <span class="hud-dist" id="tour-nav-dist"></span>
            <span class="hud-sep">&middot;</span>
            <span class="hud-time" id="tour-nav-time"></span>
          </div>
          <button class="compass-enable-btn" hidden>Enable Compass</button>
          <div class="compass-cal-hint" hidden>Compass calibrating — accuracy improves as you walk</div>
        </div>
      </div>

      <!-- Bottom panel -->
      <div class="active-tour-bottom">

        <div class="active-tour-carousel">
          <!-- Prev -->
          <div class="tour-card tour-card-prev${state.tourDirection === 'back' ? ' tour-card-active' : ' tour-card-inactive'}" data-id="${stops[prev].id}">
            <span class="tour-card-label">Next</span>
            <div class="tour-card-img-wrap">
              <img class="tour-card-img" src="${stops[prev].img || ''}" alt="${stops[prev].a}" onerror="this.style.background='#ddd'">
              <span class="tour-card-num">${prev + 1}</span>
            </div>
            <div class="tour-card-artist">${stops[prev].a}</div>
          </div>

          <!-- Back chevron -->
          <button class="tour-dir-btn tour-dir-back${state.tourDirection === 'back' ? ' active' : ''}" aria-label="Reverse">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>

          <!-- Now -->
          <div class="tour-card tour-card-now" data-id="${stops[curr].id}">
            <span class="tour-card-label tour-card-label-now">Now</span>
            <div class="tour-card-img-wrap tour-card-img-now">
              <img class="tour-card-img" src="${stops[curr].img || ''}" alt="${stops[curr].a}" onerror="this.style.background='#ddd'">
              <span class="tour-card-num tour-card-num-now">${curr + 1}</span>
            </div>
            <div class="tour-card-artist">${stops[curr].a}</div>
          </div>

          <!-- Fwd chevron -->
          <button class="tour-dir-btn tour-dir-fwd${state.tourDirection === 'fwd' ? ' active' : ''}" aria-label="Forward">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>

          <!-- Next -->
          <div class="tour-card tour-card-next${state.tourDirection === 'fwd' ? ' tour-card-active' : ' tour-card-inactive'}" data-id="${stops[next].id}">
            <span class="tour-card-label">Next</span>
            <div class="tour-card-img-wrap">
              <img class="tour-card-img" src="${stops[next].img || ''}" alt="${stops[next].a}" onerror="this.style.background='#ddd'">
              <span class="tour-card-num">${next + 1}</span>
            </div>
            <div class="tour-card-artist">${stops[next].a}</div>
          </div>
        </div>

        <!-- Thumbnail strip (infinite) -->
        <div class="tour-thumb-strip-wrap">
          <div class="tour-thumb-strip" id="tour-thumb-strip">
            ${[...stops, ...stops, ...stops].map((s, i) => {
              const realIdx = i % len;
              const isCurr = realIdx === curr;
              return `<div class="tour-thumb${isCurr ? ' active' : ''}" data-idx="${realIdx}" data-copy="${Math.floor(i / len)}"${isCurr ? ' style="border-color:var(--teal)"' : ''}>
              <img src="${s.img || ''}" alt="${s.a}" onerror="this.style.background='#ddd'">
            </div>`;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  // Back button
  views.loops.querySelector('.active-tour-back').addEventListener('click', () => {
    closeTour();
    renderTourList();
  });

  // Close button
  views.loops.querySelector('.active-tour-close').addEventListener('click', () => {
    closeTour();
    renderTourList();
  });

  // Direction toggle — just flip direction flag, no array reversal
  views.loops.querySelector('.tour-dir-fwd')?.addEventListener('click', () => {
    state.tourDirection = 'fwd';
    renderTourCards();
  });
  views.loops.querySelector('.tour-dir-back')?.addEventListener('click', () => {
    state.tourDirection = 'back';
    renderTourCards();
  });

  // All 3 cards tap → detail
  views.loops.querySelectorAll('.tour-card').forEach(card => {
    card.addEventListener('click', () => {
      const mural = murals.find(m => m.id === Number(card.dataset.id));
      if (mural) openDetail(mural);
    });
  });


  // Thumbnail strip tap handlers + infinite scroll
  const strip = document.getElementById('tour-thumb-strip');
  if (strip) {
    strip.addEventListener('click', (e) => {
      const thumb = e.target.closest('.tour-thumb');
      if (!thumb) return;
      const idx = parseInt(thumb.dataset.idx, 10);
      if (!isNaN(idx) && idx !== state.tourIndex) {
        state.tourIndex = idx;
        renderTourCards();
      }
    });
    // Scroll to middle copy (copy=1) of active thumb
    const middleActive = strip.querySelector('.tour-thumb.active[data-copy="1"]');
    if (middleActive) setTimeout(() => middleActive.scrollIntoView({ inline: 'center', block: 'nearest' }), 50);
    // Reset to middle copy when scrolling near edges
    strip.addEventListener('scrollend', () => {
      const thumbW = 56; // 48 + 8 gap
      const oneSetW = stops.length * thumbW;
      if (strip.scrollLeft < thumbW * 2) {
        strip.scrollLeft += oneSetW;
      } else if (strip.scrollLeft > oneSetW * 2 - strip.clientWidth) {
        strip.scrollLeft -= oneSetW;
      }
    });
  }

  // Init map
  initTourMap();

  // Compass bearing arc
  initCompassArc();
}

/** Update the bottom panel cards, progress, dots, and fetch new route segment. */
function renderTourCards() {
  const stops = state.tourStops;
  const len = stops.length;
  const idx = state.tourIndex;
  const curr = idx;
  const prev = wrapIndex(idx - 1, len);
  const next = wrapIndex(idx + 1, len);
  const dir = state.tourDirection;

  // Helper to populate a card
  function fillCard(card, stop, num) {
    if (!card) return;
    card.dataset.id = stop.id;
    const img = card.querySelector('.tour-card-img');
    if (img) { img.src = stop.img || ''; img.alt = stop.a; }
    const numEl = card.querySelector('.tour-card-num');
    if (numEl) numEl.textContent = num;
    const artist = card.querySelector('.tour-card-artist');
    if (artist) artist.textContent = stop.a;
  }

  // Now card
  fillCard(views.loops.querySelector('.tour-card-now'), stops[curr], curr + 1);

  // Prev card
  const prevCard = views.loops.querySelector('.tour-card-prev');
  fillCard(prevCard, stops[prev], prev + 1);

  // Next card
  const nextCard = views.loops.querySelector('.tour-card-next');
  fillCard(nextCard, stops[next], next + 1);

  // Apply active/inactive classes based on direction
  if (prevCard) {
    prevCard.classList.toggle('tour-card-active', dir === 'back');
    prevCard.classList.toggle('tour-card-inactive', dir !== 'back');
  }
  if (nextCard) {
    nextCard.classList.toggle('tour-card-active', dir === 'fwd');
    nextCard.classList.toggle('tour-card-inactive', dir !== 'fwd');
  }

  // Chevron active state
  views.loops.querySelector('.tour-dir-back')?.classList.toggle('active', dir === 'back');
  views.loops.querySelector('.tour-dir-fwd')?.classList.toggle('active', dir === 'fwd');

  // Thumbnail strip (infinite) — rebuild from current stops order
  const strip = document.getElementById('tour-thumb-strip');
  if (strip) {
    strip.innerHTML = [...stops, ...stops, ...stops].map((s, i) => {
      const realIdx = i % len;
      const copyIdx = Math.floor(i / len);
      const isCurr = realIdx === curr;
      return `<div class="tour-thumb${isCurr ? ' active' : ''}" data-idx="${realIdx}" data-copy="${copyIdx}"${isCurr ? ' style="border-color:var(--teal)"' : ''}>
        <img src="${s.img || ''}" alt="${s.a}" onerror="this.style.background='#ddd'">
      </div>`;
    }).join('');
    // Scroll to center the active thumb in the middle copy
    const midActive = strip.querySelector('.tour-thumb.active[data-copy="1"]');
    if (midActive) {
      midActive.scrollIntoView({ behavior: 'instant', inline: 'center', block: 'nearest' });
    }
  }

  // Recalculate compass arc for new target
  if (state.compassAvailable) scheduleArcUpdate();

  fetchTourSegment();
}

/** Create the Leaflet mini-map for the tour. */
function initTourMap() {
  if (tourMap) {
    tourMap.remove();
    tourMap = null;
  }

  const container = document.getElementById('tour-map-container');
  if (!container) return;

  tourMap = L.map(container, {
    center: [27.7706, -82.6341],
    zoom: 15,
    zoomControl: false,
    attributionControl: false,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
  }).addTo(tourMap);

  // Prevent swipe from scrolling the map
  L.DomEvent.disableScrollPropagation(container);

  // Show user location on tour map (persistent — updated by GPS watcher)
  tourUserDot = null;
  tourUserPulse = null;
  if (state.userLat && state.userLng) {
    const pos = [state.userLat, state.userLng];
    tourUserPulse = L.marker(pos, { icon: L.divIcon({ className: 'user-loc-pulse', iconSize: [40,40], iconAnchor: [20,20] }), interactive: false }).addTo(tourMap);
    tourUserDot = L.marker(pos, { icon: L.divIcon({ className: 'user-loc-dot', html: '<div class="user-loc-inner"></div>', iconSize: [18,18], iconAnchor: [9,9] }), zIndexOffset: 1000 }).addTo(tourMap).bindPopup('You are here');
  }

  state.tourMapReady = true;
  fetchTourSegment();
}

/** Update user location marker on tour map. */
function updateTourUserLocation() {
  if (!tourMap || !state.userLat || !state.userLng) return;
  const pos = [state.userLat, state.userLng];
  if (tourUserDot) {
    tourUserDot.setLatLng(pos);
    tourUserPulse.setLatLng(pos);
  } else {
    tourUserPulse = L.marker(pos, { icon: L.divIcon({ className: 'user-loc-pulse', iconSize: [40,40], iconAnchor: [20,20] }), interactive: false }).addTo(tourMap);
    tourUserDot = L.marker(pos, { icon: L.divIcon({ className: 'user-loc-dot', html: '<div class="user-loc-inner"></div>', iconSize: [18,18], iconAnchor: [9,9] }), zIndexOffset: 1000 }).addTo(tourMap).bindPopup('You are here');
  }
}

/** Extract a segment of a continuous path between two stops.
 *  Finds nearest path point to each stop, then slices the path between them.
 *  For loop paths, always walks forward (wrapping around if needed). */
function extractPathSegment(path, fromStop, toStop) {
  if (!path || path.length < 2) return [[fromStop.lat, fromStop.lng], [toStop.lat, toStop.lng]];

  function nearestIdx(lat, lng) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < path.length; i++) {
      const d = (path[i][0] - lat) ** 2 + (path[i][1] - lng) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  const fromIdx = nearestIdx(fromStop.lat, fromStop.lng);
  let toIdx = nearestIdx(toStop.lat, toStop.lng);

  if (fromIdx <= toIdx) {
    return path.slice(fromIdx, toIdx + 1);
  }
  // Wrap around for loop paths
  return path.slice(fromIdx).concat(path.slice(0, toIdx + 1));
}

/** Draw walking routes for both directions on tour map. Active = teal, inactive = gray. */
function fetchTourSegment() {
  if (!tourMap || !state.tourMapReady) return;

  const stops = state.tourStops;
  const len = stops.length;
  const idx = state.tourIndex;
  const dir = state.tourDirection;

  const nowStop = stops[idx];
  const fwdStop = stops[wrapIndex(idx + 1, len)];
  const bwdStop = stops[wrapIndex(idx - 1, len)];

  // Clear previous route, arrows, adjacent routes, and markers
  if (state.tourRoute) { state.tourRoute.removeFrom(tourMap); state.tourRoute = null; }
  if (state.tourArrows) { state.tourArrows.forEach(a => a.removeFrom(tourMap)); }
  state.tourArrows = [];
  state.tourAdjacentRoutes.forEach(r => r.removeFrom(tourMap));
  state.tourAdjacentRoutes = [];
  state.tourMarkers.forEach(m => m.removeFrom(tourMap));
  state.tourMarkers = [];

  const routeId = state.activeTour?.id;
  const isBike = routeId && routeId.includes('bike');
  const speed = isBike ? 200 : 80; // meters per minute
  const mode = isBike ? 'bike' : 'walk';

  const rd = routeId && ROUTE_PATHS[routeId];
  const segments = rd?.segments;
  const hasSegments = segments && segments.length === len;

  /** Resolve a forward segment from segIdx → segIdx+1. */
  function resolveFwdSegment(segIdx) {
    const from = stops[segIdx];
    const to = stops[wrapIndex(segIdx + 1, len)];
    if (!from || !to) return null;
    if (hasSegments && segments[segIdx]) return segments[segIdx];
    if (rd?.path || rd?.segments) {
      const fullPath = rd.path || rd.segments.flat();
      const extracted = extractPathSegment(fullPath, from, to);
      if (extracted) return extracted;
    }
    return [[from.lat, from.lng], [to.lat, to.lng]];
  }

  /** Resolve a backward segment from segIdx → segIdx-1 (reversed forward segment). */
  function resolveBwdSegment(segIdx) {
    const from = stops[segIdx];
    const prevIdx = wrapIndex(segIdx - 1, len);
    const to = stops[prevIdx];
    if (!from || !to) return null;
    // The backward segment is the reverse of the forward segment from prevIdx → segIdx
    if (hasSegments && segments[prevIdx]) return [...segments[prevIdx]].reverse();
    if (rd?.path || rd?.segments) {
      const fullPath = rd.path || rd.segments.flat();
      const extracted = extractPathSegment(fullPath, to, from);
      if (extracted) return [...extracted].reverse();
    }
    return [[from.lat, from.lng], [to.lat, to.lng]];
  }

  /** Add direction arrows along a polyline. */
  function addRouteArrows(polyline, color) {
    const latlngs = polyline.getLatLngs();
    if (latlngs.length < 2) return;
    const INTERVAL = 50;
    let accum = 0;
    for (let i = 1; i < latlngs.length; i++) {
      const d = latlngs[i - 1].distanceTo(latlngs[i]);
      accum += d;
      if (accum >= INTERVAL) {
        accum = 0;
        const dy = latlngs[i].lat - latlngs[i - 1].lat;
        const dx = latlngs[i].lng - latlngs[i - 1].lng;
        const angle = Math.atan2(dx, dy) * 180 / Math.PI;
        const arrow = L.marker(latlngs[i], {
          icon: L.divIcon({
            className: 'route-arrow',
            html: `<div style="transform:rotate(${angle}deg);color:${color}">▲</div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6],
          }),
          interactive: false,
        }).addTo(tourMap);
        state.tourArrows.push(arrow);
      }
    }
  }

  // Resolve both segments
  const fwdSeg = resolveFwdSegment(idx);
  const bwdSeg = resolveBwdSegment(idx);

  // Determine active/inactive
  const activeSeg = dir === 'fwd' ? fwdSeg : bwdSeg;
  const inactiveSeg = dir === 'fwd' ? bwdSeg : fwdSeg;
  const activeStop = dir === 'fwd' ? fwdStop : bwdStop;
  const inactiveStop = dir === 'fwd' ? bwdStop : fwdStop;
  const activeNum = dir === 'fwd' ? wrapIndex(idx + 1, len) + 1 : wrapIndex(idx - 1, len) + 1;
  const inactiveNum = dir === 'fwd' ? wrapIndex(idx - 1, len) + 1 : wrapIndex(idx + 1, len) + 1;

  // Draw inactive segment first (renders behind)
  const inactiveHasPrecise = inactiveSeg && inactiveSeg.length > 2;
  const inactiveStyle = inactiveHasPrecise
    ? { color: '#9CA3AF', weight: 3, opacity: 0.4 }
    : { color: '#9CA3AF', weight: 3, opacity: 0.4, dashArray: '6, 8' };
  if (inactiveSeg) {
    const inactiveRoute = L.polyline(inactiveSeg, inactiveStyle).addTo(tourMap);
    state.tourAdjacentRoutes.push(inactiveRoute);
  }

  // Inactive destination pin (smaller, gray)
  if (inactiveStop) {
    const inactiveMarker = L.marker([inactiveStop.lat, inactiveStop.lng], {
      icon: L.divIcon({
        className: 'tour-map-pin',
        html: `<div class="tour-pin adjacent"><img src="${inactiveStop.img || ''}" alt="${inactiveStop.a}"><span class="tour-pin-num">${inactiveNum}</span></div>`,
        iconSize: [32, 32], iconAnchor: [16, 16],
      })
    }).addTo(tourMap);
    inactiveMarker.on('click', () => openDetail(inactiveStop));
    state.tourAdjacentRoutes.push(inactiveMarker);
  }

  // NOW pin (teal, 40px, centered)
  const nowMarker = L.marker([nowStop.lat, nowStop.lng], {
    icon: L.divIcon({
      className: 'tour-map-pin',
      html: `<div class="tour-pin from"><img src="${nowStop.img || ''}" alt="${nowStop.a}"><span class="tour-pin-num">${idx + 1}</span></div>`,
      iconSize: [40, 40], iconAnchor: [20, 20],
    })
  }).addTo(tourMap);
  nowMarker.on('click', () => openDetail(nowStop));

  // Active destination pin (larger, papaya border)
  const activeMarker = L.marker([activeStop.lat, activeStop.lng], {
    icon: L.divIcon({
      className: 'tour-map-pin',
      html: `<div class="tour-pin to"><img src="${activeStop.img || ''}" alt="${activeStop.a}"><span class="tour-pin-num">${activeNum}</span></div>`,
      iconSize: [48, 48], iconAnchor: [24, 24],
    })
  }).addTo(tourMap);
  activeMarker.on('click', () => openDetail(activeStop));
  state.tourMarkers = [nowMarker, activeMarker];

  // Draw active segment (teal with arrows)
  const activeHasPrecise = activeSeg && activeSeg.length > 2;
  const activeStyle = activeHasPrecise
    ? { color: '#0E918C', weight: 5, opacity: 0.85 }
    : { color: '#0E918C', weight: 4, opacity: 0.7, dashArray: '8, 12' };

  let distMeters = 0;
  if (activeSeg) {
    for (let i = 1; i < activeSeg.length; i++) {
      distMeters += haversine(activeSeg[i-1][0], activeSeg[i-1][1], activeSeg[i][0], activeSeg[i][1]);
    }
  }
  const mins = Math.max(1, Math.round(distMeters / speed));

  if (activeSeg) {
    state.tourRoute = L.polyline(activeSeg, activeStyle).addTo(tourMap);
    addRouteArrows(state.tourRoute, '#0E918C');
  }

  // Fit map to include both directions + all pins
  const allPoints = [];
  if (activeSeg) activeSeg.forEach(p => allPoints.push(p));
  if (inactiveSeg) inactiveSeg.forEach(p => allPoints.push(p));
  allPoints.push([nowStop.lat, nowStop.lng]);
  allPoints.push([activeStop.lat, activeStop.lng]);
  if (inactiveStop) allPoints.push([inactiveStop.lat, inactiveStop.lng]);
  if (allPoints.length >= 2) {
    const bounds = L.latLngBounds(allPoints);
    tourMap.fitBounds(bounds, { padding: [60, 60], maxZoom: 19 });
  }

  const segInfo = document.getElementById('tour-segment-text') || document.getElementById('tour-segment-info');
  if (segInfo) segInfo.textContent = `${formatDistance(distMeters)} · ~${mins} min ${mode}`;

  // Also populate the compass package distance/time
  const tourDistEl = document.getElementById('tour-nav-dist');
  const tourTimeEl = document.getElementById('tour-nav-time');
  if (tourDistEl) tourDistEl.textContent = formatDistance(distMeters);
  if (tourTimeEl) tourTimeEl.textContent = `~${mins} min ${mode}`;
}

/** Navigate tour: +1 (next) or -1 (prev). Wraps continuously. */
function navigateTour(dir) {
  const len = state.tourStops.length;
  if (len === 0) return;
  state.tourIndex = wrapIndex(state.tourIndex + dir, len);
  renderTourCards();
}


// =============================================
// Detail page
// =============================================

/**
 * Build reusable detail body HTML for a mural.
 * Used by both openDetail() and the map bottom sheet.
 */
function buildDetailBodyHTML(mural) {
  const muralTours = ROUTE_DEFS.filter(r => r.ids && r.ids.includes(mural.id));
  const photos = fieldPhotos.filter(p => p.muralId === mural.id);

  const nearby = murals
    .filter(m => m.id !== mural.id && m.lat && m.lng && mural.lat && mural.lng)
    .map(m => ({ ...m, dist: haversine(mural.lat, mural.lng, m.lat, m.lng) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 6);

  const artistNames = getArtistAliases(mural.a);
  const moreByArtist = murals.filter(m =>
    m.id !== mural.id && artistNames.some(name =>
      m.a.toLowerCase() === name.toLowerCase()
    )
  );

  return `
    <div class="detail-hero-wrap">
      <img class="detail-hero" src="${mural.img || ''}" alt="${mural.a}" onerror="this.parentElement.style.display='none'">
    </div>
    <div class="detail-body ${TEXT_SIZES[textSizeIdx].class}">
      <div class="detail-artist">${mural.a}</div>
      ${mural.t ? `<div class="detail-title">${mural.t}</div>` : ''}
      <div class="detail-meta-row">
        <div class="detail-meta-left">
          <span class="detail-year-badge">${mural.cat === 'commercial' ? 'Commercial' : mural.cat === 'shine-legacy' ? 'Pre-SHINE' : 'SHINE'} ${mural.y || ''}</span>
          ${mural.from ? `<div class="detail-from">${mural.from}</div>` : ''}
          ${mural.ig ? `<div class="detail-ig"><a href="https://instagram.com/${mural.ig}" target="_blank" rel="noopener">@${mural.ig}</a></div>` : ''}
        </div>
        <div class="detail-action-btns">
          ${mural.aud ? `<div class="detail-action-item">
            <button id="audio-btn" class="audio-btn" onclick="toggleAudioClip('${mural.aud}')">
              <svg class="audio-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
            </button>
            <span class="detail-action-label">Listen</span>
          </div>` : ''}
          <div class="detail-action-item">
            <button id="seen-btn" class="seen-btn ${hasSeen(mural.id) ? 'seen' : ''}" onclick="toggleSeenFromDetail(${mural.id})">
              <svg class="seen-check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
            <span class="detail-action-label">Seen</span>
          </div>
          <div class="detail-action-item">
            <button id="like-btn" class="like-btn ${hasLiked(mural.id) ? 'liked' : ''}" onclick="toggleLike(${mural.id})">
              <svg class="like-heart" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </button>
            <span class="detail-action-label">FAV</span>
          </div>
          <div class="detail-action-item">
            <button id="text-size-btn" class="text-size-btn" onclick="cycleTextSize()">
              <span class="text-size-letter">A+</span>
            </button>
            <span class="detail-action-label">Font</span>
          </div>
        </div>
      </div>

      <div class="detail-nav-bar">
        ${mural.lat && mural.lng ? `
          <div class="detail-compass-wrap detail-hud-wrap">
            <div class="compass-arc detail-compass-arc detail-hud-arc" id="detail-compass-arc" hidden>
              <span class="hud-offscreen hud-offscreen-left" hidden>&larr;</span>
              <div class="hud-indicator-bar">${(() => {
                let segs = '';
                const TICKS = 81;
                const MID = Math.floor(TICKS / 2);
                for (let i = 0; i < TICKS; i++) {
                  const norm = (i - MID) / MID;
                  const arcY = Math.round((1 - norm * norm) * 28);
                  if (i === MID) {
                    segs += '<div class="hud-chevron" style="margin-bottom:' + arcY + 'px"><svg width="36" height="16" viewBox="0 0 36 16"><path d="M2,15 L18,2 L34,15" fill="none" stroke="#22C55E" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>';
                  } else {
                    const d = Math.abs(i - MID);
                    const cls = d <= 3 ? 'hud-tick warm' : d <= 9 ? 'hud-tick hot' : d <= 19 ? 'hud-tick faint' : d <= 29 ? 'hud-tick faint2' : (i % 5 === 0 ? 'hud-tick major' : 'hud-tick');
                    segs += '<span class="' + cls + '" style="margin-bottom:' + arcY + 'px"></span>';
                  }
                }
                return segs;
              })()}</div>
              <span class="hud-offscreen hud-offscreen-right" hidden>&rarr;</span>
            </div>
            <div class="detail-nav-live hud-info detail-hud-info">
              <span class="detail-nav-dist hud-dist"></span>
              <span class="detail-nav-sep hud-sep">&middot;</span>
              <span class="detail-nav-time hud-time"></span>
            </div>
            <div class="detail-nav-address">${mural.bldg ? mural.bldg + ' — ' : ''}${mural.loc || 'St. Petersburg, FL'}</div>
            <button class="compass-enable-btn" hidden>Enable Compass</button>
            <div class="compass-cal-hint" hidden>Compass calibrating — accuracy improves as you walk</div>
          </div>
        ` : `
          <div class="detail-nav-live">
            <span class="detail-nav-dist"></span>
            <span class="detail-nav-sep">&middot;</span>
            <span class="detail-nav-time"></span>
          </div>
          <div class="detail-nav-address">${mural.bldg ? mural.bldg + ' — ' : ''}${mural.loc || 'St. Petersburg, FL'}</div>
        `}
      </div>

      ${muralTours.length > 0 ? `
        <div class="detail-tour-dropdown">
          <div class="detail-bio-label">On These Tour Routes</div>
          <select class="detail-tour-select" data-mural-id="${mural.id}">
            <option value="">Choose a Tour Route\u2026</option>
            ${muralTours.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
          </select>
        </div>
      ` : ''}

      ${mural.imp && mural.imp.length > 0 ? `
        <div class="detail-impressions">
          <div class="detail-bio-label">What People Say</div>
          ${mural.imp.slice(0, 3).map(q => `
            <div class="detail-impression">"${q}"</div>
          `).join('')}
        </div>
      ` : ''}

      ${mural.desc ? `
        <div class="detail-bio detail-bio-hidden" aria-hidden="true">
          <div class="detail-bio-label">About the Mural</div>
          ${mural.desc}
        </div>
      ` : ''}

      ${mural.insp ? `
        <div class="detail-bio">
          <div class="detail-bio-label">Inspiration</div>
          ${mural.insp}
        </div>
      ` : ''}

      ${mural.bio ? `
        <div class="detail-bio">
          <div class="detail-bio-label">About the Artist</div>
          ${mural.bio}
        </div>
      ` : ''}

      ${mural.aaw ? `
        <div class="detail-bio">
          <div class="detail-bio-label">Artist Awards</div>
          ${mural.aaw}
        </div>
      ` : ''}

      ${mural.maw ? `
        <div class="detail-bio">
          <div class="detail-bio-label">Mural Awards</div>
          ${mural.maw}
        </div>
      ` : ''}


      ${photos.length > 0 ? `
        <div class="detail-section">
          <div class="detail-section-title">Field Photos</div>
          <div class="detail-photo-scroll">
            ${photos.map(p => `
              <div class="detail-photo-card">
                <img src="images/field/${p.src}" alt="${p.note}" loading="lazy">
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${nearby.length > 0 ? `
        <div class="detail-section">
          <div class="detail-section-title">Nearby Murals</div>
          <div class="detail-nearby-row">
            ${nearby.map(m => `
              <div class="detail-nearby-card" data-id="${m.id}">
                <img src="${m.img || ''}" alt="${m.a}" loading="lazy">
                <div class="detail-nearby-card-artist">${m.a}</div>
                <div class="detail-nearby-card-dist">${formatDistance(m.dist)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${moreByArtist.length > 0 ? `
        <div class="detail-section">
          <div class="detail-section-title">More by ${mural.a}</div>
          <div class="detail-nearby-row">
            ${moreByArtist.map(m => `
              <div class="detail-nearby-card" data-id="${m.id}">
                <img src="${m.img || ''}" alt="${m.a}" loading="lazy">
                <div class="detail-nearby-card-artist">${m.loc}</div>
                <div class="detail-nearby-card-dist">${m.y}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Open the full-screen detail overlay for a mural.
 * Renders: hero image, metadata, bio, walking directions,
 * field photos, 6 nearest murals, and "more by this artist".
 * @param {Object} mural - Mural object from data.js
 */
function openDetail(mural) {
  state.selectedMural = mural;
  detailPage.hidden = false;

  detailContent.innerHTML = buildDetailBodyHTML(mural);

  detailContent.querySelectorAll('.detail-nearby-card').forEach(card => {
    card.addEventListener('click', () => {
      const m = murals.find(m => m.id === Number(card.dataset.id));
      if (m) openDetail(m);
    });
  });

  // Pinch-to-zoom + tap-to-zoom + drag-to-pan on hero image
  const heroWrap = detailContent.querySelector('.detail-hero-wrap');
  if (heroWrap) {
    const heroImg = heroWrap.querySelector('.detail-hero');
    let scale = 1, panX = 0, panY = 0;
    let startDist = 0, startScale = 1;
    let startX = 0, startY = 0, startPanX = 0, startPanY = 0;
    let dragging = false, pinching = false;

    const applyTransform = () => {
      heroImg.style.transition = pinching || dragging ? 'none' : 'transform 0.15s ease';
      heroImg.style.transform = scale <= 1
        ? ''
        : `scale(${scale}) translate(${panX / scale}px, ${panY / scale}px)`;
    };

    const resetZoom = () => {
      scale = 1; panX = 0; panY = 0;
      heroImg.style.transition = 'transform 0.2s ease';
      heroImg.style.transform = '';
    };

    const pinchDist = (t) => Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY);

    // Double-tap to zoom, single-tap to go back
    let lastTap = 0;
    heroWrap.addEventListener('click', (e) => {
      if (dragging || pinching) return;
      const now = Date.now();
      if (now - lastTap < 300) {
        // Double-tap
        if (scale > 1) {
          resetZoom();
        } else {
          const rect = heroWrap.getBoundingClientRect();
          heroImg.style.transformOrigin = `${((e.clientX - rect.left) / rect.width) * 100}% ${((e.clientY - rect.top) / rect.height) * 100}%`;
          scale = 2.5; panX = 0; panY = 0;
          applyTransform();
        }
        lastTap = 0;
      } else {
        lastTap = now;
        // Single tap → close detail (unless zoomed/dragging/pinching)
        setTimeout(() => {
          if (lastTap === now && scale <= 1 && !dragging && !pinching) {
            stopDetailCompass();
            detailPage.hidden = true;
            state.selectedMural = null;
          }
        }, 300);
      }
    });

    heroWrap.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        // Pinch start
        pinching = true;
        dragging = false;
        startDist = pinchDist(e.touches);
        startScale = scale;
        heroImg.style.transformOrigin = 'center center';
      } else if (e.touches.length === 1 && scale > 1) {
        // Pan start
        dragging = false;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        startPanX = panX;
        startPanY = panY;
      }
    }, { passive: true });

    heroWrap.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && pinching) {
        e.preventDefault();
        const dist = pinchDist(e.touches);
        scale = Math.max(1, Math.min(5, startScale * (dist / startDist)));
        if (scale <= 1) { panX = 0; panY = 0; }
        applyTransform();
      } else if (e.touches.length === 1 && scale > 1) {
        e.preventDefault();
        dragging = true;
        panX = startPanX + (e.touches[0].clientX - startX);
        panY = startPanY + (e.touches[0].clientY - startY);
        applyTransform();
      }
    }, { passive: false });

    heroWrap.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) pinching = false;
      if (scale <= 1.05) resetZoom();
      setTimeout(() => { dragging = false; }, 50);
    });
  }

  const tourSelect = detailContent.querySelector('.detail-tour-select');
  if (tourSelect) {
    tourSelect.addEventListener('change', (e) => {
      const def = ROUTE_DEFS.find(r => r.id === e.target.value);
      if (!def) return;
      const muralId = Number(tourSelect.dataset.muralId);
      stopDetailCompass();
      detailPage.hidden = true;
      state.selectedMural = null;
      switchTab('loops');
      openTour(def, muralId);
    });
  }

  detailPage.scrollTop = 0;

  // Start detail compass
  initDetailCompass(mural);
}

// Back button
$('#detail-back').addEventListener('click', () => {
  stopDetailCompass();
  detailPage.hidden = true;
  state.selectedMural = null;
});

// =============================================
// Artist alias lookup
// =============================================
/** Look up all known name variants for an artist (e.g. "Dream Weaver" ↔ "Dreamweaver"). */
function getArtistAliases(name) {
  for (const [key, aliases] of Object.entries(ARTIST_ALIASES)) {
    if (aliases.some(a => a.toLowerCase() === name.toLowerCase())) {
      return aliases;
    }
  }
  return [name];
}

// =============================================
// In-app directions
// =============================================

/**
 * Start directions from user location to a mural.
 * Closes the detail overlay, switches to map tab, and draws route.
 * @param {number} muralId - ID of the target mural
 */
function openExternalMaps(mural) {
  sessionStorage.setItem('mq_return_mural', mural.id);
  // Apple Maps on iOS — opens native app directly with turn-by-turn
  if (isIOS) {
    window.open(`https://maps.apple.com/?daddr=${mural.lat},${mural.lng}&dirflg=w`, '_blank');
  } else {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${mural.lat},${mural.lng}&travelmode=walking`, '_blank');
  }
}

function startDirections(muralId) {
  const mural = murals.find(m => m.id === muralId);
  if (!mural) return;
  sessionStorage.setItem('mq_return_mural', muralId);
  openExternalMaps(mural);
}

/** Show a centered "get to St Pete" card on the detail page when user is out of range. */
function showOutOfRangeOnDetail() {
  let toast = document.querySelector('.detail-range-toast');
  if (toast) toast.remove();
  toast = document.createElement('div');
  toast.className = 'detail-range-toast';
  toast.innerHTML = `<p>You're not in St. Pete yet!</p><small>Catch a flight, hop a bus, board a plane, drive a car — get to St. Pete to start exploring murals.</small>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function openInMapsApp(muralId) {
  const mural = murals.find(m => m.id === muralId);
  if (mural) openExternalMaps(mural);
}
// Expose to onclick handler
window.startDirections = startDirections;
window.openInMapsApp = openInMapsApp;
window.toggleLike = toggleLike;
window.toggleSeenFromDetail = toggleSeenFromDetail;

// =============================================
// URL deep linking (?mural=ID)
// =============================================
/** Check URL for ?mural=ID on page load and open that mural's detail page. */
function handleDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const muralId = params.get('mural');
  if (muralId) {
    const mural = murals.find(m => m.id === Number(muralId));
    if (mural) openDetail(mural);
  }
}

// =============================================
// Init
// =============================================
// Map is the default tab — explore renders lazily on first visit
initMap();
flashFabLabels();
handleDeepLink();

// Restore mural detail after returning from Google Maps
const returnMural = sessionStorage.getItem('mq_return_mural');
if (returnMural) {
  sessionStorage.removeItem('mq_return_mural');
  const mid = parseInt(returnMural, 10);
  const m = murals.find(mu => mu.id === mid);
  if (m) showDetail(m);
}
