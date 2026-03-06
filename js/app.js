/**
 * SHINE St. Pete — Main Application
 *
 * Single-file vanilla JS app. No framework, no build step.
 *
 * Architecture:
 *   - All UI state lives in the `state` object (line ~20)
 *   - State changes trigger explicit render calls (no reactivity)
 *   - All HTML is rendered via template literals into container divs
 *   - Three tabs: Explore (card grid), Map (Leaflet), Routes (walking tours)
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

// =============================================
// State — single mutable object drives all UI
// =============================================
const state = {
  tab: 'explore',
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
};

// Year buckets for category filtering — update these when adding new festival years
const SHINE_YEARS = [2025, 2024, 2023, 2022, 2021];
const VINTAGE_YEARS = [2020, 2019, 2018, 2017, 2016, 2015];

// =============================================
// DOM refs
// =============================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const views = {
  explore: $('#view-explore'),
  map: $('#view-map'),
  routes: $('#view-routes'),
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
  if (tab === 'explore') renderExplore();
  if (tab === 'map') initMap();
  if (tab === 'routes') renderRoutes();
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
      (m.bldg && m.bldg.toLowerCase().includes(q))
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
  if (f === 'shine' || f === 'vintage') {
    const years = f === 'shine' ? SHINE_YEARS : VINTAGE_YEARS;
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
const mapMarkers = []; // Array of { dot, imgMarker, mural, visible } for each mural

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

  views.map.innerHTML = `
    <div class="map-filter-bar">
      <div class="filter-pills" id="map-cat-pills"></div>
      <div class="filter-pills" id="map-year-pills" hidden></div>
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

  // Swap between dots and icons on zoom
  leafletMap.on('zoomend', () => swapMarkerStyle());

  // Year legend
  const legendDiv = document.createElement('div');
  legendDiv.className = 'map-legend';
  legendDiv.id = 'map-legend';
  document.getElementById('map-container').appendChild(legendDiv);

  state.activeMapTab = 'all';
  state.activeMapYears = null;
  renderMapCatPills();
  updateMapMarkers();

  // User location
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(pos => {
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

  // Year sub-pills for Shine and Vintage
  if (tab === 'shine' || tab === 'vintage') {
    const years = tab === 'shine' ? SHINE_YEARS : VINTAGE_YEARS;
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

  // Legend
  if (legendEl) {
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

// =============================================
// Routes view
// =============================================
/**
 * Get murals for a route, ordered by nearest-neighbor walk.
 * Starts from the mural closest to the group centroid, then greedily
 * picks the nearest unvisited mural. Not optimal TSP, but good enough.
 * @param {Function} filterFn - Predicate to select which murals are in this route
 * @returns {Array} Ordered mural objects
 */
