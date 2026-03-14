/**
 * SHINE St. Pete — Main Application
 *
 * Single-file vanilla JS app. No framework, no build step.
 *
 * Architecture:
 *   - All UI state lives in the `state` object (line ~20)
 *   - State changes trigger explicit render calls (no reactivity)
 *   - All HTML is rendered via template literals into container divs
 *   - Three tabs: Explore (card grid), Map (Leaflet), Tours (loop tours)
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
const ACCESS_DURATION = 60 * 24 * 60 * 60 * 1000; // 60 days in ms

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
function setEmailCookie(email) {
  const d = new Date(Date.now() + ACCESS_DURATION);
  document.cookie = `mq_email=${encodeURIComponent(email)};expires=${d.toUTCString()};path=/;SameSite=Lax`;
}

function getEmailCookie() {
  const match = document.cookie.match(/mq_email=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function hasAccess() {
  try {
    const data = JSON.parse(localStorage.getItem(ACCESS_KEY));
    if (data && Date.now() < data.expires) return true;
  } catch {}
  // Check cookie as fallback
  return !!getCookieAccess();
}

function grantAccess() {
  const data = { expires: Date.now() + ACCESS_DURATION };
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
  if (isStandalone) return;
  // Snooze for 3 days after dismiss
  const dismissed = localStorage.getItem('mq_install_dismissed');
  if (dismissed && Date.now() - Number(dismissed) < 3 * 24 * 60 * 60 * 1000) return;
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
  localStorage.setItem('mq_install_dismissed', Date.now());
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
} else if (hasAccess() || location.hostname === 'localhost') {
  hideGate();
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

// Promo code redemption (client-side)
const VALID_PROMOS = ['MURAL'];

document.getElementById('gate-promo-submit')?.addEventListener('click', () => {
  const code = (document.getElementById('gate-promo-code').value || '').trim().toUpperCase();
  const email = (document.getElementById('gate-promo-email').value || '').trim();
  const msg = document.getElementById('gate-promo-msg');

  msg.hidden = false;

  if (!code || !email) {
    msg.textContent = 'Enter a promo code and your email.';
    msg.className = 'gate-promo-msg error';
    return;
  }

  if (VALID_PROMOS.includes(code)) {
    grantAccess();
    setEmailCookie(email);
    msg.textContent = 'Welcome in!';
    msg.className = 'gate-promo-msg success';
    setTimeout(() => { hideGate(); showInstallPrompt(); }, 500);
  } else {
    msg.textContent = 'Invalid promo code.';
    msg.className = 'gate-promo-msg error';
  }
});

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
  exploreFilter: null,  // null=all, 'shine', 'vintage', 'commercial'
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
};

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
  tours: $('#view-tours'),
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

  if (tab !== 'map') clearDirections();
  if (tab !== 'tours' && state.activeTour) closeTour();
  if (tab === 'explore') { renderFilterPills(); renderExplore(); }
  if (tab === 'map') initMap();
  if (tab === 'tours') renderTourList();
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
// Explore filtering
// =============================================
/**
 * Apply the current filter/search state to the full mural list.
 * Chain: category filter → year sub-filter → text search.
 * Returns a new filtered array (does not mutate `murals`).
 */
