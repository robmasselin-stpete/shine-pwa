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
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
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
} else if (hasAccess() || location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
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
  if (hasLiked(muralId)) return; // one like per device
  myLikes.add(muralId);
  saveLikes();
  likeCounts[muralId] = (likeCounts[muralId] || 0) + 1;

  // Update UI immediately
  const btn = document.getElementById('like-btn');
  if (btn) {
    btn.classList.add('liked');
    btn.querySelector('.like-count').textContent = likeCounts[muralId] || '';
  }

  // Send to backend
  try {
    await fetch('/.netlify/functions/like-mural', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ muralId }),
    });
  } catch { /* offline — local state is saved, server will be behind */ }
}

// Fetch counts on load
fetchLikeCounts();

// =============================================
// State — single mutable object drives all UI
// =============================================
const state = {
  tab: 'map',
  searchQuery: '',
  exploreFilter: null,  // null=all, or array e.g. ['shine'], ['shine','commercial']
  exploreYear: null,    // null=all years in filter, or specific year number
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
  tourMarkers: [],         // L.marker array on tour map
  tourFetching: false,
  // Walk Mode state
  walkMode: false,
  walkWatchId: null,
  walkAlerted: new Set(),
};

// Walk Mode module-level vars
let walkAudioCtx = null;
let proximityBannerEl = null;
let proximityBannerTimeout = null;
const PROXIMITY_THRESHOLD = 30.48; // 100 feet in meters

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
  detailPage.hidden = true;

  // Show/hide route bar on map tab
  const routeBar = document.querySelector('.map-route-bar');
  if (routeBar) routeBar.classList.toggle('visible', tab === 'map');

  if (tab !== 'map') clearDirections();
  if (tab !== 'loops' && state.activeTour) closeTour();
  if (tab === 'explore') { renderFilterPills(); renderExplore(); }
  if (tab === 'map') { initMap(); flashFabLabels(); }
  if (tab === 'loops') renderTourList();
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

/** Format meters as "X ft" or "X.X mi" for display. */
function formatDistance(meters) {
  const feet = meters * 3.28084;
  if (feet < 1000) return `${Math.round(feet)} ft`;
  return `${(feet / 5280).toFixed(1)} mi`;
}

// =============================================
// Walk Mode — Proximity Alerts
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

