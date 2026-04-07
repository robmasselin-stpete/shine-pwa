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
// =============================================
// App access — gate removed (App Store distribution only)
// =============================================
function setCookieAccess() {}
function getCookieAccess() { return null; }
function setEmailCookie() {}
function getEmailCookie() { return null; }
function hasAccess() { return true; }
function grantAccess() {}

// Platform detection
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

// No paywall — always show the app
document.getElementById('gate-page').hidden = true;
document.getElementById('app').hidden = false;

// =============================================
// Splash Screen — shows first 4 app opens
// =============================================
(function showSplash() {
  const SPLASH_KEY = 'mq_splash_count';
  const count = Number(localStorage.getItem(SPLASH_KEY) || 0);
  if (count >= 4) return;
  localStorage.setItem(SPLASH_KEY, count + 1);

  const splash = document.createElement('div');
  splash.className = 'splash-overlay';
  splash.innerHTML = `
    <div class="splash-content">
      <div class="splash-title">Find the Art Around You!</div>
      <div class="splash-lines">
        <div class="splash-line">Zoom in to Find Murals</div>
        <div class="splash-line">Browse Murals for Artists and Info</div>
        <div class="splash-line">Choose Curated Tour Routes</div>
        <div class="splash-line">Feel the Direction with the Compass</div>
      </div>
      <div class="splash-gotta">
        <div class="splash-line">Gotta Try the Cheat Sheet on Each Page</div>
        <svg class="splash-arrow" width="80" height="120" viewBox="0 0 80 120" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 4 C30 30, 50 70, 60 105"/>
          <polygon points="60,120 52,104 68,106" fill="currentColor" stroke="none"/>
        </svg>
      </div>
    </div>
  `;
  document.body.appendChild(splash);

  splash.addEventListener('click', () => {
    splash.classList.add('splash-closing');
    splash.addEventListener('animationend', () => splash.remove(), { once: true });
  });
})();

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

// Further Work toggle
function toggleFurtherWork(btn) {
  const list = btn.parentElement.querySelector('.detail-fw-list');
  if (!list) return;
  list.hidden = !list.hidden;
  btn.classList.toggle('open', !list.hidden);
}
window.toggleFurtherWork = toggleFurtherWork;

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
  tourWalking: false,
  // Discover Mode state
  walkMode: false,
  walkWatchId: null,
  walkAlerted: new Set(),
  // Compass Arc state
  compassAvailable: false,
  compassHeading: null,
  compassWatchId: null,
  compassPermission: false,
  // GoTo navigation state
  gotoMode: false,
  gotoMural: null,
  gotoWatchId: null,
  gotoMap: null,
  gotoUserDot: null,
  gotoUserPulse: null,
  gotoRouteLine: null,
  gotoLastRoutePos: null,
  gotoMapRotation: 0,
  // Help overlay state
  helpVisible: false,
  helpTimer: null,
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
  if (!btn.dataset.tab) return; // skip help button
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.getElementById('tab-help').addEventListener('click', () => {
  toggleHelp();
});