function getFilteredMurals() {
  let list = murals;

  // Category filter
  if (state.exploreFilter === 'shine') {
    list = list.filter(m => m.cat !== 'commercial' && SHINE_YEARS.includes(m.y));
  } else if (state.exploreFilter === 'vintage') {
    list = list.filter(m => m.cat !== 'commercial' && (VINTAGE_YEARS.includes(m.y) || m.y === 0));
  } else if (state.exploreFilter === 'commercial') {
    list = list.filter(m => m.cat === 'commercial');
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
  const f = state.exploreFilter;
  filterPills.innerHTML = `
    <button class="year-pill ${!f ? 'active' : ''}" data-filter="">All</button>
    <button class="year-pill ${f === 'shine' ? 'active' : ''}" data-filter="shine">Shine</button>
    <button class="year-pill ${f === 'vintage' ? 'active' : ''}" data-filter="vintage">Vintage Shine</button>
    <button class="year-pill ${f === 'commercial' ? 'active' : ''}" data-filter="commercial">Commercial</button>
  `;
  filterPills.querySelectorAll('.year-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      state.exploreFilter = btn.dataset.filter || null;
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
  if (f === 'shine') {
    const years = SHINE_YEARS;
    // Only show years that have murals
    const yearsWithData = years.filter(y => murals.some(m => m.y === y && (f === 'shine' ? m.cat !== 'commercial' : true)));
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
let pickerLayers = [];     // current polyline + label on picker map
const mapMarkers = []; // Array of { dot, imgMarker, mural, visible } for each mural
const routePolylines = []; // Route polylines on the main map

// At this zoom level and above, markers switch from colored dots to thumbnail images
const ICON_ZOOM_THRESHOLD = 15;

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
    return `<span class="route-key-item"><span class="route-key-line" style="background:${color}"></span>${def.name}</span>`;
  }).join('');

  views.map.innerHTML = `
    <div class="map-filter-bar">
      <div class="filter-pills" id="map-cat-pills"></div>
      <div class="filter-pills" id="map-year-pills" hidden></div>
      <div class="route-key" id="map-route-key">${routeKeyHtml}</div>
    </div>
    <div id="map-container"></div>
  `;

  leafletMap = L.map('map-container', {
    center: [27.7706, -82.6341],
    zoom: 14,
    zoomControl: false,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '\u00a9 OpenStreetMap \u00a9 CARTO',
    maxZoom: 19,
    keepBuffer: 6,
  }).addTo(leafletMap);

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

  // Swap between dots and icons on zoom, and toggle route polylines
  leafletMap.on('zoomend', () => { swapMarkerStyle(); updateRoutePolylineVisibility(); });

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

  // User location — only show if within 50 miles of St. Pete
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(pos => {
      const dist = haversine(pos.coords.latitude, pos.coords.longitude, 27.7706, -82.6341);
      if (dist > 80467) return; // 50 miles — too far, skip location dot
      state.userLat = pos.coords.latitude;
      state.userLng = pos.coords.longitude;
      L.circleMarker([state.userLat, state.userLng], {
        radius: 8, fillColor: '#4285F4', color: '#fff', weight: 3, fillOpacity: 1,
      }).addTo(leafletMap).bindPopup('You are here');
    }, () => {}, { enableHighAccuracy: true });
  }

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

const ROUTE_POLYLINE_ZOOM = 14; // show route lines at this zoom and above

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
      // Start hidden — updateRoutePolylineVisibility will show if zoomed in
      routePolylines.push(line);
      updateRoutePolylineVisibility();
    });
  });
}

/** Show/hide route polylines based on zoom level. */
function updateRoutePolylineVisibility() {
  const show = leafletMap.getZoom() >= ROUTE_POLYLINE_ZOOM;
  routePolylines.forEach(line => {
    if (show && !leafletMap.hasLayer(line)) line.addTo(leafletMap);
    if (!show && leafletMap.hasLayer(line)) line.removeFrom(leafletMap);
  });
}

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
        <button class="year-pill year-sub ${selected && selected.length === 1 && selected[0] === y ? 'active' : ''}" data-year="${y}">
          <span class="year-dot" style="background:${YEAR_COLORS[y] || '#999'}"></span>${y}
        </button>
      `).join('')}
    `;
    yearPillsEl.hidden = false;
    yearPillsEl.querySelectorAll('.year-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const y = btn.dataset.year;
        state.activeMapYears = y ? [Number(y)] : null;
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
  'methodist-town':  '#1E88E5',
  'tropicana-field': '#43A047',
  'central-ave':     '#FB8C00',
  'arts-district':   '#F06292',
  'chna-bike':       '#8E24AA',
};

// Neighborhood walking routes + bike tour
const ROUTE_DEFS = [
  { id: 'downtown-north', name: 'Downtown North', desc: 'Hollander to Fintan Magee — 16 stops through the waterfront & 600 block',
    ids: [6, 107, 116, 23, 30, 1, 129, 66, 109, 110, 7, 9, 111, 73, 11, 24] },
  { id: 'methodist-town', name: 'Methodist Town', desc: 'Matt Kress to Derek Donnelly — 14 stops through the MLK & 1st Ave N corridor',
    ids: [119, 80, 75, 120, 89, 83, 98, 34, 4, 112, 108, 113, 60, 115] },
  { id: 'tropicana-field', name: 'Tropicana Field', desc: 'Dream Weaver to Illsol — 10 stops around the stadium district',
    ids: [59, 103, 32, 20, 52, 44, 123, 87, 16, 125] },
  { id: 'central-ave', name: 'Central Ave', desc: 'Michael Vasquez to IBOMS — 9 stops along Grand Central',
    ids: [48, 122, 62, 55, 76, 71, 88, 38, 101] },
  { id: 'arts-district', name: 'Arts District', desc: 'Gleo to Ernesto Maranje — 20 stops through the Warehouse Arts District & Pinellas Trail',
    ids: [79, 50, 121, 93, 29, 12, 25, 39, 46, 37, 2, 3, 8, 10, 13, 15, 19, 41, 126, 127] },
  { id: 'chna-bike', name: 'CHNA Bike Tour', desc: '27-stop bike ride through Crescent Heights & Grand Central',
    ids: [17, 6, 23, 30, 1, 109, 110, 7, 9, 73, 80, 98, 83, 59, 103, 44, 39, 19, 88, 38, 76, 55, 101, 62, 4, 113, 64] },
];

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