/** Toggle Walk Mode on/off. */
function toggleWalkMode() {
  state.walkMode = !state.walkMode;
  const fab = document.getElementById('fab-walk');

  if (state.walkMode) {
    fab && fab.classList.add('active');
    showWalkPill();
    state.walkWatchId = navigator.geolocation.watchPosition(
      pos => {
        state.userLat = pos.coords.latitude;
        state.userLng = pos.coords.longitude;
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
    removeWalkPill();
    dismissProximityBanner();
  }
}

/** Check all murals for proximity and alert on the first match. */
function checkProximityAlerts() {
  if (!state.walkMode || !state.userLat) return;
  for (const m of murals) {
    if (state.walkAlerted.has(m.id)) continue;
    const dist = haversine(state.userLat, state.userLng, m.lat, m.lng);
    if (dist <= PROXIMITY_THRESHOLD) {
      state.walkAlerted.add(m.id);
      playProximityChime();
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
    <button class="proximity-banner-view">View</button>
    <button class="proximity-banner-dismiss">&times;</button>
  `;
  document.body.appendChild(el);
  proximityBannerEl = el;

  // Trigger slide-up animation
  requestAnimationFrame(() => el.classList.add('visible'));

  el.querySelector('.proximity-banner-view').addEventListener('click', () => {
    dismissProximityBanner();
    openDetail(mural);
  });
  el.querySelector('.proximity-banner-dismiss').addEventListener('click', () => {
    dismissProximityBanner();
  });

  proximityBannerTimeout = setTimeout(dismissProximityBanner, 8000);
}

/** Dismiss the proximity banner if showing. */
function dismissProximityBanner() {
  clearTimeout(proximityBannerTimeout);
  if (proximityBannerEl) {
    proximityBannerEl.remove();
    proximityBannerEl = null;
  }
}

/** Show the persistent "Walk Mode ON" pill at top of screen. */
function showWalkPill() {
  if (document.querySelector('.walk-mode-pill')) return;
  const pill = document.createElement('div');
  pill.className = 'walk-mode-pill';
  pill.innerHTML = `
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7z"/></svg>
    Walk Mode ON
    <button class="walk-pill-x" aria-label="Turn off Walk Mode">&times;</button>
  `;
  document.body.appendChild(pill);
  pill.querySelector('.walk-pill-x').addEventListener('click', toggleWalkMode);
}

/** Remove the Walk Mode pill. */
function removeWalkPill() {
  const pill = document.querySelector('.walk-mode-pill');
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
  if (state.exploreYear) {
    list = list.filter(m => m.y === state.exploreYear);
  }

  // Search
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    list = list.filter(m =>
      m.a.toLowerCase().includes(q) ||
      (m.loc && m.loc.toLowerCase().includes(q)) ||
      (m.t && m.t.toLowerCase().includes(q)) ||
      (m.bldg && m.bldg.toLowerCase().includes(q)) ||
      (m.desc && m.desc.toLowerCase().includes(q)) ||
      (m.imp && m.imp.some(i => i.toLowerCase().includes(q)))
    );
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
        // "All" clears filter
        state.exploreFilter = null;
      } else {
        // Toggle: add or remove from array
        let arr = state.exploreFilter ? [...state.exploreFilter] : [];
        if (arr.includes(cat)) {
          arr = arr.filter(c => c !== cat);
        } else {
          arr.push(cat);
        }
        state.exploreFilter = arr.length > 0 ? arr : null;
      }
      state.exploreYear = null;
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
    // Only show years that have murals
    const yearsWithData = years.filter(y => murals.some(m => m.y === y && m.cat !== 'commercial'));
    yearSubPills.innerHTML = `
      <button class="year-pill year-sub ${!state.exploreYear ? 'active' : ''}" data-year="">All Years</button>
      ${yearsWithData.map(y => `
        <button class="year-pill year-sub ${state.exploreYear === y ? 'active' : ''}" data-year="${y}">
          <span class="year-dot" style="background:${YEAR_COLORS[y] || '#999'}"></span>${y}
        </button>
      `).join('')}
    `;
    yearSubPills.hidden = false;
    yearSubPills.querySelectorAll('.year-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        state.exploreYear = btn.dataset.year ? Number(btn.dataset.year) : null;
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
let tourPickerMap = null; // Third Leaflet instance for tour picker overview
const tourPickerCache = new Map(); // routeId → [[lat,lng],...] cached OSRM coords
let pickerActiveRoute = 0; // index into ROUTE_DEFS for currently shown route
// (routeBarActive removed — horizontal pills don't need focus tracking)
let pickerLayers = [];     // current polyline + label on picker map
const mapMarkers = []; // Array of { dot, imgMarker, mural, visible } for each mural
const routePolylines = []; // Route polylines on the main map

// At this zoom level and above, markers switch from colored dots to thumbnail images
const ICON_ZOOM_THRESHOLD = 17;

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
    routeBar.innerHTML = `<div class="route-bar-title">Nav Loop Overlays</div><div class="route-bar-track" id="route-bar-track">${routeKeyHtml}</div>`;
    document.getElementById('app').appendChild(routeBar);
  }

  leafletMap = L.map('map-container', {
    center: [27.768, -82.646],
    zoom: 13,
    zoomControl: false,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '\u00a9 OpenStreetMap \u00a9 CARTO',
    maxZoom: 19,
    keepBuffer: 6,
  }).addTo(leafletMap);

  // Tap anywhere on map to dismiss nearest popup / out-of-range banner
  document.getElementById('map-container').addEventListener('click', (e) => {
    if (e.target.closest('.nearest-popup') || e.target.closest('.map-range-banner') ||
        e.target.closest('.map-fab-stack') || e.target.closest('.directions-bar') ||
        e.target.closest('.directions-chip') || e.target.closest('.map-mural-sheet')) return;
    dismissNearestPopup();
    closeMapSheet();
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
    dot.on('click', () => openMapSheet(m));

    // Image icon marker (zoomed in)
    const icon = L.divIcon({
      className: 'mural-map-icon',
      html: `<img src="${m.img}" alt="${m.a}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">`,
      iconSize: [48, 48],
      iconAnchor: [24, 24],
    });
    const imgMarker = L.marker([m.lat, m.lng], { icon });
    imgMarker.on('click', () => openMapSheet(m));

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
        if (rd && rd.path && rd.path.length > 1) {
          const bounds = L.latLngBounds(rd.path.map(p => [p[0], p[1]]));
          leafletMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
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
      <span class="map-fab-label">Nearest Loop Stop</span>
      <button class="map-fab" id="fab-nearest-tour" title="Nearest loop stop">
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
      </button>
    </div>
  `;
  container.appendChild(stack);

  document.getElementById('fab-location').addEventListener('click', requestAndShowLocation);
  document.getElementById('fab-nearest').addEventListener('click', fabFindNearestMural);
  document.getElementById('fab-nearest-tour').addEventListener('click', fabFindNearestTourStop);

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
  // Walk Mode FAB removed from UI — sync skipped
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
  userLocationMarker = L.circleMarker([state.userLat, state.userLng], {
    radius: 8, fillColor: '#4285F4', color: '#fff', weight: 3, fillOpacity: 1,
  }).addTo(leafletMap).bindPopup('You are here');
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
  'chna-bike':       '#8E24AA',
};

// Neighborhood walking routes + bike tour
const ROUTE_DEFS = [
  { id: 'downtown-north', name: 'Downtown North', desc: 'Hollander to Fintan Magee — 15 stops through the waterfront & 600 block',
    ids: [6, 116, 23, 30, 1, 129, 66, 109, 110, 7, 9, 111, 115, 73, 24] },
  { id: 'the-edge', name: 'The Edge', desc: 'Matt Kress to Zulu Painter — 13 stops along the Edge District',
    ids: [119, 80, 75, 120, 57, 135, 40, 130, 89, 83, 98, 43, 34] },
  { id: 'methodist-town', name: 'Methodist Town', desc: 'Cecilia Lueza to Fintan Magee — 9 stops along MLK Jr corridor',
    ids: [4, 61, 113, 112, 108, 60, 64, 114, 24] },
  { id: 'tropicana-field', name: 'Tropicana Field', desc: 'Dream Weaver to Illsol — 10 stops around the stadium district',
    ids: [59, 103, 32, 20, 52, 44, 123, 87, 16, 125] },
  { id: 'central-ave', name: 'Central Ave', desc: 'Michael Vasquez to IBOMS — 9 stops along Grand Central',
    ids: [48, 122, 62, 55, 76, 71, 88, 38, 101] },
  { id: 'arts-district', name: 'Arts District', desc: 'Cecilia Lueza to Gleo — 14 stops through the Warehouse Arts District',
    ids: [140, 136, 90, 84, 72, 29, 39, 10, 25, 12, 93, 121, 50, 79] },
  { id: 'chna-bike', name: 'CHNA Bike Tour', desc: '27-stop bike ride through Crescent Heights & Grand Central',
    ids: [17, 6, 23, 30, 1, 109, 110, 7, 9, 73, 80, 98, 83, 59, 103, 44, 39, 19, 88, 38, 76, 55, 101, 62, 4, 113, 64] },
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
    // Don't capture touches on embedded Leaflet maps
    if (e.target.closest('.rotary-expanded-map')) return;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
    dragging = true;
  }, { passive: true });

  zone.addEventListener('touchend', (e) => {
    if (!dragging) return;
    dragging = false;

    const dy = e.changedTouches[0].clientY - touchStartY;
    const dt = Date.now() - touchStartTime;
    const velocity = dy / dt;

    let steps = 0;
    if (Math.abs(dy) > 25) {
      steps = dy < 0 ? 1 : -1;
      if (Math.abs(velocity) > 0.7 && Math.abs(dy) > 50) {
        steps *= 2;
      }
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

/** Render the tour picker: rotary card layout with lazy mini-maps. */
function renderTourPicker() {
  // Destroy any stale picker map / mini-maps
  if (tourPickerMap) {
    try { tourPickerMap.remove(); } catch(e) {}
    tourPickerMap = null;
  }
  destroyPickerMiniMaps();

  // Prefetch route coords for all routes
  ROUTE_DEFS.forEach(def => loadRouteCoords(def));

  const cardsHtml = ROUTE_DEFS.map((def, i) => {
    const ordered = getRouteOrdered(def);
    const color = TOUR_COLORS[def.id] || '#999';
    const rd = ROUTE_PATHS[def.id];
    const dist = rd && rd.distance ? rd.distance + ' mi' : '';
    const isBike = def.id.includes('bike');
    const timeEst = dist ? (isBike ? '~20 min bike' : '~30 min walk') : '';

    return `
      <div class="rotary-card" data-index="${i}">
        <div class="rotary-compact">
          <div class="rotary-compact-accent" style="background:${color}"></div>
          <div class="rotary-compact-body">
            <div>
              <div class="rotary-compact-name">${def.name}</div>
              <div class="rotary-compact-meta">
                <span>${ordered.length} stops</span>
                ${dist ? `<span>${dist}</span>` : ''}
                ${timeEst ? `<span>${timeEst}</span>` : ''}
              </div>
            </div>
            <svg class="rotary-compact-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </div>
        </div>
        <div class="rotary-expanded">
          <div class="rotary-expanded-map">
            <div id="rmap-${i}" style="width:100%;height:100%"></div>
            <div class="rotary-expanded-map-fade"></div>
          </div>
          <div class="rotary-expanded-info">
            <div class="rotary-expanded-accent" style="background:${color}"></div>
            <div class="rotary-expanded-details">
              <div class="rotary-expanded-name">${def.name}</div>
              <div class="rotary-expanded-desc">${def.desc}</div>
              <div class="rotary-expanded-stats">
                <span class="rotary-expanded-stat">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
                  ${ordered.length} stops
                </span>
                ${dist ? `<span class="rotary-expanded-stat">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                  ${dist}
                </span>` : ''}
                ${timeEst ? `<span class="rotary-expanded-stat">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                  ${timeEst}
                </span>` : ''}
              </div>
            </div>
            <div>
              <button class="rotary-go-btn" data-index="${i}">
                Go
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');

  views.loops.innerHTML = `
    <div class="tour-picker-layout">
      <div class="tours-large-title">
        <h1>Loops</h1>
        <p>Flip to Browse, Tap Go</p>
      </div>
      <div class="rotary-zone" id="rotary-zone">
        <div class="rotary-track" id="rotary-track">
          ${cardsHtml}
        </div>
      </div>
    </div>
  `;

  // Click to select card or start tour
  const track = document.getElementById('rotary-track');
  track.addEventListener('click', (e) => {
    // Start button
    const goBtn = e.target.closest('.rotary-go-btn');
    if (goBtn) {
      openTour(ROUTE_DEFS[pickerActiveRoute]);
      return;
    }

    const card = e.target.closest('.rotary-card');
    if (!card) return;
    const idx = Number(card.dataset.index);
    if (idx !== pickerActiveRoute) {
      pickerActiveRoute = idx;
      updateRotaryPositions();
    }
  });

  // Touch flick handling
  const zone = document.getElementById('rotary-zone');
  setupRotaryTouch(zone);

  // Initial layout
  requestAnimationFrame(updateRotaryPositions);
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
    L.circleMarker([state.userLat, state.userLng], {
      radius: 7, fillColor: '#4285F4', color: '#fff', weight: 3, fillOpacity: 1,
    }).addTo(tourPickerMap).bindPopup('You are here');
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

  // Use pre-built route if available (GPX or KML)
  if (ROUTE_PATHS[def.id]) {
    const rd = ROUTE_PATHS[def.id];
    tourPickerCache.set(def.id, rd.path || rd);
    return Promise.resolve();
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

/** Destroy tour mini-map, reset state, show list. */
function closeTour() {
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
          <div class="active-tour-progress">
            <div class="active-tour-progress-track">
              <div class="active-tour-progress-fill" style="width:${pct}%;background:${routeColor}"></div>
            </div>
            <span class="active-tour-progress-label">${curr + 1} of ${len}</span>
          </div>
        </div>
        <button class="active-tour-close" aria-label="End tour">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>

      <!-- Map zone -->
      <div class="active-tour-map-zone">
        <div id="tour-map-container" style="width:100%;height:100%"></div>
        <div class="active-tour-segment-badge" id="tour-segment-info">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          <span id="tour-segment-text">Loading...</span>
        </div>
      </div>

      <!-- Bottom panel -->
      <div class="active-tour-bottom">
        <div class="active-tour-handle"></div>

        <div class="active-tour-carousel">
          <!-- Current mural -->
          <div class="active-tour-current" data-id="${stops[curr].id}">
            <div class="active-tour-img-wrap">
              <img class="active-tour-img" src="${stops[curr].img || ''}" alt="${stops[curr].a}" onerror="this.style.background='#ddd'">
              <span class="active-tour-num" style="background:${routeColor}">${curr + 1}</span>
              <span class="active-tour-now-label">Now</span>
            </div>
            <div class="active-tour-info">
              <div class="active-tour-artist">${stops[curr].a}</div>
              ${stops[curr].t ? `<div class="active-tour-title">"${stops[curr].t}"</div>` : ''}
              <div class="active-tour-address">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                ${stops[curr].bldg || stops[curr].loc || ''}
              </div>
            </div>
          </div>

          <!-- Connector -->
          <div class="active-tour-connector">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </div>

          <!-- Next mural -->
          <div class="active-tour-next" data-id="${stops[next].id}">
            <div class="active-tour-img-wrap">
              <img class="active-tour-img" src="${stops[next].img || ''}" alt="${stops[next].a}" onerror="this.style.background='#ddd'">
              <span class="active-tour-num">${next + 1}</span>
            </div>
            <span class="active-tour-next-label">Next Up</span>
            <div class="active-tour-artist">${stops[next].a}</div>
          </div>
        </div>

        <!-- Action buttons -->
        <div class="active-tour-actions">
          <button class="active-tour-btn active-tour-btn-directions" id="tour-go-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Go To Mural
          </button>
          <button class="active-tour-btn active-tour-btn-details" id="tour-details-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            Mural Details
          </button>
        </div>

        <!-- Step navigation -->
        <div class="active-tour-step-nav">
          <button class="active-tour-step-btn" data-dir="-1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            Prev
          </button>
          <div class="active-tour-dots" id="tour-dots">
            ${buildTourDots(len, curr, routeColor)}
          </div>
          <button class="active-tour-step-btn" data-dir="1">
            Next
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
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

  // Step nav buttons (Prev / Next)
  views.loops.querySelectorAll('.active-tour-step-btn').forEach(btn => {
    btn.addEventListener('click', () => navigateTour(Number(btn.dataset.dir)));
  });

  // Current card tap → detail
  views.loops.querySelector('.active-tour-current')?.addEventListener('click', () => {
    const mural = murals.find(m => m.id === Number(views.loops.querySelector('.active-tour-current').dataset.id));
    if (mural) openDetail(mural);
  });

  // Next card tap → advance
  views.loops.querySelector('.active-tour-next')?.addEventListener('click', () => {
    navigateTour(1);
  });

  // Go To Mural button → directions
  document.getElementById('tour-go-btn')?.addEventListener('click', () => {
    const m = stops[state.tourIndex];
    if (m && m.lat && m.lng) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lng}&travelmode=walking`, '_blank');
    }
  });

  // Mural Details button → open detail page
  document.getElementById('tour-details-btn')?.addEventListener('click', () => {
    const mural = stops[state.tourIndex];
    if (mural) openDetail(mural);
  });

  // Init map
  initTourMap();

  // Zoom to fit entire route on open
  const allCoords = state.tourStops.filter(s => s.lat && s.lng).map(s => [s.lat, s.lng]);
  if (tourMap && allCoords.length >= 2) {
    tourMap.fitBounds(L.latLngBounds(allCoords), { padding: [40, 40], maxZoom: 16 });
  }

  // Swipe support
  setupTourSwipe();
}

/** Update the bottom panel cards, progress, dots, and fetch new route segment. */
function renderTourCards() {
  const stops = state.tourStops;
  const len = stops.length;
  const idx = state.tourIndex;
  const curr = idx;
  const next = wrapIndex(idx + 1, len);
  const routeColor = TOUR_COLORS[state.activeTour?.id] || '#0E918C';
  const pct = Math.round(((curr + 1) / len) * 100);

  // Progress bar + label
  const fill = views.loops.querySelector('.active-tour-progress-fill');
  if (fill) { fill.style.width = pct + '%'; fill.style.background = routeColor; }
  const label = views.loops.querySelector('.active-tour-progress-label');
  if (label) label.textContent = `${curr + 1} of ${len}`;

  // Current card
  const currentCard = views.loops.querySelector('.active-tour-current');
  if (currentCard) {
    currentCard.dataset.id = stops[curr].id;
    const img = currentCard.querySelector('.active-tour-img');
    if (img) { img.src = stops[curr].img || ''; img.alt = stops[curr].a; }
    const num = currentCard.querySelector('.active-tour-num');
    if (num) { num.textContent = curr + 1; num.style.background = routeColor; }
    const artist = currentCard.querySelector('.active-tour-artist');
    if (artist) artist.textContent = stops[curr].a;
    const title = currentCard.querySelector('.active-tour-title');
    if (title) title.textContent = stops[curr].t ? `"${stops[curr].t}"` : '';
    const addr = currentCard.querySelector('.active-tour-address');
    if (addr) {
      const addrText = stops[curr].bldg || stops[curr].loc || '';
      addr.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${addrText}`;
    }
  }

  // Next card
  const nextCard = views.loops.querySelector('.active-tour-next');
  if (nextCard) {
    nextCard.dataset.id = stops[next].id;
    const img = nextCard.querySelector('.active-tour-img');
    if (img) { img.src = stops[next].img || ''; img.alt = stops[next].a; }
    const num = nextCard.querySelector('.active-tour-num');
    if (num) num.textContent = next + 1;
    const artist = nextCard.querySelector('.active-tour-artist');
    if (artist) artist.textContent = stops[next].a;
  }

  // Dots
  const dotsEl = document.getElementById('tour-dots');
  if (dotsEl) dotsEl.innerHTML = buildTourDots(len, curr, routeColor);

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

  // Show user location on tour map
  if (state.userLat && state.userLng) {
    L.circleMarker([state.userLat, state.userLng], {
      radius: 7, fillColor: '#4285F4', color: '#fff', weight: 3, fillOpacity: 1,
    }).addTo(tourMap).bindPopup('You are here');
  }

  state.tourMapReady = true;
  fetchTourSegment();
}

/** Fetch OSRM route between last visited stop and first upcoming stop, draw on tour map. */
function fetchTourSegment() {
  if (!tourMap || !state.tourMapReady) return;
  if (state.tourFetching) return;

  const stops = state.tourStops;
  const len = stops.length;
  const idx = state.tourIndex;

  const fromStop = stops[idx];
  const toStop = stops[wrapIndex(idx + 1, len)];

  // Clear previous route and markers
  if (state.tourRoute) { state.tourRoute.removeFrom(tourMap); state.tourRoute = null; }
  state.tourMarkers.forEach(m => m.removeFrom(tourMap));
  state.tourMarkers = [];

  // Thumbnail + number markers for from/to
  const fromNum = idx + 1;
  const toNum = wrapIndex(idx + 1, len) + 1;
  const fromMarker = L.marker([fromStop.lat, fromStop.lng], {
    icon: L.divIcon({
      className: 'tour-map-pin',
      html: `<div class="tour-pin from"><img src="${fromStop.img || ''}" alt="${fromStop.a}"><span class="tour-pin-num">${fromNum}</span></div>`,
      iconSize: [40, 40], iconAnchor: [20, 20],
    })
  }).addTo(tourMap);
  const toMarker = L.marker([toStop.lat, toStop.lng], {
    icon: L.divIcon({
      className: 'tour-map-pin',
      html: `<div class="tour-pin to"><img src="${toStop.img || ''}" alt="${toStop.a}"><span class="tour-pin-num">${toNum}</span></div>`,
      iconSize: [48, 48], iconAnchor: [24, 24],
    })
  }).addTo(tourMap);
  state.tourMarkers = [fromMarker, toMarker];

  // Fit bounds to just the two stops
  const bounds = L.latLngBounds([[fromStop.lat, fromStop.lng], [toStop.lat, toStop.lng]]);
  tourMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 19 });

  const segInfo = document.getElementById('tour-segment-text') || document.getElementById('tour-segment-info');

  // Try static route path first (GPX or KML)
  const routeId = state.activeTour?.id;
  const rd = routeId && ROUTE_PATHS[routeId];
  const fullPath = rd && (rd.path || rd);

  const isBike = routeId && routeId.includes('bike');
  const speed = isBike ? 200 : 80; // meters per minute
  const mode = isBike ? 'bike' : 'walk';

  if (fullPath) {
    const segment = extractPathSegment(fullPath, fromStop, toStop);
    if (segment && segment.length >= 2) {
      let distMeters = 0;
      for (let i = 1; i < segment.length; i++) {
        distMeters += haversine(segment[i-1][0], segment[i-1][1], segment[i][0], segment[i][1]);
      }
      const mins = Math.max(1, Math.round(distMeters / speed));

      state.tourRoute = L.polyline(segment, {
        color: '#1E5B8A', weight: 5, opacity: 0.85,
      }).addTo(tourMap);

      if (segInfo) segInfo.textContent = `${formatDistance(distMeters)} · ~${mins} min ${mode}`;
      return;
    }
  }

  // Fallback: fetch from OSRM
  state.tourFetching = true;
  const url = `https://router.project-osrm.org/route/v1/driving/${fromStop.lng},${fromStop.lat};${toStop.lng},${toStop.lat}?overview=full&geometries=geojson`;

  fetch(url)
    .then(r => r.json())
    .then(data => {
      state.tourFetching = false;
      if (!tourMap) return;
      if (data.code !== 'Ok' || !data.routes || !data.routes[0]) throw new Error('No route');

      const route = data.routes[0];
      const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
      const distMeters = route.distance;
      const mins = Math.max(1, Math.round(distMeters / speed));

      state.tourRoute = L.polyline(coords, {
        color: '#1E5B8A', weight: 5, opacity: 0.85,
      }).addTo(tourMap);

      if (segInfo) segInfo.textContent = `${formatDistance(distMeters)} · ~${mins} min ${mode}`;
    })
    .catch(() => {
      state.tourFetching = false;
      if (!tourMap) return;
      const distMeters = haversine(fromStop.lat, fromStop.lng, toStop.lat, toStop.lng);
      const mins = Math.max(1, Math.round(distMeters / speed));
      state.tourRoute = L.polyline(
        [[fromStop.lat, fromStop.lng], [toStop.lat, toStop.lng]],
        { color: '#1E5B8A', weight: 3, opacity: 0.5, dashArray: '8, 8' }
      ).addTo(tourMap);
      if (segInfo) segInfo.textContent = `${formatDistance(distMeters)} · ~${mins} min ${mode}`;
    });
}

/** Extract the segment of a full path between two stops (nearest-point matching). */
function extractPathSegment(fullPath, fromStop, toStop) {
  let fromIdx = 0, toIdx = 0;
  let fromDist = Infinity, toDist = Infinity;

  for (let i = 0; i < fullPath.length; i++) {
    const dFrom = (fullPath[i][0] - fromStop.lat) ** 2 + (fullPath[i][1] - fromStop.lng) ** 2;
    const dTo = (fullPath[i][0] - toStop.lat) ** 2 + (fullPath[i][1] - toStop.lng) ** 2;
    if (dFrom < fromDist) { fromDist = dFrom; fromIdx = i; }
    if (dTo < toDist) { toDist = dTo; toIdx = i; }
  }

  if (fromIdx <= toIdx) {
    return fullPath.slice(fromIdx, toIdx + 1);
  }
  // Reverse segment (going backward on path) — still valid for display
  return fullPath.slice(toIdx, fromIdx + 1).reverse();
}

/** Navigate tour: +1 (next) or -1 (prev). Wraps continuously. */
function navigateTour(dir) {
  const len = state.tourStops.length;
  if (len === 0) return;
  state.tourIndex = wrapIndex(state.tourIndex + dir, len);
  renderTourCards();
}

/** Set up vertical swipe on the tour view. */
function setupTourSwipe() {
  const el = views.loops;
  let startY = 0;
  let startX = 0;
  let swiping = false;

  const onTouchStart = (e) => {
    // Don't capture swipes on the map
    if (e.target.closest('#tour-map-container')) return;
    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
    swiping = true;
  };

  const onTouchEnd = (e) => {
    if (!swiping) return;
    swiping = false;
    const dy = e.changedTouches[0].clientY - startY;
    const dx = e.changedTouches[0].clientX - startX;
    // Only trigger if vertical swipe is dominant and > 40px
    if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx) * 1.5) {
      if (dy < 0) navigateTour(1);  // swipe up → next
      else navigateTour(-1);         // swipe down → prev
    }
  };

  el.addEventListener('touchstart', onTouchStart, { passive: true });
  el.addEventListener('touchend', onTouchEnd, { passive: true });
}

// =============================================
// Detail page
// =============================================

/**
 * Build reusable detail body HTML for a mural.
 * Used by both openDetail() and the map bottom sheet.
 */
function buildDetailBodyHTML(mural) {
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
    <div class="detail-body">
      <div class="detail-artist">${mural.a}</div>
      ${mural.t ? `<div class="detail-title">${mural.t}</div>` : ''}
      <span class="detail-year-badge">${mural.cat === 'commercial' ? 'Commercial' : mural.cat === 'shine-legacy' ? 'Pre-SHINE' : 'SHINE'} ${mural.y || ''}</span>
      ${mural.from ? `<div class="detail-from">${mural.from}</div>` : ''}
      ${mural.ig ? `<div class="detail-ig"><a href="https://instagram.com/${mural.ig}" target="_blank" rel="noopener">@${mural.ig}</a></div>` : ''}

      <div class="detail-address">
        <span>📍</span>
        <span>${mural.bldg ? mural.bldg + ' — ' : ''}${mural.loc || 'St. Petersburg, FL'}</span>
      </div>

      <button id="like-btn" class="like-btn ${hasLiked(mural.id) ? 'liked' : ''}" onclick="toggleLike(${mural.id})">
        <svg class="like-heart" width="20" height="20" viewBox="0 0 24 24" fill="${hasLiked(mural.id) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        <span class="like-count">${likeCounts[mural.id] || ''}</span>
      </button>

      ${mural.bio ? `
        <div class="detail-bio">
          <div class="detail-bio-label">About the Artist</div>
          ${mural.bio}
        </div>
      ` : ''}

      ${''}<!-- desc kept in data for search -->

      ${mural.imp && mural.imp.length > 0 ? `
        <div class="detail-impressions">
          <div class="detail-bio-label">What People Say</div>
          ${mural.imp.slice(0, 3).map(q => `
            <div class="detail-impression">"${q}"</div>
          `).join('')}
        </div>
      ` : ''}

      ${mural.lat && mural.lng ? `
        <div class="detail-directions-group">
          <button class="detail-directions" onclick="startDirections(${mural.id})">
            🚶 Get Directions
          </button>
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

// =============================================
// Map mural bottom sheet
// =============================================

/** Open a bottom sheet on the map for a mural marker tap. */
function openMapSheet(mural) {
  dismissNearestPopup();
  closeMapSheet();

  const el = document.createElement('div');
  el.className = 'map-mural-sheet compact';
  el.id = 'map-mural-sheet';
  el.innerHTML = `
    <div class="map-sheet-handle"></div>
    <div class="map-sheet-compact" data-id="${mural.id}">
      <img src="${mural.img || ''}" alt="${mural.a}">
      <div class="map-sheet-compact-info">
        <h4>${mural.a}</h4>
        <p>${mural.t || mural.loc || ''}</p>
      </div>
      <button class="map-sheet-close" aria-label="Close">&times;</button>
    </div>
    <div class="map-sheet-expanded">
      ${buildDetailBodyHTML(mural)}
    </div>
  `;

  document.getElementById('map-container').appendChild(el);

  // Close button
  el.querySelector('.map-sheet-close').addEventListener('click', (e) => {
    e.stopPropagation();
    closeMapSheet();
  });

  // Tap compact card → expand
  el.querySelector('.map-sheet-compact').addEventListener('click', () => {
    if (el.classList.contains('compact')) {
      el.classList.remove('compact');
      el.classList.add('expanded');
    }
  });

  // Wire nearby card clicks in expanded view
  el.querySelectorAll('.detail-nearby-card').forEach(card => {
    card.addEventListener('click', () => {
      const m = murals.find(m => m.id === Number(card.dataset.id));
      if (m) openMapSheet(m);
    });
  });

  setupSheetDrag(el);
}

/** Close the map mural bottom sheet. */
function closeMapSheet() {
  const existing = document.getElementById('map-mural-sheet');
  if (existing) existing.remove();
}

/** Set up touch drag gestures on the map sheet. */
function setupSheetDrag(sheetEl) {
  let startY = 0;
  let isDragging = false;

  const handle = sheetEl.querySelector('.map-sheet-handle');
  const dragTarget = handle || sheetEl;

  dragTarget.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
    isDragging = true;
  }, { passive: true });

  dragTarget.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    // Prevent map panning while dragging sheet
    e.stopPropagation();
  }, { passive: false });

  dragTarget.addEventListener('touchend', (e) => {
    if (!isDragging) return;
    isDragging = false;
    const deltaY = e.changedTouches[0].clientY - startY;

    if (deltaY < -40) {
      // Swipe up → expand
      sheetEl.classList.remove('compact');
      sheetEl.classList.add('expanded');
    } else if (deltaY > 40) {
      // Swipe down
      if (sheetEl.classList.contains('expanded')) {
        // Collapse back to compact
        sheetEl.classList.remove('expanded');
        sheetEl.classList.add('compact');
      } else {
        // Dismiss
        closeMapSheet();
      }
    }
  }, { passive: true });
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

  detailPage.scrollTop = 0;

  // Floating hint — tap image to go back
  const oldHint = document.querySelector('.detail-back-hint');
  if (oldHint) oldHint.remove();
  const hint = document.createElement('div');
  hint.className = 'detail-back-hint';
  hint.textContent = 'Tap image to go back';
  detailPage.appendChild(hint);
  setTimeout(() => hint.remove(), 2600);
}

// Back button
$('#detail-back').addEventListener('click', () => {
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

  // Save state so we can return here
  sessionStorage.setItem('mq_return_mural', muralId);

  // On insecure origins (HTTP), geolocation is blocked — go straight to Google Maps
  if (!window.isSecureContext) {
    openExternalMaps(mural);
    return;
  }

  // We have location already — go straight to in-app route
  if (state.userLat && state.userLng) {
    state.directionsMural = mural;
    state.directionsProfile = 'foot';
    detailPage.hidden = true;
    state.selectedMural = null;
    switchTab('map');
    fetchAndDrawRoute();
    return;
  }

  // Secure context but no location yet — request it
  if ('geolocation' in navigator) {
    state.directionsMural = mural;
    state.directionsProfile = 'foot';
    detailPage.hidden = true;
    state.selectedMural = null;
    switchTab('map');
    navigator.geolocation.getCurrentPosition(
      pos => {
        state.userLat = pos.coords.latitude;
        state.userLng = pos.coords.longitude;
        showUserOnMap();
        fetchAndDrawRoute();
      },
      () => {
        // User denied location — open Google Maps in new tab
        state.directionsMural = null;
        openExternalMaps(mural);
      },
      { enableHighAccuracy: true }
    );
  } else {
    openExternalMaps(mural);
  }
}

function openInMapsApp(muralId) {
  const mural = murals.find(m => m.id === muralId);
  if (mural) openExternalMaps(mural);
}
// Expose to onclick handler
window.startDirections = startDirections;
window.openInMapsApp = openInMapsApp;
window.toggleLike = toggleLike;

/**
 * Fetch route from OSRM and draw it on the map.
 * Falls back to a straight line if OSRM fails.
 */
function fetchAndDrawRoute() {
  const mural = state.directionsMural;
  if (!mural) return;

  // Save profile before clearDirections resets it
  const profile = state.directionsProfile === 'car' ? 'car' : 'foot';

  clearDirections();
  state.directionsMural = mural;
  state.directionsProfile = profile;
  // OSRM public server only has the 'driving' profile — use it for route
  // geometry (streets are the same), then compute walk/drive time from distance
  const url = `https://router.project-osrm.org/route/v1/driving/${state.userLng},${state.userLat};${mural.lng},${mural.lat}?overview=full&geometries=geojson`;

  // Add destination marker
  state.directionsMarker = L.marker([mural.lat, mural.lng], {
    icon: L.divIcon({
      className: 'directions-dest-icon',
      html: `<div style="width:32px;height:32px;background:var(--accent,#1E5B8A);border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;">📍</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    })
  }).addTo(leafletMap);

  fetch(url)
    .then(r => r.json())
    .then(data => {
      if (data.code !== 'Ok' || !data.routes || !data.routes[0]) throw new Error('No route');

      const route = data.routes[0];
      const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
      const distMeters = route.distance;
      // Compute time from distance: walking ~80m/min, driving uses OSRM estimate
      const durationSecs = profile === 'foot'
        ? (distMeters / 80) * 60
        : route.duration;

      state.directionsRoute = L.polyline(coords, {
        color: '#1E5B8A',
        weight: 5,
        opacity: 0.8,
      }).addTo(leafletMap);

      leafletMap.fitBounds(state.directionsRoute.getBounds(), { padding: [60, 60] });
      showDirectionsBar(distMeters, durationSecs, profile);
    })
    .catch(() => {
      // Fallback: straight line
      const coords = [
        [state.userLat, state.userLng],
        [mural.lat, mural.lng],
      ];
      const distMeters = haversine(state.userLat, state.userLng, mural.lat, mural.lng);

      state.directionsRoute = L.polyline(coords, {
        color: '#1E5B8A',
        weight: 4,
        opacity: 0.6,
        dashArray: '8, 8',
      }).addTo(leafletMap);

      leafletMap.fitBounds(state.directionsRoute.getBounds(), { padding: [60, 60] });

      // Estimate walk time: ~80m/min
      const durationSecs = (distMeters / 80) * 60;
      showDirectionsBar(distMeters, durationSecs, profile, true);
    });
}

/**
 * Show directions info bar at bottom of map.
 * @param {number} distMeters - Route distance in meters
 * @param {number} durationSecs - Estimated travel time in seconds
 * @param {string} profile - 'foot' or 'car'
 * @param {boolean} straightLine - True if using fallback straight-line estimate
 */
function showDirectionsBar(distMeters, durationSecs, profile, straightLine) {
  // Remove any existing bar
  const existing = document.querySelector('.directions-bar');
  if (existing) existing.remove();

  const distText = formatDistance(distMeters);
  const mins = Math.max(1, Math.round(durationSecs / 60));
  const lineNote = straightLine ? ' (est.)' : '';

  const mural = state.directionsMural;

  const bar = document.createElement('div');
  bar.className = 'directions-bar';
  bar.innerHTML = `
    <div class="directions-info">
      <span class="directions-distance">${distText}${lineNote}</span>
      <span class="directions-time">~${mins} min walk to ${mural.a}</span>
    </div>
    <button class="directions-close" aria-label="Close directions">✕</button>
  `;

  document.getElementById('map-container').appendChild(bar);

  // Prevent Leaflet from eating clicks/touches on the bar
  L.DomEvent.disableClickPropagation(bar);
  L.DomEvent.disableScrollPropagation(bar);

  // Close button → collapse to mini chip (route stays on map)
  bar.querySelector('.directions-close').addEventListener('click', () => {
    bar.remove();
    showDirectionsChip(distMeters, durationSecs, profile);
  });
}

/** Persistent mini chip — shows mural name + distance, route stays visible on map. */
function showDirectionsChip(distMeters, durationSecs, profile) {
  // Remove any existing chip
  const existing = document.querySelector('.directions-chip');
  if (existing) existing.remove();

  const mural = state.directionsMural;
  if (!mural) return;

  const distText = formatDistance(distMeters);
  const mins = Math.max(1, Math.round(durationSecs / 60));

  const chip = document.createElement('div');
  chip.className = 'directions-chip';
  chip.innerHTML = `
    <span class="directions-chip-text">${mural.a} · ${distText} · ~${mins} min</span>
    <button class="directions-chip-close" aria-label="Cancel route">✕</button>
  `;

  document.getElementById('map-container').appendChild(chip);
  L.DomEvent.disableClickPropagation(chip);

  // Tap chip text → re-expand full directions bar
  chip.querySelector('.directions-chip-text').addEventListener('click', () => {
    chip.remove();
    showDirectionsBar(distMeters, durationSecs, profile);
  });

  // X on chip → fully clear directions + route
  chip.querySelector('.directions-chip-close').addEventListener('click', () => {
    chip.remove();
    clearDirections();
  });
}

/** Remove route polyline, destination marker, and directions bar/chip from the map. */
function clearDirections() {
  if (state.directionsRoute) {
    state.directionsRoute.removeFrom(leafletMap);
    state.directionsRoute = null;
  }
  if (state.directionsMarker) {
    state.directionsMarker.removeFrom(leafletMap);
    state.directionsMarker = null;
  }
  state.directionsMural = null;
  state.directionsProfile = 'foot';
  const bar = document.querySelector('.directions-bar');
  if (bar) bar.remove();
  const chip = document.querySelector('.directions-chip');
  if (chip) chip.remove();
}

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