function getRouteMurals(filterFn) {
  const list = murals.filter(m => m.lat && m.lng && filterFn(m));
  if (list.length < 2) return list;

  // Nearest-neighbor walk order from most central mural
  const avgLat = list.reduce((s, m) => s + m.lat, 0) / list.length;
  const avgLng = list.reduce((s, m) => s + m.lng, 0) / list.length;
  const sorted = [];
  const remaining = [...list];

  // Start from mural closest to center
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

// Pre-defined walking routes.
// Two types:
//   - Curated: `ids` array specifies exact mural IDs in walk order
//   - Auto: `filter` function selects murals, nearest-neighbor computes order
const ROUTE_DEFS = [
  { id: 'shine-2025', name: 'SHINE 2025 Origins', desc: 'All 2025 murals plus classics along the way',
    ids: [17, 6, 107, 116, 1, 109, 110, 7, 9, 5, 16, 12, 2, 3, 8, 10, 13, 15, 19] },
  { id: 'shine-2024', name: 'SHINE 2024', desc: '2024 festival collection', filter: m => m.y === 2024 && m.cat === 'shine' },
  { id: 'downtown', name: 'Downtown Highlights', desc: 'Best murals within walking distance', filter: m => m.cat !== 'commercial' && haversine(27.7706, -82.6400, m.lat, m.lng) < 2000 },
];

/**
 * Get the ordered mural list for a route definition.
 * Curated routes (ids array) use exact order; filter routes use nearest-neighbor.
 */
function getRouteOrdered(def) {
  if (def.ids) {
    return def.ids.map(id => murals.find(m => m.id === id)).filter(m => m && m.lat && m.lng);
  }
  return getRouteMurals(def.filter);
}

/** Render the Routes tab — list of route cards with stats (stop count, distance, walk time). */
function renderRoutes() {
  const routeCards = ROUTE_DEFS.map(def => {
    const ordered = getRouteOrdered(def);
    if (ordered.length === 0) return '';
    const totalDist = calcRouteTotalDist(ordered);
    const walkMins = Math.round(totalDist / 80); // ~80m/min walking
    const thumb = ordered[0]?.img || '';
    return `
      <div class="route-card" data-route="${def.id}">
        <img class="route-card-img" src="${thumb}" alt="${def.name}" loading="lazy" onerror="this.style.background='#ddd'">
        <div class="route-card-body">
          <div class="route-card-name">${def.name}</div>
          <div class="route-card-desc">${def.desc}</div>
          <div class="route-card-stats">${ordered.length} stops · ${formatDistance(totalDist)} · ~${walkMins} min walk</div>
        </div>
      </div>
    `;
  }).filter(Boolean);

  if (routeCards.length === 0) {
    views.routes.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🗺</div>
        <div class="empty-state-text">No routes available yet.</div>
      </div>`;
    return;
  }

  views.routes.innerHTML = `
    <div class="routes-header">Walking Routes</div>
    <div class="routes-list">${routeCards.join('')}</div>
  `;

  views.routes.querySelectorAll('.route-card').forEach(card => {
    card.addEventListener('click', () => {
      const def = ROUTE_DEFS.find(r => r.id === card.dataset.route);
      if (def) openRoute(def);
    });
  });
}

/** Open route detail overlay — numbered stop list with distances and a Google Maps deep link. */
function openRoute(def) {
  const ordered = getRouteOrdered(def);
  if (ordered.length === 0) return;

  const totalDist = calcRouteTotalDist(ordered);
  const walkMins = Math.round(totalDist / 80);

  detailPage.hidden = false;
  detailContent.innerHTML = `
    <div class="route-detail-header">
      <div class="route-detail-name">${def.name}</div>
      <div class="route-detail-stats">${ordered.length} stops · ${formatDistance(totalDist)} · ~${walkMins} min walk</div>
    </div>
    <div class="route-stop-list">
      ${ordered.map((m, i) => {
        const distFromPrev = i > 0 ? haversine(ordered[i-1].lat, ordered[i-1].lng, m.lat, m.lng) : 0;
        return `
          ${i > 0 ? `<div class="route-walk-seg">🚶 ${formatDistance(distFromPrev)}</div>` : ''}
          <div class="route-stop" data-id="${m.id}">
            <div class="route-stop-num">${i + 1}</div>
            <img class="route-stop-img" src="${m.img || ''}" alt="${m.a}" loading="lazy" onerror="this.style.background='#ddd'">
            <div class="route-stop-info">
              <div class="route-stop-artist">${m.a}</div>
              <div class="route-stop-loc">${m.bldg || m.loc}</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <a class="detail-directions" href="https://www.google.com/maps/dir/${ordered.map(m => m.lat + ',' + m.lng).join('/')}/@${ordered[0].lat},${ordered[0].lng},14z/data=!4m2!4m1!3e2" target="_blank" rel="noopener">
      🗺 Open Full Route in Google Maps
    </a>
  `;

  detailContent.querySelectorAll('.route-stop').forEach(stop => {
    stop.addEventListener('click', () => {
      const mural = murals.find(m => m.id === Number(stop.dataset.id));
      if (mural) openDetail(mural);
    });
  });

  detailPage.scrollTop = 0;
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

      ${mural.bio ? `
        <div class="detail-bio">
          <div class="detail-bio-label">About the Artist</div>
          ${mural.bio}
        </div>
      ` : ''}

      ${mural.desc ? `
        <div class="detail-bio">
          <div class="detail-bio-label">About This Mural</div>
          ${mural.desc}
        </div>
      ` : ''}

      ${mural.lat && mural.lng ? `
        <button class="detail-directions" onclick="startDirections(${mural.id})">
          🚶 Get Directions
        </button>
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
function startDirections(muralId) {
  const mural = murals.find(m => m.id === muralId);
  if (!mural) return;

  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mural.lat},${mural.lng}&travelmode=walking`;

  // On insecure origins (HTTP), geolocation is blocked and window.open gets
  // killed by popup blockers in async callbacks. Detect this synchronously
  // during the click handler and navigate directly to Google Maps.
  if (!window.isSecureContext) {
    window.location.href = gmapsUrl;
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
        // User denied location — redirect to Google Maps
        state.directionsMural = null;
        window.location.href = gmapsUrl;
      },
      { enableHighAccuracy: true }
    );
  } else {
    window.location.href = gmapsUrl;
  }
}
// Expose to onclick handler
window.startDirections = startDirections;

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
  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mural.lat},${mural.lng}&travelmode=${profile === 'foot' ? 'walking' : 'driving'}`;

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
      <a class="directions-gmaps" href="${gmapsUrl}" target="_blank" rel="noopener">Google Maps ↗</a>
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
renderFilterPills();
renderExplore();
handleDeepLink();