/** Render the tour picker: full map with one route at a time + selector bar. */
function renderTourPicker() {
  // If picker map container still exists, just resize
  if (tourPickerMap && document.getElementById('tour-picker-map')) {
    setTimeout(() => tourPickerMap.invalidateSize(), 0);
    return;
  }

  // Destroy stale picker map if container was removed
  if (tourPickerMap) {
    tourPickerMap.remove();
    tourPickerMap = null;
  }

  views.tours.innerHTML = `
    <div class="tour-picker-layout">
      <div id="tour-picker-map"></div>
      <div class="tour-picker-selector" id="tour-picker-selector">
        ${ROUTE_DEFS.map((def, i) => {
          const ordered = getRouteOrdered(def);
          const color = TOUR_COLORS[def.id] || '#999';
          const active = i === pickerActiveRoute ? ' active' : '';
          return `
            <button class="tour-selector-btn${active}" data-index="${i}" style="--tour-color:${color}">
              <span class="tour-selector-dot" style="background:${color}"></span>
              <div class="tour-selector-text">
                <span class="tour-selector-name">${def.name}</span>
                <span class="tour-selector-stats">${ordered.length} stops</span>
              </div>
            </button>`;
        }).join('')}
      </div>
      <button class="tour-start-btn" id="tour-start-btn">Start Tour</button>
    </div>
  `;

  // Selector button clicks — switch displayed route
  views.tours.querySelectorAll('.tour-selector-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.index);
      if (idx === pickerActiveRoute) return;
      pickerActiveRoute = idx;
      // Update active class
      views.tours.querySelectorAll('.tour-selector-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Scroll active button into view
      btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      fetchAndShowRoute(pickerActiveRoute);
    });
  });

  // Start tour button
  document.getElementById('tour-start-btn').addEventListener('click', () => {
    openTour(ROUTE_DEFS[pickerActiveRoute]);
  });

  initTourPickerMap();
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

  // Use pre-built KML route if available
  if (ROUTE_PATHS[def.id]) {
    tourPickerCache.set(def.id, ROUTE_PATHS[def.id]);
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
function openTour(def) {
  // Destroy picker map before its container gets replaced
  if (tourPickerMap) {
    tourPickerMap.remove();
    tourPickerMap = null;
  }

  const stops = getRouteOrdered(def);
  if (stops.length === 0) return;

  state.activeTour = def;
  state.tourStops = stops;
  state.tourIndex = findNearestTourStop(stops);
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
  state.activeTour = null;
  state.tourStops = [];
  state.tourIndex = 0;
  state.tourMapReady = false;
  state.tourRoute = null;
  state.tourMarkers = [];
  state.tourFetching = false;
}

/** Render the full tour loop view: header, cards, map, nav. */
function renderTourLoop() {
  const stops = state.tourStops;
  const len = stops.length;
  const idx = state.tourIndex;

  // 4 cards: idx-2 faded, idx-1 active (previous), idx active (next), idx+1 faded
  const f0 = wrapIndex(idx - 2, len);
  const prev = wrapIndex(idx - 1, len);
  const next = wrapIndex(idx, len);
  const f1 = wrapIndex(idx + 1, len);

  views.tours.innerHTML = `
    <div class="tour-layout">
      <div class="tour-header">
        <button class="tour-back" aria-label="Back to tour list">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </button>
        <div class="tour-header-title">${state.activeTour.name}</div>
        <div class="tour-header-counter">${next + 1} of ${len}</div>
      </div>
      <div class="tour-body">
        <div class="tour-cards-above" id="tour-cards-above">
          ${buildTourCard(stops[f0], f0 + 1, 'faded')}
          ${buildTourCard(stops[prev], prev + 1, 'active')}
        </div>
        <div id="tour-map-container"></div>
        <div class="tour-segment-info" id="tour-segment-info"></div>
        <div class="tour-cards-below" id="tour-cards-below">
          ${buildTourCard(stops[next], next + 1, 'active')}
          ${buildTourCard(stops[f1], f1 + 1, 'faded')}
        </div>
      </div>
      <div class="tour-nav">
        <button class="tour-nav-btn" data-dir="-1" aria-label="Previous stop">
          <span class="tour-nav-label">Last Mural</span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m18 15-6-6-6 6"/>
          </svg>
        </button>
        <button class="tour-nav-btn" data-dir="1" aria-label="Next stop">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m6 9 6 6 6-6"/>
          </svg>
          <span class="tour-nav-label">Next Mural</span>
        </button>
      </div>
    </div>
  `;

  // Back button
  views.tours.querySelector('.tour-back').addEventListener('click', () => {
    closeTour();
    renderTourList();
  });

  // Nav buttons
  views.tours.querySelectorAll('.tour-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigateTour(Number(btn.dataset.dir)));
  });

  // Card tap → detail
  views.tours.querySelectorAll('.tour-stop-card').forEach(card => {
    card.addEventListener('click', () => {
      const mural = murals.find(m => m.id === Number(card.dataset.id));
      if (mural) openDetail(mural);
    });
  });

  // Init map
  initTourMap();

  // Swipe support
  setupTourSwipe();
}