/** Switch active tab — hides other views, shows search/filters for Explore only, triggers render. */
function switchTab(tab) {
  if (state.helpVisible) closeHelp();
  state.tab = tab;
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  Object.entries(views).forEach(([key, el]) => { el.hidden = key !== tab; });

  searchBar.hidden = tab !== 'explore';
  exploreFilters.hidden = tab !== 'explore';
  if (state.gotoMode) cleanupGotoMode();
  stopDetailCompass();
  detailPage.hidden = true;

  // Route bar disabled for now
  // const routeBar = document.querySelector('.map-route-bar');
  // if (routeBar) routeBar.classList.toggle('visible', tab === 'map');

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

let bearingDetentArmed = true;
let bearingDetentCooldown = 0; // timestamp of last haptic fire

/**
 * Haptic via CHHapticEngine vibrate — UIImpactFeedbackGenerator doesn't fire
 * from WKWebView, but the vibrate method (CHHapticEngine) does.
 * Duration in ms controls perceived intensity.
 */
function hapticVibrate(durationMs) {
  try {
    window.Capacitor?.nativePromise?.('Haptics', 'vibrate', { duration: durationMs });
  } catch (e) { /* silent */ }
}

/** Lightsaber ignition: quick ramp-up [50, 10, 100, 10, 200] */
function hapticIgnition() {
  hapticVibrate(50);
  setTimeout(() => hapticVibrate(100), 60);
  setTimeout(() => hapticVibrate(200), 170);
}

/** Heartbeat: two quick beats [100, 50, 100] */
function hapticHeartbeat() {
  hapticVibrate(100);
  setTimeout(() => hapticVibrate(100), 150);
}

/** Collision: strong impact [100, 50, 100] */
function hapticCollision() {
  hapticVibrate(100);
  setTimeout(() => hapticVibrate(100), 150);
  setTimeout(() => hapticVibrate(200), 350);
}

/**
 * Bearing detent: heartbeat when compass locks onto target (±3°).
 * Re-arms after deviating past 15°, with 250ms cooldown.
 */
function playBearingHaptic(absRel) {
  if (absRel > 10) { bearingDetentArmed = true; return; }
  if (absRel <= 3 && bearingDetentArmed && Date.now() - bearingDetentCooldown > 250) {
    bearingDetentArmed = false;
    bearingDetentCooldown = Date.now();
    hapticHeartbeat();
  }
}

function playArrivalHaptic() {
  hapticCollision();
}

/** Play haptic feedback on native platforms. */
function playProximityHaptic() {
  hapticIgnition();
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
    <button class="year-pill ${isActive('shine') ? 'active' : ''}" data-filter="shine">SHINE<sup>&reg;</sup></button>
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
  if (sub) sub.textContent = '125+ murals across St. Petersburg';
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
    const mins = dist ? Math.round(parseFloat(dist) / (isBike ? 10 : 3) * 60) : 0;
    const timeEst = mins ? `~${mins} min ${isBike ? 'bike' : 'walk'}` : '';
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
    <p class="map-float-subtitle">125+ murals across St. Petersburg</p>
    <div class="filter-pills" id="map-cat-pills"></div>
    <div class="filter-pills" id="map-year-pills" hidden></div>
  `;
  mapContainer.appendChild(floatHeader);

  // Route bar — disabled for now (tour overlays removed from map tab)
  // let routeBar = document.querySelector('.map-route-bar');
  // if (!routeBar) {
  //   routeBar = document.createElement('div');
  //   routeBar.className = 'map-route-bar visible';
  //   routeBar.innerHTML = `<div class="route-bar-title">Tour Overlays</div><div class="route-bar-track" id="route-bar-track">${routeKeyHtml}</div>`;
  //   document.getElementById('app').appendChild(routeBar);
  // }

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

  // Route polylines disabled for now (tour overlays removed from map tab)
  // drawRoutePolylines();

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
      <button class="map-fab" id="fab-location" title="My location">
        <svg viewBox="0 0 24 24"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>
      </button>
    </div>
    <div class="map-fab-row">
      <button class="map-fab" id="fab-nearest" title="Nearest mural">
        <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
      </button>
    </div>
    <div class="map-fab-row">
      <button class="map-fab" id="fab-nearest-tour" title="Nearest tour stop">
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
      </button>
    </div>
    <div class="map-fab-row">
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
}

function flashFabLabels() {
  // Labels removed — info overlay now covers FAB identification
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
    <button class="year-pill ${t === 'shine' ? 'active' : ''}" data-cat="shine">SHINE<sup>&reg;</sup></button>
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
  { id: 'methodist-town', name: 'Methodist Town', desc: 'Cecilia Lueza to Jeff Williams — 7 stops along MLK Jr corridor',
    ids: [4, 108, 61, 60, 24, 114, 64] },
  { id: 'tropicana-field', name: 'Tropicana Field', desc: 'Dream Weaver to Jimmy Breen — 10 stops around the stadium district',
    ids: [59, 103, 20, 52, 44, 123, 16, 125, 18, 131] },
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
      <img class="tour-stop-img" src="${mural.img || ''}" alt="${mural.a}" onerror="this.style.background='#ddd'">
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
let pickerMiniUserDots = {};   // idx → { dot, pulse } markers on mini-maps
let pickerGpsWatchId = null;   // GPS watcher for tour picker user dots

/** Destroy all rotary mini-maps. */
function destroyPickerMiniMaps() {
  Object.values(pickerMiniUserDots).forEach(e => { if (e.arrow) e.arrow.remove(); });
  Object.values(pickerMiniMaps).forEach(m => { try { m.remove(); } catch(e) {} });
  pickerMiniMaps = {};
  pickerMiniUserDots = {};
  if (pickerGpsWatchId != null) {
    navigator.geolocation.clearWatch(pickerGpsWatchId);
    pickerGpsWatchId = null;
  }
}

/** Add or update user location dot on a mini-map (or edge arrow if off-screen). */
function updatePickerMiniUserDot(i) {
  const m = pickerMiniMaps[i];
  if (!m || !state.userLat || !state.userLng) return;
  const pos = [state.userLat, state.userLng];
  const bounds = m.getBounds();
  const onScreen = bounds.contains(pos);

  // Lazily create marker objects
  if (!pickerMiniUserDots[i]) {
    const pulse = L.marker(pos, {
      icon: L.divIcon({ className: 'user-loc-pulse', iconSize: [24, 24], iconAnchor: [12, 12] }),
      interactive: false,
    });
    const dot = L.marker(pos, {
      icon: L.divIcon({ className: 'user-loc-dot', html: '<div class="user-loc-inner" style="width:10px;height:10px;border-width:2px"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }),
      interactive: false, zIndexOffset: 1000,
    });
    pickerMiniUserDots[i] = { dot, pulse, arrow: null, onScreen: null };
  }

  const entry = pickerMiniUserDots[i];

  if (onScreen) {
    // Show dot, hide arrow
    if (!m.hasLayer(entry.dot)) { entry.dot.addTo(m); entry.pulse.addTo(m); }
    entry.dot.setLatLng(pos);
    entry.pulse.setLatLng(pos);
    if (entry.arrow) { entry.arrow.remove(); entry.arrow = null; }
  } else {
    // Hide dot, show edge arrow pointing toward user
    if (m.hasLayer(entry.dot)) { m.removeLayer(entry.dot); m.removeLayer(entry.pulse); }

    // Calculate edge position and angle
    const container = m.getContainer();
    const w = container.clientWidth, h = container.clientHeight;
    const cx = w / 2, cy = h / 2;
    const userPx = m.latLngToContainerPoint(pos);
    const dx = userPx.x - cx, dy = userPx.y - cy;
    const angle = Math.atan2(dy, dx);

    // Clamp to container edge with padding
    const pad = 18;
    let ex, ey;
    const slope = Math.abs(dy / dx);
    const edgeSlope = (h / 2 - pad) / (w / 2 - pad);
    if (slope > edgeSlope) {
      // Hits top or bottom
      ey = dy > 0 ? h - pad : pad;
      ex = cx + (ey - cy) / Math.tan(angle);
    } else {
      // Hits left or right
      ex = dx > 0 ? w - pad : pad;
      ey = cy + (ex - cx) * Math.tan(angle);
    }
    ex = Math.max(pad, Math.min(w - pad, ex));
    ey = Math.max(pad, Math.min(h - pad, ey));

    const deg = angle * 180 / Math.PI;

    // Remove old arrow, create new one
    if (entry.arrow) entry.arrow.remove();
    const arrowEl = document.createElement('div');
    arrowEl.className = 'picker-user-arrow';
    arrowEl.style.left = ex + 'px';
    arrowEl.style.top = ey + 'px';

    // Label goes on the interior side of the arrow, tip points outward
    const labelSide = dx > 0 ? 'right' : 'left';
    arrowEl.innerHTML = `<span class="picker-user-arrow-tip" style="transform:rotate(${deg}deg)"></span><span class="picker-user-arrow-label" style="${labelSide}:0">You Are Over Here</span>`;
    // Append to the card-map wrapper (not Leaflet container, which clips overflow)
    container.parentElement.appendChild(arrowEl);
    entry.arrow = arrowEl;
  }
}

/** Update user dots on all visible mini-maps. */
function updateAllPickerMiniDots() {
  Object.keys(pickerMiniMaps).forEach(i => updatePickerMiniUserDot(Number(i)));
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
  // Force tile redraw after layout settles
  setTimeout(() => m.invalidateSize(), 200);

  // Add user location dot if we have a position
  if (state.userLat && state.userLng) updatePickerMiniUserDot(i);
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
    const mins = rd && rd.distance ? Math.round(rd.distance / (isBike ? 10 : 3) * 60) : 0;
    const timeEst = mins ? `~${mins} min ${isBike ? 'bike' : 'walk'}` : '';
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

  views.loops.innerHTML = `
    <div class="tour-picker-layout">
      <div class="tours-large-title">
        <h1>Tours</h1>
        <p>Scroll to Browse, Tap Go</p>
      </div>
      <div class="tour-list-scroll" id="tour-list-scroll">
        ${cardsHtml}
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
  }, { rootMargin: '200px' });

  views.loops.querySelectorAll('.tour-list-card').forEach(card => observer.observe(card));

  // Start GPS watcher so user dot stays live on mini-maps
  if (pickerGpsWatchId == null) {
    pickerGpsWatchId = navigator.geolocation.watchPosition(
      pos => {
        state.userLat = pos.coords.latitude;
        state.userLng = pos.coords.longitude;
        updateAllPickerMiniDots();
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  }
  // Show dots immediately if we already have a position
  if (state.userLat && state.userLng) updateAllPickerMiniDots();
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
  state.tourWalking = false;
  bearingDetentArmed = true;

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

/** Build SVG compass ring — 360° of radial ticks around a circle. */
function buildCompassRingSVG() {
  const R = 240, CX = 195, CY = 245, TICKS = 180;
  let s = '<svg class="compass-ring-svg" viewBox="0 0 390 86"><defs>' +
    '<filter id="chev-glow"><feGaussianBlur stdDeviation="3" result="b"/>' +
    '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
    '<g class="compass-ring-g">';
  for (let i = 0; i < TICKS; i++) {
    const deg = i * 2, rad = deg * Math.PI / 180;
    const d = Math.min(i, TICKS - i);
    let len, c, w;
    if (d <= 5)       { len = 18; c = 'rgba(250,204,21,0.75)'; w = 3.5; }
    else if (d <= 12) { len = 15; c = 'rgba(220,50,50,0.6)'; w = 3; }
    else if (d <= 25) { len = 13; c = 'rgba(220,50,50,0.45)'; w = 2.5; }
    else if (d <= 35) { len = 12; c = 'rgba(220,50,50,0.3)'; w = 2; }
    else if (i % 5 === 0) { len = 18; c = 'rgba(220,50,50,0.25)'; w = 3; }
    else              { len = 11; c = 'rgba(220,50,50,0.18)'; w = 2; }
    const x1 = CX + R * Math.sin(rad), y1 = CY - R * Math.cos(rad);
    const x2 = CX + (R - len) * Math.sin(rad), y2 = CY - (R - len) * Math.cos(rad);
    s += '<line x1="'+x1.toFixed(1)+'" y1="'+y1.toFixed(1)+'" x2="'+x2.toFixed(1)+'" y2="'+y2.toFixed(1)+'" stroke="'+c+'" stroke-width="'+w+'" stroke-linecap="round"/>';
  }
  // Green chevron at 0° pointing outward
  const ct = CY - R - 2, cb = CY - R + 22;
  s += '<polygon points="'+CX+','+ct+' '+(CX-14)+','+cb+' '+(CX+14)+','+cb+'" fill="#22C55E" opacity="0.65" filter="url(#chev-glow)"/>';
  s += '</g></svg>';
  return s;
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

  // Auto-advance when walking and within ~50ft (15m) of next mural
  const ARRIVAL_THRESHOLD = 15; // meters
  if (state.tourWalking && dist < ARRIVAL_THRESHOLD) {
    playArrivalHaptic();
    state.tourIndex = targetIdx;
    state.tourWalking = false;
    renderTourBottom();
    return; // new segment will be fetched by renderTourBottom
  }

  // Relative angle: positive = target to right, negative = left
  let rel = targetBearing - state.compassHeading;
  if (rel > 180) rel -= 360;
  if (rel < -180) rel += 360;

  // Haptic blip when crossing target bearing
  playBearingHaptic(Math.abs(rel));

  // Rotate compass ring so target chevron aligns with bearing
  const ring = arcEl.querySelector('.compass-ring-g');
  if (ring) ring.setAttribute('transform', `rotate(${rel} 195 245)`);

  // Distance/time is set by fetchTourSegment() — don't overwrite here
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

  // Haptic blip when crossing target bearing
  playBearingHaptic(Math.abs(rel));

  // Rotate compass ring so target chevron aligns with bearing
  const ring = arcEl.querySelector('.compass-ring-g');
  if (ring) ring.setAttribute('transform', `rotate(${rel} 195 245)`);

  // In GoTo mode, rotate the map so walking direction faces up
  if (state.gotoMode && state.gotoMap) {
    const spinEl = document.querySelector('.goto-map-spin');
    if (spinEl) {
      // Take shortest path to avoid 360° flip at 0°/360° boundary
      let target = -detailCompassHeading;
      let diff = target - state.gotoMapRotation;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      state.gotoMapRotation += diff;
      spinEl.style.transform = `rotate(${state.gotoMapRotation}deg)`;
    }
    // Keep map centered on user with distance-based zoom
    if (state.userLat && state.userLng && state.gotoMural) {
      const d = haversine(state.userLat, state.userLng, state.gotoMural.lat, state.gotoMural.lng);
      state.gotoMap.setView([state.userLat, state.userLng], gotoZoomForDistance(d), { animate: false });
    }
  }

  updateDetailNavInfo(mural);
}

// Walking route distance cache for detail compass
let detailRouteCache = { lat: null, lng: null, muralId: null, dist: null, dur: null, pending: false };

function fetchDetailWalkingRoute(mural) {
  if (!state.userLat || !state.userLng || !mural.lat || !mural.lng) return;
  if (detailRouteCache.pending) return;

  // Skip re-fetch if user hasn't moved >50m from last fetch for same mural
  if (detailRouteCache.muralId === mural.id && detailRouteCache.lat != null) {
    const drift = haversine(state.userLat, state.userLng, detailRouteCache.lat, detailRouteCache.lng);
    if (drift < 50) return;
  }

  detailRouteCache.pending = true;
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${state.userLng},${state.userLat};${mural.lng},${mural.lat}?overview=false`;
  fetch(url, { signal: AbortSignal.timeout(8000) })
    .then(r => r.json())
    .then(data => {
      if (data.routes && data.routes.length > 0) {
        detailRouteCache = {
          lat: state.userLat, lng: state.userLng, muralId: mural.id,
          dist: data.routes[0].distance,
          dur: data.routes[0].duration,
          pending: false
        };
        updateDetailNavInfo(mural);
      } else {
        detailRouteCache.pending = false;
      }
    })
    .catch(() => { detailRouteCache.pending = false; });
}

function updateDetailNavInfo(mural) {
  if (!state.userLat || !state.userLng || !mural.lat || !mural.lng) return;

  // Kick off walking route fetch (throttled internally)
  fetchDetailWalkingRoute(mural);

  const distEl = detailContent?.querySelector('.detail-nav-dist');
  const timeEl = detailContent?.querySelector('.detail-nav-time');

  // Use cached walking distance if available for this mural, else fall back to haversine
  if (detailRouteCache.muralId === mural.id && detailRouteCache.dist != null) {
    if (distEl) distEl.textContent = formatDistance(detailRouteCache.dist);
    if (timeEl) {
      const mins = Math.max(1, Math.round(detailRouteCache.dur / 60));
      timeEl.textContent = mins < 60 ? `${mins} min walk` : `${(mins / 60).toFixed(1)} hr walk`;
    }
  } else {
    const dist = haversine(state.userLat, state.userLng, mural.lat, mural.lng);
    if (distEl) distEl.textContent = formatDistance(dist);
    if (timeEl) {
      const mins = Math.max(1, Math.round(dist / 80));
      timeEl.textContent = mins < 60 ? `${mins} min walk` : `${(mins / 60).toFixed(1)} hr walk`;
    }
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
  bearingDetentArmed = true;
}

// =============================================
// GoTo Navigation Mode (in-app walking nav)
// =============================================

/** Pick a Leaflet zoom level based on distance in meters.
 *  Tuned for the 142%-oversized spin container (visible = ~70% of rendered). */
function gotoZoomForDistance(dist) {
  if (dist < 50)   return 18;
  if (dist < 150)  return 17;
  if (dist < 400)  return 16;
  if (dist < 800)  return 15.5;
  if (dist < 1500) return 15;
  if (dist < 3000) return 14;
  return 13;
}

/**
 * Enter GoTo mode on the detail page.
 * Replaces the detail body content below the meta row with a Leaflet map,
 * compass ring overlay, and live GPS tracking toward the mural.
 */
function enterGotoMode(mural) {
  if (!mural || !mural.lat || !mural.lng) return;
  state.gotoMode = true;
  state.gotoMural = mural;

  // Swap the GoTo button to "Navigating" state
  const pill = detailContent.querySelector('.detail-goto-pill');
  if (pill) pill.classList.add('navigating');

  // Remove everything after the detail-nav-bar
  const navBar = detailContent.querySelector('.detail-nav-bar');
  const body = detailContent.querySelector('.detail-body');
  if (!navBar || !body) return;

  let sibling = navBar.nextElementSibling;
  while (sibling) {
    const next = sibling.nextElementSibling;
    sibling.remove();
    sibling = next;
  }

  // Insert goto map zone after the nav bar
  const mapZone = document.createElement('div');
  mapZone.className = 'goto-map-zone';
  mapZone.innerHTML = `<div class="goto-map-spin"><div id="goto-map-container" style="width:100%;height:100%"></div></div>`;
  body.appendChild(mapZone);

  // Insert arrived section (hidden until within 50m)
  const arrived = document.createElement('div');
  arrived.className = 'goto-arrived';
  arrived.hidden = true;
  body.appendChild(arrived);

  // Init Leaflet map
  const container = document.getElementById('goto-map-container');
  const gotoMap = L.map(container, {
    center: [mural.lat, mural.lng],
    zoom: 15,
    zoomControl: false,
    attributionControl: false,
  });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
  }).addTo(gotoMap);
  L.DomEvent.disableScrollPropagation(container);
  state.gotoMap = gotoMap;

  // Mural destination pin
  const muralIcon = L.divIcon({
    className: 'goto-mural-pin',
    html: '<div style="width:14px;height:14px;border-radius:50%;background:#0E918C;border:3px solid #fff;box-shadow:0 0 6px rgba(0,0,0,0.35)"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
  L.marker([mural.lat, mural.lng], { icon: muralIcon }).addTo(gotoMap);

  // Force map to recalculate size after DOM insertion
  setTimeout(() => {
    gotoMap.invalidateSize();

    // User location dot + route (if we have position)
    if (state.userLat && state.userLng) {
      const pos = [state.userLat, state.userLng];
      state.gotoUserPulse = L.marker(pos, { icon: L.divIcon({ className: 'user-loc-pulse', iconSize: [40, 40], iconAnchor: [20, 20] }), interactive: false }).addTo(gotoMap);
      state.gotoUserDot = L.marker(pos, { icon: L.divIcon({ className: 'user-loc-dot', html: '<div class="user-loc-inner"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 1000 }).addTo(gotoMap);
      const dist = haversine(state.userLat, state.userLng, mural.lat, mural.lng);
      gotoMap.setView(pos, gotoZoomForDistance(dist), { animate: false });
      fetchGotoRoute(mural);
    }
  }, 150);

  // Start GPS watcher
  state.gotoWatchId = navigator.geolocation.watchPosition(
    pos => {
      state.userLat = pos.coords.latitude;
      state.userLng = pos.coords.longitude;
      updateGotoPosition(mural);
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 0 }
  );

  // Check arrival immediately if we have position
  if (state.userLat && state.userLng) {
    updateGotoHud(mural);
  }
}

/** Fetch OSRM walking route and draw it on the goto map. */
function fetchGotoRoute(mural) {
  if (!state.gotoMap || !state.userLat || !state.userLng) return;
  state.gotoLastRoutePos = { lat: state.userLat, lng: state.userLng };

  const drawRoute = (coords) => {
    if (!state.gotoMap || !state.gotoMode) return;
    if (state.gotoRouteLine) state.gotoMap.removeLayer(state.gotoRouteLine);
    state.gotoRouteLine = L.polyline(coords, {
      color: '#0E918C',
      weight: 5,
      opacity: 0.85,
    }).addTo(state.gotoMap);
  };

  // Draw straight line immediately as fallback
  drawRoute([[state.userLat, state.userLng], [mural.lat, mural.lng]]);

  // Try OSRM for a proper walking route
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${state.userLng},${state.userLat};${mural.lng},${mural.lat}?overview=full&geometries=geojson`;
  fetch(url, { signal: AbortSignal.timeout(8000) })
    .then(r => r.json())
    .then(data => {
      if (data.routes && data.routes.length > 0) {
        const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        drawRoute(coords);
      }
    })
    .catch(() => {}); // keep the straight-line fallback
}

/** Update user marker position and HUD on each GPS tick. */
function updateGotoPosition(mural) {
  if (!state.gotoMap || !state.gotoMode) return;
  const pos = [state.userLat, state.userLng];

  // Move user markers
  if (state.gotoUserDot) {
    state.gotoUserDot.setLatLng(pos);
    state.gotoUserPulse.setLatLng(pos);
  } else {
    state.gotoUserPulse = L.marker(pos, { icon: L.divIcon({ className: 'user-loc-pulse', iconSize: [40, 40], iconAnchor: [20, 20] }), interactive: false }).addTo(state.gotoMap);
    state.gotoUserDot = L.marker(pos, { icon: L.divIcon({ className: 'user-loc-dot', html: '<div class="user-loc-inner"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 1000 }).addTo(state.gotoMap);
    const initDist = haversine(state.userLat, state.userLng, mural.lat, mural.lng);
    state.gotoMap.setView(pos, gotoZoomForDistance(initDist), { animate: false });
    // Fetch initial route
    fetchGotoRoute(mural);
  }

  // Re-fetch route if user has moved > 100m from last route fetch point
  if (state.gotoLastRoutePos) {
    const drift = haversine(state.userLat, state.userLng, state.gotoLastRoutePos.lat, state.gotoLastRoutePos.lng);
    if (drift > 100) fetchGotoRoute(mural);
  }

  updateGotoHud(mural);
}

/** Update the distance/time HUD and check for arrival. */
function updateGotoHud(mural) {
  if (!state.userLat || !state.userLng || !mural.lat || !mural.lng) return;
  const dist = haversine(state.userLat, state.userLng, mural.lat, mural.lng);

  const distEl = document.querySelector('.goto-dist');
  const timeEl = document.querySelector('.goto-time');
  if (distEl) distEl.textContent = formatDistance(dist);
  if (timeEl) {
    const mins = Math.max(1, Math.round(dist / 80));
    timeEl.textContent = mins < 60 ? `${mins} min walk` : `${(mins / 60).toFixed(1)} hr walk`;
  }

  // Arrival detection: < 50m
  const arrivedEl = document.querySelector('.goto-arrived');
  if (arrivedEl && dist < 50) {
    arrivedEl.hidden = false;
    if (!arrivedEl.dataset.shown) {
      arrivedEl.dataset.shown = '1';
      const muralTours = ROUTE_DEFS.filter(r => r.ids && r.ids.includes(mural.id));
      if (muralTours.length === 0) {
        arrivedEl.innerHTML = `<div class="goto-arrived-msg">You've arrived!</div>`;
      } else if (muralTours.length === 1) {
        arrivedEl.innerHTML = `
          <div class="goto-arrived-msg">You've arrived!</div>
          <button class="goto-tour-btn" data-tour-id="${muralTours[0].id}">Open in Tour: ${muralTours[0].name}</button>
        `;
        arrivedEl.querySelector('.goto-tour-btn').addEventListener('click', () => {
          const def = muralTours[0];
          exitGotoMode();
          detailPage.hidden = true;
          state.selectedMural = null;
          switchTab('loops');
          openTour(def, mural.id);
        });
      } else {
        arrivedEl.innerHTML = `
          <div class="goto-arrived-msg">You've arrived!</div>
          <select class="goto-tour-select">
            ${muralTours.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
          </select>
          <button class="goto-tour-btn goto-tour-go-btn">Open Tour</button>
        `;
        arrivedEl.querySelector('.goto-tour-go-btn').addEventListener('click', () => {
          const sel = arrivedEl.querySelector('.goto-tour-select');
          const def = ROUTE_DEFS.find(r => r.id === sel.value);
          if (!def) return;
          exitGotoMode();
          detailPage.hidden = true;
          state.selectedMural = null;
          switchTab('loops');
          openTour(def, mural.id);
        });
      }
    }
  }
}

/** Tear down GoTo resources without re-rendering (used when hiding detail entirely). */
function cleanupGotoMode() {
  if (state.gotoWatchId != null) {
    navigator.geolocation.clearWatch(state.gotoWatchId);
    state.gotoWatchId = null;
  }
  if (state.gotoMap) { state.gotoMap.remove(); state.gotoMap = null; }
  state.gotoUserDot = null;
  state.gotoUserPulse = null;
  state.gotoRouteLine = null;
  state.gotoLastRoutePos = null;
  state.gotoMode = false;
  state.gotoMural = null;
}

/**
 * Exit GoTo mode — restore normal detail body content.
 */
function exitGotoMode() {
  // Stop GPS watcher
  if (state.gotoWatchId != null) {
    navigator.geolocation.clearWatch(state.gotoWatchId);
    state.gotoWatchId = null;
  }

  // Destroy map
  if (state.gotoMap) {
    state.gotoMap.remove();
    state.gotoMap = null;
  }
  state.gotoUserDot = null;
  state.gotoUserPulse = null;
  state.gotoRouteLine = null;
  state.gotoLastRoutePos = null;

  state.gotoMode = false;
  const mural = state.gotoMural;
  state.gotoMural = null;

  // Re-render the detail page if the mural is still selected
  if (mural && state.selectedMural && state.selectedMural.id === mural.id) {
    detailContent.innerHTML = buildDetailBodyHTML(mural);
    // Re-attach nearby card listeners
    detailContent.querySelectorAll('.detail-nearby-card').forEach(card => {
      card.addEventListener('click', () => {
        const m = murals.find(m => m.id === Number(card.dataset.id));
        if (m) openDetail(m);
      });
    });
    // Re-attach pill buttons
    wireGotoButton(mural);
    wireTourPill(mural);
    // Restart detail compass
    initDetailCompass(mural);
  }
}

/** Wire the GoTo pill button click handler for a mural. */
function wireGotoButton(mural) {
  const pill = detailContent.querySelector('.detail-goto-pill');
  if (pill) {
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      if (state.gotoMode) {
        exitGotoMode();
      } else {
        enterGotoMode(mural);
      }
    });
  }
}

/** Wire the Tour pill button — always shows dropdown with tour name(s). */
function wireTourPill(mural) {
  const pill = detailContent.querySelector('.detail-tour-pill');
  if (!pill) return;
  const muralTours = ROUTE_DEFS.filter(r => r.ids && r.ids.includes(mural.id));
  if (muralTours.length === 0) return;

  const launchTour = (def) => {
    if (state.gotoMode) cleanupGotoMode();
    stopDetailCompass();
    detailPage.hidden = true;
    state.selectedMural = null;
    switchTab('loops');
    openTour(def, mural.id);
  };

  pill.addEventListener('click', () => {
    // Close any existing dropdown
    const existing = detailContent.querySelector('.tour-dropdown-menu');
    if (existing) { existing.remove(); return; }

    // Build dropdown anchored below the button
    const menu = document.createElement('div');
    menu.className = 'tour-dropdown-menu';
    muralTours.forEach(r => {
      const item = document.createElement('button');
      item.className = 'tour-dropdown-item';
      item.textContent = r.name;
      item.addEventListener('click', () => {
        menu.remove();
        launchTour(r);
      });
      menu.appendChild(item);
    });

    // Position relative to the pill's parent action-item
    const actionItem = pill.closest('.detail-action-item');
    if (actionItem) {
      actionItem.style.position = 'relative';
      actionItem.appendChild(menu);
    }

    // Close on tap outside
    const close = (e) => {
      if (!menu.contains(e.target) && e.target !== pill) {
        menu.remove();
        document.removeEventListener('click', close, true);
      }
    };
    setTimeout(() => document.addEventListener('click', close, true), 0);
  });
}

/** Destroy tour mini-map, reset state, show list. */
function closeTour() {
  bearingDetentArmed = true;
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
  state.tourWalking = false;
}

/** Render the full tour loop view: nav bar, map, bottom panel. */
function renderTourLoop() {
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
        <button class="tour-reverse-nav-btn">Reverse Tour</button>
        <button class="tour-skip-btn">Next Mural</button>
      </div>

      <!-- Map zone -->
      <div class="active-tour-map-zone">
        <div id="tour-map-container" style="width:100%;height:100%"></div>
        <div class="tour-hud-overlay">
          <div class="compass-arc tour-compass-arc" hidden>
            ${buildCompassRingSVG()}
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
      <div class="tour-divider-line tour-divider-top"></div>
      <div class="active-tour-bottom">
        <div class="tour-bottom-row" data-state="arrived">
          <!-- Mode header -->
          <div class="tour-mode-header">
            <span class="tour-mode-label">Explore Mural</span>
          </div>

          <div class="tour-bottom-content">
            <!-- Left zone: mural image (explore) or compass+instruction (navigating) -->
            <div class="tour-left-zone">
              <div class="tour-stop-card tour-stop-main" data-id="">
                <div class="tour-stop-img-wrap">
                  <img class="tour-stop-img" src="" alt="" onerror="this.style.background='#ddd'">
                  <span class="tour-stop-num"></span>
                </div>
              </div>
              <div class="tour-nav-instruction" hidden>
                <ul class="tour-mode-bullets tour-mode-bullets-nav">
                  <li>Follow the compass bearing</li>
                  <li>Sense the direction with vibrations</li>
                  <li>Zoom the map</li>
                  <li>Next Mural automatically pops up on Arrival</li>
                </ul>
              </div>
            </div>

            <!-- Right zone: bullets + button (explore) or mural image (navigating) -->
            <div class="tour-right-zone">
              <div class="tour-right-explore">
                <ul class="tour-mode-bullets">
                  <li>Click Mural detail page</li>
                  <li>Artist info and awards</li>
                  <li>Nearby murals</li>
                </ul>
                <button class="tour-action-btn">
                  <span class="tour-action-line1">Navigate to</span>
                  <span class="tour-action-line2">Next Mural</span>
                </button>
              </div>
              <div class="tour-stop-card tour-stop-dest" data-id="" hidden>
                <div class="tour-stop-img-wrap">
                  <img class="tour-stop-img" src="" alt="" onerror="this.style.background='#ddd'">
                  <span class="tour-stop-num"></span>
                </div>
              </div>
            </div>
          </div>

          <!-- Artist name -->
          <div class="tour-stop-artist"></div>

          <!-- Progress bar -->
          <div class="tour-progress-row">
            <div class="tour-progress-track">
              <div class="tour-progress-fill"></div>
            </div>
            <span class="tour-progress-label"></span>
          </div>
        </div>
      </div>
      <div class="tour-divider-line tour-divider-bottom"></div>
    </div>
  `;

  // Back button
  views.loops.querySelector('.active-tour-back').addEventListener('click', () => {
    closeTour();
    renderTourList();
  });

  // Skip Ahead — advance to next stop immediately
  views.loops.querySelector('.tour-skip-btn')?.addEventListener('click', () => {
    const len = state.tourStops.length;
    if (!len) return;
    const nextIdx = state.tourDirection === 'fwd'
      ? wrapIndex(state.tourIndex + 1, len)
      : wrapIndex(state.tourIndex - 1, len);
    state.tourIndex = nextIdx;
    state.tourWalking = false;
    hapticVibrate(200);
    renderTourBottom();
  });

  // Action button — "Next Mural" transitions from arrived → walking
  views.loops.querySelector('.tour-action-btn')?.addEventListener('click', () => {
    if (!state.tourWalking) {
      state.tourWalking = true;
      bearingDetentArmed = true;
      hapticVibrate(200);
      renderTourBottom();
    }
  });

  // Main mural card tap → open mural detail
  views.loops.querySelector('.tour-stop-main')?.addEventListener('click', () => {
    const id = Number(views.loops.querySelector('.tour-stop-main').dataset.id);
    const mural = murals.find(m => m.id === id);
    if (mural) openDetail(mural);
  });

  // Destination mural card tap → open mural detail
  views.loops.querySelector('.tour-stop-dest')?.addEventListener('click', () => {
    const id = Number(views.loops.querySelector('.tour-stop-dest').dataset.id);
    const mural = murals.find(m => m.id === id);
    if (mural) openDetail(mural);
  });


  // Reverse button (in nav bar) — toggle direction
  views.loops.querySelector('.tour-reverse-nav-btn')?.addEventListener('click', () => {
    state.tourDirection = state.tourDirection === 'fwd' ? 'back' : 'fwd';
    renderTourBottom();
    fetchTourSegment();
  });

  // Initial bottom panel fill
  renderTourBottom();

  // Init map
  initTourMap();

  // Compass bearing arc
  initCompassArc();
}

/** Update the bottom panel for explore/navigating state. */
function renderTourBottom() {
  const stops = state.tourStops;
  const len = stops.length;
  if (!len) return;
  const currIdx = state.tourIndex;
  const nextIdx = state.tourDirection === 'fwd'
    ? wrapIndex(currIdx + 1, len)
    : wrapIndex(currIdx - 1, len);
  const walking = state.tourWalking;

  // Helper to fill a stop card
  function fillCard(sel, stop, num) {
    const card = views.loops.querySelector(sel);
    if (!card) return;
    card.dataset.id = stop.id;
    const img = card.querySelector('.tour-stop-img');
    if (img) { img.src = stop.img || ''; img.alt = stop.a; }
    const numEl = card.querySelector('.tour-stop-num');
    if (numEl) numEl.textContent = num;
  }

  // Set data-state on bottom row for CSS theming
  const row = views.loops.querySelector('.tour-bottom-row');
  if (row) row.dataset.state = walking ? 'walking' : 'arrived';
  views.loops.querySelectorAll('.tour-divider-line').forEach(el => {
    el.classList.toggle('walking', walking);
  });

  // Mode header
  const modeLabel = views.loops.querySelector('.tour-mode-label');
  if (modeLabel) modeLabel.textContent = walking ? 'Navigating to Next Mural' : 'Explore the Mural';

  // Artist name
  const artistEl = views.loops.querySelector('.active-tour-bottom .tour-stop-artist');
  if (artistEl) artistEl.textContent = walking ? stops[nextIdx].a : stops[currIdx].a;

  if (walking) {
    // Navigating: show instruction on left, destination mural on right
    const mainCard = views.loops.querySelector('.tour-stop-main');
    const destCard = views.loops.querySelector('.tour-stop-dest');
    const navInstr = views.loops.querySelector('.tour-nav-instruction');
    const actionBtn = views.loops.querySelector('.tour-action-btn');
    const exploreZone = views.loops.querySelector('.tour-right-explore');
    if (mainCard) mainCard.hidden = true;
    if (destCard) { destCard.hidden = false; fillCard('.tour-stop-dest', stops[nextIdx], nextIdx + 1); }
    if (navInstr) navInstr.hidden = false;
    if (exploreZone) exploreZone.hidden = true;
  } else {
    // Explore: show current mural on left, Next Mural button + detail link on right
    const mainCard = views.loops.querySelector('.tour-stop-main');
    const destCard = views.loops.querySelector('.tour-stop-dest');
    const navInstr = views.loops.querySelector('.tour-nav-instruction');
    const exploreZone = views.loops.querySelector('.tour-right-explore');
    if (mainCard) { mainCard.hidden = false; fillCard('.tour-stop-main', stops[currIdx], currIdx + 1); }
    if (destCard) destCard.hidden = true;
    if (navInstr) navInstr.hidden = true;
    if (exploreZone) exploreZone.hidden = false;
  }

  // Progress bar
  const pct = Math.round(((currIdx + 1) / len) * 100);
  const fill = views.loops.querySelector('.tour-progress-fill');
  const label = views.loops.querySelector('.tour-progress-label');
  const routeColor = TOUR_COLORS[state.activeTour?.id] || 'var(--teal)';
  if (fill) { fill.style.width = pct + '%'; fill.style.background = routeColor; }
  if (label) label.textContent = `${currIdx + 1} of ${len}`;

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
  const hasSegments = segments && segments.length >= len;

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
            html: `<div style="transform:rotate(${angle}deg);color:${color};font-size:18px">▲</div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
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

  // Draw full tour route grayed out behind everything
  const tourColor = TOUR_COLORS[routeId] || '#999';
  for (let s = 0; s < len; s++) {
    // Skip the active and inactive segments (drawn separately)
    const isFwd = dir === 'fwd';
    if (s === idx && isFwd) continue;                          // active fwd
    if (s === wrapIndex(idx - 1, len) && !isFwd) continue;    // active bwd
    if (s === wrapIndex(idx - 1, len) && isFwd) continue;     // inactive bwd
    if (s === idx && !isFwd) continue;                         // inactive fwd
    const seg = resolveFwdSegment(s);
    if (seg) {
      const grayRoute = L.polyline(seg, { color: tourColor, weight: 3, opacity: 0.5, dashArray: '4, 8' }).addTo(tourMap);
      state.tourAdjacentRoutes.push(grayRoute);
    }
  }

  // Grayed-out stops for the rest of the tour
  for (let s = 0; s < len; s++) {
    if (s === idx) continue; // current stop (drawn prominently)
    const aIdx = dir === 'fwd' ? wrapIndex(idx + 1, len) : wrapIndex(idx - 1, len);
    const iIdx = dir === 'fwd' ? wrapIndex(idx - 1, len) : wrapIndex(idx + 1, len);
    if (s === aIdx || s === iIdx) continue; // active/inactive destination (drawn separately)
    const stop = stops[s];
    const grayPin = L.marker([stop.lat, stop.lng], {
      icon: L.divIcon({
        className: 'tour-map-pin',
        html: `<div class="tour-pin adjacent"><img src="${stop.img || ''}" alt="${stop.a}"><span class="tour-pin-num">${s + 1}</span></div>`,
        iconSize: [28, 28], iconAnchor: [14, 14],
      })
    }).addTo(tourMap);
    grayPin.on('click', () => openDetail(stop));
    state.tourAdjacentRoutes.push(grayPin);
  }

  // Draw inactive segment (renders behind active)
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

  // Draw active segment — orange when walking, teal when arrived
  const segColor = state.tourWalking ? '#FF7043' : '#0E918C';
  const activeHasPrecise = activeSeg && activeSeg.length > 2;
  const activeStyle = activeHasPrecise
    ? { color: segColor, weight: 5, opacity: 0.85 }
    : { color: segColor, weight: 4, opacity: 0.7, dashArray: '8, 12' };

  let distMeters = 0;
  if (activeSeg) {
    for (let i = 1; i < activeSeg.length; i++) {
      distMeters += haversine(activeSeg[i-1][0], activeSeg[i-1][1], activeSeg[i][0], activeSeg[i][1]);
    }
  }
  const mins = Math.max(1, Math.round(distMeters / speed));

  if (activeSeg) {
    state.tourRoute = L.polyline(activeSeg, activeStyle).addTo(tourMap);
    addRouteArrows(state.tourRoute, segColor);
  }

  // Center map on midpoint between current and next stop
  const midLat = (nowStop.lat + activeStop.lat) / 2;
  const midLng = (nowStop.lng + activeStop.lng) / 2;
  const segDist = haversine(nowStop.lat, nowStop.lng, activeStop.lat, activeStop.lng);
  // Pick zoom based on segment distance — closer stops get tighter zoom
  let zoom = 17;
  if (segDist > 800) zoom = 15;
  else if (segDist > 400) zoom = 16;
  // Offset center upward to account for bottom panel
  const targetPoint = tourMap.project([midLat, midLng], zoom);
  targetPoint.y -= 60; // shift up so route sits in visible area above bottom panel
  const adjustedCenter = tourMap.unproject(targetPoint, zoom);
  tourMap.setView(adjustedCenter, zoom, { animate: false });

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
  renderTourBottom();
}


// =============================================
// Detail page
// =============================================

/**
 * Build reusable detail body HTML for a mural.
 * Used by both openDetail() and the map bottom sheet.
 */
// ── Fullscreen photo lightbox (iPhoto-style) ──────────────────────────
function openPhotoLightbox(src) {
  const overlay = document.createElement('div');
  overlay.className = 'photo-lightbox';

  const img = document.createElement('img');
  img.src = src;
  overlay.appendChild(img);
  document.body.appendChild(overlay);

  let scale = 1, panX = 0, panY = 0;
  let startDist = 0, startScale = 1;
  let startX = 0, startY = 0, startPanX = 0, startPanY = 0;
  let dragging = false, pinching = false, didDrag = false;
  let lastTap = 0;

  const apply = () => {
    img.style.transition = (pinching || dragging) ? 'none' : 'transform 0.2s ease';
    img.style.transform = scale <= 1 ? '' : `scale(${scale}) translate(${panX / scale}px, ${panY / scale}px)`;
  };
  const resetZoom = () => { scale = 1; panX = 0; panY = 0; img.style.transition = 'transform 0.2s ease'; img.style.transform = ''; };
  const dist = (t) => Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY);

  const close = () => {
    overlay.classList.add('closing');
    overlay.addEventListener('animationend', () => overlay.remove(), { once: true });
  };

  // Tap / double-tap
  overlay.addEventListener('click', (e) => {
    if (didDrag || pinching) { didDrag = false; return; }
    const now = Date.now();
    if (now - lastTap < 300) {
      // Double-tap → toggle zoom at point
      lastTap = 0;
      if (scale > 1) { resetZoom(); } else {
        const rect = img.getBoundingClientRect();
        img.style.transformOrigin = `${((e.clientX - rect.left) / rect.width) * 100}% ${((e.clientY - rect.top) / rect.height) * 100}%`;
        scale = 2.5; panX = 0; panY = 0; apply();
      }
    } else {
      lastTap = now;
      setTimeout(() => {
        if (lastTap === now && scale <= 1 && !dragging && !pinching) close();
      }, 300);
    }
  });

  // Touch: pinch + pan
  overlay.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      pinching = true; dragging = false;
      startDist = dist(e.touches); startScale = scale;
      img.style.transformOrigin = 'center center';
    } else if (e.touches.length === 1 && scale > 1) {
      dragging = false; didDrag = false;
      startX = e.touches[0].clientX; startY = e.touches[0].clientY;
      startPanX = panX; startPanY = panY;
    }
  }, { passive: true });

  overlay.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinching) {
      e.preventDefault();
      scale = Math.max(1, Math.min(5, startScale * (dist(e.touches) / startDist)));
      if (scale <= 1) { panX = 0; panY = 0; }
      apply();
    } else if (e.touches.length === 1 && scale > 1) {
      e.preventDefault();
      dragging = true; didDrag = true;
      panX = startPanX + (e.touches[0].clientX - startX);
      panY = startPanY + (e.touches[0].clientY - startY);
      apply();
    }
  }, { passive: false });

  overlay.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) pinching = false;
    if (scale <= 1.05) resetZoom();
    setTimeout(() => { dragging = false; }, 50);
  });
}

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
      <button class="detail-font-btn" onclick="cycleTextSize()"><span style="font-size:1em">A</span><span style="font-size:0.65em">A</span></button>
      <div class="detail-artist">${mural.a}</div>
      <div class="detail-title">${mural.t || 'Untitled'}</div>
      <div class="detail-meta-row">
        <div class="detail-meta-left">
          <span class="detail-year-badge">${mural.cat === 'commercial' ? 'Commercial' : mural.cat === 'shine-legacy' ? 'Pre-SHINE' : 'SHINE<sup>&reg;</sup>'} ${mural.y || ''}</span>
          ${mural.from ? `<div class="detail-from">${mural.from}</div>` : ''}
          ${mural.ig ? `<div class="detail-ig"><a href="https://instagram.com/${mural.ig}" target="_blank" rel="noopener">@${mural.ig}</a></div>` : ''}
          <div class="detail-fw">
            <button class="detail-fw-btn" onclick="toggleFurtherWork(this)"${mural.fw ? '' : ' disabled'}>Further Work</button>
            ${mural.fw ? `<div class="detail-fw-list" hidden>${mural.fw.map(g => `<a href="${g.url}" target="_blank" rel="noopener">${g.name}</a>`).join('')}</div>` : ''}
          </div>
        </div>
        <div class="detail-action-btns">
          ${mural.aud ? `<div class="detail-action-item">
            <button id="audio-btn" class="audio-btn" onclick="toggleAudioClip('${mural.aud}')">
              <svg class="audio-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
            </button>
            <span class="detail-action-label">Listen</span>
          </div>` : ''}
          <div class="detail-action-item">
            <button class="detail-tour-pill${muralTours.length === 0 ? ' dimmed' : ''}" data-mural-id="${mural.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/></svg>
            </button>
            <span class="detail-action-label">Tour</span>
          </div>
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
          ${mural.lat && mural.lng ? `<div class="detail-action-item">
            <button class="detail-goto-pill" data-mural-id="${mural.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
            </button>
            <span class="detail-action-label">Directions</span>
          </div>` : ''}
        </div>
      </div>

      <div class="detail-nav-bar">
        ${mural.lat && mural.lng ? `
          <div class="detail-compass-wrap detail-hud-wrap">
            <div class="compass-arc detail-compass-arc detail-hud-arc" id="detail-compass-arc" hidden>
              ${buildCompassRingSVG()}
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
  detailRouteCache = { lat: null, lng: null, muralId: null, dist: null, dur: null, pending: false };

  detailContent.innerHTML = buildDetailBodyHTML(mural);

  detailContent.querySelectorAll('.detail-nearby-card').forEach(card => {
    card.addEventListener('click', () => {
      const m = murals.find(m => m.id === Number(card.dataset.id));
      if (m) openDetail(m);
    });
  });

  // Tap hero image → open fullscreen iPhoto-style lightbox
  const heroWrap = detailContent.querySelector('.detail-hero-wrap');
  if (heroWrap) {
    heroWrap.addEventListener('click', () => openPhotoLightbox(heroWrap.querySelector('.detail-hero').src));
  }

  // Wire GoTo + Tour pill buttons
  wireGotoButton(mural);
  wireTourPill(mural);

  detailPage.scrollTop = 0;

  // Start detail compass
  initDetailCompass(mural);
}

// Back button — if in GoTo mode, exit GoTo instead of closing detail
$('#detail-back').addEventListener('click', () => {
  if (state.gotoMode) {
    exitGotoMode();
    return;
  }
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
  // Open detail page in GoTo mode
  openDetail(mural);
  enterGotoMode(mural);
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
// Help Overlay
// =============================================

function getHelpAnnotations() {
  const tab = state.tab;

  if (tab === 'explore') return [
    {
      text: 'Search by artist\nor title',
      color: '#FFD600',
      top: '2%', left: '47%',
      arrowSvg: `<svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
        <path d="M22 2 C20 14, 16 28, 14 40"/>
        <line x1="8" y1="34" x2="14" y2="42"/><line x1="20" y1="36" x2="14" y2="42"/>
      </svg>`,
      arrowOffset: { top: -57, left: -50 }
    },
    {
      text: 'Filter by year,\ncategory, or SHINE',
      color: '#FFD600',
      top: '28%', left: '37%',
      arrowSvg: `<svg width="30" height="50" viewBox="0 0 30 50" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
        <path d="M18 48 C16 34, 12 18, 10 4"/>
        <line x1="4" y1="12" x2="10" y2="2"/><line x1="16" y1="8" x2="10" y2="2"/>
      </svg>`,
      arrowOffset: { top: -64, left: -64 }
    },
    {
      text: 'Tap any mural\nfor details',
      color: '#FFFFFF',
      top: '53%', left: '28%',
      isLarge: true
    }
  ];

  if (tab === 'map') return [
    {
      text: 'Filter murals',
      color: '#FFD600',
      top: '18%', left: '67%',
      arrowSvg: `<svg width="30" height="50" viewBox="0 0 30 50" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
        <path d="M16 48 C14 34, 10 18, 8 4"/>
        <line x1="2" y1="12" x2="8" y2="2"/><line x1="14" y1="8" x2="8" y2="2"/>
      </svg>`,
      arrowOffset: { top: -55, left: -34 }
    },
    {
      text: 'Colored dots are\nmurals — zoom\nand tap one!',
      color: '#FFD600',
      top: '60%', left: '6%'
    },
    {
      text: 'Find yourself',
      color: '#FFFFFF',
      top: '24%', left: '53%',
      arrowSvg: `<svg width="50" height="30" viewBox="0 0 50 30" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
        <path d="M2 10 C16 12, 32 16, 46 18"/>
        <line x1="38" y1="12" x2="46" y2="18"/><line x1="40" y1="26" x2="46" y2="18"/>
      </svg>`,
      arrowOffset: { top: -5, left: 74 }
    },
    {
      text: 'Nearest mural',
      color: '#FFFFFF',
      top: '31%', left: '38%',
      arrowSvg: `<svg width="50" height="30" viewBox="0 0 50 30" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
        <path d="M2 8 C12 10, 28 18, 46 22"/>
        <line x1="38" y1="16" x2="46" y2="22"/><line x1="40" y1="28" x2="46" y2="22"/>
      </svg>`,
      arrowOffset: { top: -16, left: 129 }
    },
    {
      text: 'Nearest mural on tour',
      color: '#FFFFFF',
      top: '39%', left: '31%',
      arrowSvg: `<svg width="50" height="28" viewBox="0 0 50 28" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
        <path d="M2 18 C14 8, 34 22, 46 14"/>
        <line x1="38" y1="10" x2="46" y2="14"/><line x1="40" y1="22" x2="46" y2="14"/>
      </svg>`,
      arrowOffset: { top: -14, left: 167 }
    },
    {
      text: 'Discover Mode —\nget buzzed\nnear murals!',
      color: '#00E676',
      top: '48%', left: '39%',
      arrowSvg: `<svg width="50" height="34" viewBox="0 0 50 34" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
        <path d="M2 28 C14 26, 30 8, 46 6"/>
        <line x1="38" y1="2" x2="46" y2="6"/><line x1="40" y1="14" x2="46" y2="6"/>
      </svg>`,
      arrowOffset: { top: -75, left: 130 }
    },
  ];

  if (tab === 'loops') {
    if (state.activeTour && state.tourStops.length) return [
      {
        text: 'Your compass\npoints the way',
        color: '#FFD600',
        top: '20%', left: '35%',
        isLarge: true
      },
      {
        text: 'Skip to\nnext stop',
        color: '#FFFFFF',
        top: '5%', left: '70%'
      },
      {
        text: 'Reverse tour\ndirection',
        color: '#00E676',
        top: '5%', left: '39%'
      },
      {
        text: 'Click to\ncontinue',
        color: '#FFD600',
        top: '50%', left: '20%',
        isLarge: true,
        arrowSvg: `<svg width="44" height="50" viewBox="0 0 44 50" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 6 C12 18, 22 32, 34 44"/>
          <line x1="26" y1="40" x2="34" y2="44"/><line x1="34" y1="36" x2="34" y2="44"/>
        </svg>`,
        arrowOffset: { top: 19, left: 41 }
      }
    ];

    return [
      {
        text: 'Scroll up to browse\ntour routes',
        color: '#FFFFFF',
        top: '41%', left: '6%',
        isLarge: true
      },
      {
        text: 'Tap Go to\nstart tour!',
        color: '#FFD600',
        top: '53%', left: '61%',
        arrowSvg: `<svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
          <path d="M20 2 C22 15, 24 25, 28 36"/>
          <line x1="22" y1="30" x2="28" y2="38"/><line x1="32" y1="30" x2="28" y2="38"/>
        </svg>`,
        arrowOffset: { top: 7, left: 45 }
      }
    ];
  }

  return [];
}

function toggleHelp() {
  state.helpVisible ? closeHelp() : openHelp();
}

const HELP_DEBUG = new URLSearchParams(window.location.search).has('help-debug');

function openHelp() {
  if (state.selectedMural) return;
  const anns = getHelpAnnotations();
  if (!anns.length) return;

  state.helpVisible = true;

  const container = document.getElementById('help-annotations');
  container.innerHTML = anns.map((ann, i) => {
    const styles = [];
    for (const p of ['top','bottom','left','right','transform']) {
      if (ann[p]) styles.push(`${p}:${ann[p]}`);
    }
    styles.push(`color:${ann.color}`);
    if (HELP_DEBUG) styles.push('pointer-events:auto;cursor:move');
    const cls = ann.isLarge ? 'help-label help-label-lg' : 'help-label';
    return `<div class="help-ann" data-idx="${i}" style="${styles.join(';')}">
      <div class="${cls}">${ann.text}</div>
      ${ann.arrowSvg ? `<div class="help-arrow" style="position:relative;${ann.arrowOffset ? `top:${ann.arrowOffset.top}px;left:${ann.arrowOffset.left}px;` : ''}${HELP_DEBUG ? 'pointer-events:auto;cursor:move;display:inline-block' : ''}">${ann.arrowSvg}${HELP_DEBUG ? '<div class="help-debug-arrow-pos" style="font:10px/1.2 monospace;color:#f0f;text-shadow:none"></div>' : ''}</div>` : ''}
      ${HELP_DEBUG ? `<div class="help-debug-pos" style="font:11px/1.3 monospace;color:#0ff;margin-top:4px;text-shadow:none"></div>` : ''}
    </div>`;
  }).join('');

  if (HELP_DEBUG) {
    // Add copy button
    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy Positions';
    Object.assign(copyBtn.style, {
      position: 'fixed', top: '50px', right: '12px', zIndex: '9999',
      padding: '8px 14px', borderRadius: '8px', border: 'none',
      background: '#0ff', color: '#000', fontWeight: '700', fontSize: '13px',
      cursor: 'pointer', pointerEvents: 'auto'
    });
    copyBtn.id = 'help-debug-copy';
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const els = container.querySelectorAll('.help-ann');
      const vw = window.innerWidth, vh = window.innerHeight;
      const positions = [...els].map((el, i) => {
        const r = el.getBoundingClientRect();
        const entry = { idx: i, text: anns[i].text.replace(/\n/g, '\\n'), top: `${Math.round(r.top/vh*100)}%`, left: `${Math.round(r.left/vw*100)}%`, topPx: `${Math.round(r.top)}px`, leftPx: `${Math.round(r.left)}px` };
        const arrow = el.querySelector('.help-arrow');
        if (arrow) {
          entry.arrowOffsetTop = arrow.style.top || '0px';
          entry.arrowOffsetLeft = arrow.style.left || '0px';
        }
        return entry;
      });
      const json = JSON.stringify(positions, null, 2);
      // Clipboard API needs HTTPS — fallback to a selectable textarea
      let box = document.getElementById('help-debug-output');
      if (!box) {
        box = document.createElement('textarea');
        box.id = 'help-debug-output';
        Object.assign(box.style, {
          position: 'fixed', top: '90px', left: '8px', right: '8px', zIndex: '99999',
          height: '200px', fontSize: '11px', fontFamily: 'monospace',
          background: '#111', color: '#0ff', border: '2px solid #0ff', borderRadius: '8px',
          padding: '8px', pointerEvents: 'auto'
        });
        document.body.appendChild(box);
      }
      box.value = json;
      box.hidden = false;
      box.focus();
      box.select();
    });
    document.getElementById('help-overlay').appendChild(copyBtn);

    // Make each annotation draggable
    container.querySelectorAll('.help-ann').forEach(el => {
      const posLabel = el.querySelector('.help-debug-pos');
      const updateLabel = () => {
        const r = el.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;
        posLabel.textContent = `top:${Math.round(r.top/vh*100)}%  left:${Math.round(r.left/vw*100)}%  (${Math.round(r.top)}px,${Math.round(r.left)}px)`;
      };
      updateLabel();

      let startX, startY, origX, origY;
      const onStart = (ex, ey) => {
        startX = ex; startY = ey;
        const r = el.getBoundingClientRect();
        origX = r.left; origY = r.top;
        el.style.transform = 'none';
        el.style.bottom = 'auto';
        el.style.right = 'auto';
        el.style.top = origY + 'px';
        el.style.left = origX + 'px';
      };
      const onMove = (ex, ey) => {
        el.style.top = (origY + ey - startY) + 'px';
        el.style.left = (origX + ex - startX) + 'px';
        updateLabel();
      };
      el.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        onStart(e.clientX, e.clientY);
        const mm = (ev) => onMove(ev.clientX, ev.clientY);
        const mu = () => { document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); };
        document.addEventListener('mousemove', mm);
        document.addEventListener('mouseup', mu);
      });
      el.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        const t = e.touches[0];
        onStart(t.clientX, t.clientY);
        const tm = (ev) => { ev.preventDefault(); const t2 = ev.touches[0]; onMove(t2.clientX, t2.clientY); };
        const te = () => { document.removeEventListener('touchmove', tm); document.removeEventListener('touchend', te); };
        document.addEventListener('touchmove', tm, { passive: false });
        document.addEventListener('touchend', te);
      });

      // Arrow dragging (independent of label)
      const arrow = el.querySelector('.help-arrow');
      if (arrow) {
        const arrowPosLabel = arrow.querySelector('.help-debug-arrow-pos');
        let aStartX, aStartY, aOrigLeft, aOrigTop;
        const updateArrowLabel = () => {
          arrowPosLabel.textContent = `arrow top:${parseInt(arrow.style.top)||0}px left:${parseInt(arrow.style.left)||0}px`;
        };
        updateArrowLabel();

        const aOnStart = (ex, ey) => {
          aStartX = ex; aStartY = ey;
          aOrigLeft = parseInt(arrow.style.left) || 0;
          aOrigTop = parseInt(arrow.style.top) || 0;
        };
        const aOnMove = (ex, ey) => {
          arrow.style.left = (aOrigLeft + ex - aStartX) + 'px';
          arrow.style.top = (aOrigTop + ey - aStartY) + 'px';
          updateArrowLabel();
        };
        arrow.addEventListener('mousedown', (e) => {
          e.preventDefault(); e.stopPropagation();
          aOnStart(e.clientX, e.clientY);
          const mm = (ev) => aOnMove(ev.clientX, ev.clientY);
          const mu = () => { document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); };
          document.addEventListener('mousemove', mm);
          document.addEventListener('mouseup', mu);
        });
        arrow.addEventListener('touchstart', (e) => {
          e.stopPropagation();
          const t = e.touches[0];
          aOnStart(t.clientX, t.clientY);
          const tm = (ev) => { ev.preventDefault(); const t2 = ev.touches[0]; aOnMove(t2.clientX, t2.clientY); };
          const te = () => { document.removeEventListener('touchmove', tm); document.removeEventListener('touchend', te); };
          document.addEventListener('touchmove', tm, { passive: false });
          document.addEventListener('touchend', te);
        });
      }
    });
  }

  document.getElementById('help-overlay').hidden = false;
  document.getElementById('tab-help').classList.add('help-active');

  // Stays visible until user taps the screen (no auto-close timer)
}

function closeHelp() {
  if (HELP_DEBUG) return; // don't auto-close in debug mode
  state.helpVisible = false;
  clearTimeout(state.helpTimer);
  document.getElementById('help-overlay').hidden = true;
  document.getElementById('tab-help').classList.remove('help-active');
  const copyBtn = document.getElementById('help-debug-copy');
  if (copyBtn) copyBtn.remove();
}

// Cheat sheet only closes via the tab button (toggles in tab-help click handler)

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