/** Update just the 4 cards, counter, segment info, and fetch new route segment. */
function renderTourCards() {
  const stops = state.tourStops;
  const len = stops.length;
  const idx = state.tourIndex;

  const f0 = wrapIndex(idx - 2, len);
  const prev = wrapIndex(idx - 1, len);
  const next = wrapIndex(idx, len);
  const f1 = wrapIndex(idx + 1, len);

  const aboveEl = document.getElementById('tour-cards-above');
  const belowEl = document.getElementById('tour-cards-below');
  const counterEl = views.tours.querySelector('.tour-header-counter');

  if (aboveEl) aboveEl.innerHTML = buildTourCard(stops[f0], f0 + 1, 'faded') + buildTourCard(stops[prev], prev + 1, 'active');
  if (belowEl) belowEl.innerHTML = buildTourCard(stops[next], next + 1, 'active') + buildTourCard(stops[f1], f1 + 1, 'faded');
  if (counterEl) counterEl.textContent = `${next + 1} of ${len}`;

  // Re-attach card tap listeners
  views.tours.querySelectorAll('.tour-stop-card').forEach(card => {
    card.addEventListener('click', () => {
      const mural = murals.find(m => m.id === Number(card.dataset.id));
      if (mural) openDetail(mural);
    });
  });

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

  const fromStop = stops[wrapIndex(idx - 1, len)];
  const toStop = stops[wrapIndex(idx, len)];

  // Clear previous route and markers
  if (state.tourRoute) { state.tourRoute.removeFrom(tourMap); state.tourRoute = null; }
  state.tourMarkers.forEach(m => m.removeFrom(tourMap));
  state.tourMarkers = [];

  // Thumbnail + number markers for from/to
  const fromNum = wrapIndex(idx - 1, len) + 1;
  const toNum = wrapIndex(idx, len) + 1;
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

  // Fit bounds with room for user dot
  const boundsPoints = [[fromStop.lat, fromStop.lng], [toStop.lat, toStop.lng]];
  if (state.userLat && state.userLng) boundsPoints.push([state.userLat, state.userLng]);
  const bounds = L.latLngBounds(boundsPoints);
  tourMap.fitBounds(bounds, { padding: [45, 45], maxZoom: 16 });

  const segInfo = document.getElementById('tour-segment-info');

  // Try static KML path first
  const routeId = state.activeTour?.id;
  const fullPath = routeId && ROUTE_PATHS[routeId];

  if (fullPath) {
    const segment = extractPathSegment(fullPath, fromStop, toStop);
    if (segment && segment.length >= 2) {
      // Calculate distance along segment
      let distMeters = 0;
      for (let i = 1; i < segment.length; i++) {
        distMeters += haversine(segment[i-1][0], segment[i-1][1], segment[i][0], segment[i][1]);
      }
      const walkMins = Math.max(1, Math.round(distMeters / 80));

      state.tourRoute = L.polyline(segment, {
        color: '#1E5B8A', weight: 5, opacity: 0.85,
      }).addTo(tourMap);

      tourMap.fitBounds(state.tourRoute.getBounds(), { padding: [45, 45], maxZoom: 16 });
      if (segInfo) segInfo.innerHTML = `<span>${formatDistance(distMeters)} · ~${walkMins} min walk</span>`;
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
      const walkMins = Math.max(1, Math.round((distMeters / 80) * 60 / 60));

      state.tourRoute = L.polyline(coords, {
        color: '#1E5B8A', weight: 5, opacity: 0.85,
      }).addTo(tourMap);

      tourMap.fitBounds(state.tourRoute.getBounds(), { padding: [45, 45], maxZoom: 16 });
      if (segInfo) segInfo.innerHTML = `<span>${formatDistance(distMeters)} · ~${walkMins} min walk</span>`;
    })
    .catch(() => {
      state.tourFetching = false;
      if (!tourMap) return;
      const distMeters = haversine(fromStop.lat, fromStop.lng, toStop.lat, toStop.lng);
      const walkMins = Math.max(1, Math.round((distMeters / 80) * 60 / 60));
      state.tourRoute = L.polyline(
        [[fromStop.lat, fromStop.lng], [toStop.lat, toStop.lng]],
        { color: '#1E5B8A', weight: 3, opacity: 0.5, dashArray: '8, 8' }
      ).addTo(tourMap);
      if (segInfo) segInfo.innerHTML = `<span>${formatDistance(distMeters)} · ~${walkMins} min walk</span>`;
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
  const el = views.tours;
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
 * Open the full-screen detail overlay for a mural.
 * Renders: hero image, metadata, bio, walking directions,
 * field photos, 6 nearest murals, and "more by this artist".
 * @param {Object} mural - Mural object from data.js
 */
function openDetail(mural) {
  state.selectedMural = mural;
  detailPage.hidden = false;

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

  detailContent.innerHTML = `
    <img class="detail-hero" src="${mural.img || ''}" alt="${mural.a}" onerror="this.style.display='none'">
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
          <button class="detail-gmaps-link" onclick="openInMapsApp(${mural.id})">
            Open in Maps ↗
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

  detailContent.querySelectorAll('.detail-nearby-card').forEach(card => {
    card.addEventListener('click', () => {
      const m = murals.find(m => m.id === Number(card.dataset.id));
      if (m) openDetail(m);
    });
  });

  detailPage.scrollTop = 0;
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
        L.circleMarker([state.userLat, state.userLng], {
          radius: 8, fillColor: '#4285F4', color: '#fff', weight: 3, fillOpacity: 1,
        }).addTo(leafletMap).bindPopup('You are here');
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

      // Estimate time: walking ~80m/min, driving ~500m/min
      const speed = profile === 'foot' ? 80 : 500;
      const durationSecs = (distMeters / speed) * 60;
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
  const modeText = profile === 'foot' ? 'walk' : 'drive';
  const lineNote = straightLine ? ' (straight line)' : '';

  const mural = state.directionsMural;
  const mapsUrl = isIOS
    ? `https://maps.apple.com/?daddr=${mural.lat},${mural.lng}&dirflg=${profile === 'foot' ? 'w' : 'd'}`
    : `https://www.google.com/maps/dir/?api=1&destination=${mural.lat},${mural.lng}&travelmode=${profile === 'foot' ? 'walking' : 'driving'}`;

  const bar = document.createElement('div');
  bar.className = 'directions-bar';
  bar.innerHTML = `
    <div class="directions-info">
      <span class="directions-distance">${distText}${lineNote}</span>
      <span class="directions-time">~${mins} min ${modeText}</span>
    </div>
    <div class="directions-controls">
      <button class="directions-toggle ${profile === 'foot' ? 'active' : ''}" data-profile="foot" aria-label="Walking">🚶</button>
      <button class="directions-toggle ${profile === 'car' ? 'active' : ''}" data-profile="car" aria-label="Driving">🚗</button>
      <button class="directions-gmaps" onclick="window.open('${mapsUrl}','_blank')">Open in Maps ↗</button>
      <button class="directions-close" aria-label="Close directions">✕</button>
    </div>
  `;

  document.getElementById('map-container').appendChild(bar);

  // Prevent Leaflet from eating clicks/touches on the bar
  L.DomEvent.disableClickPropagation(bar);
  L.DomEvent.disableScrollPropagation(bar);

  // Toggle walk/drive
  bar.querySelectorAll('.directions-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const newProfile = btn.dataset.profile;
      if (newProfile !== state.directionsProfile) {
        state.directionsProfile = newProfile;
        fetchAndDrawRoute();
      }
    });
  });

  // Google Maps link — use explicit handler for iOS Safari
  bar.querySelector('.directions-gmaps').addEventListener('click', (e) => {
    e.preventDefault();
    window.open(gmapsUrl, '_blank');
  });

  // Close button
  bar.querySelector('.directions-close').addEventListener('click', () => clearDirections());
}

/** Remove route polyline, destination marker, and directions bar from the map. */
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
handleDeepLink();

// Restore mural detail after returning from Google Maps
const returnMural = sessionStorage.getItem('mq_return_mural');
if (returnMural) {
  sessionStorage.removeItem('mq_return_mural');
  const mid = parseInt(returnMural, 10);
  const m = murals.find(mu => mu.id === mid);
  if (m) showDetail(m);
}
