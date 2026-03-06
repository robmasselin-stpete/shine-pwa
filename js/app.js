import { murals, YEARS, YEAR_COLORS, CATEGORY_COLORS } from './data.js';
import { fieldPhotos, ARTIST_ALIASES } from './photos.js';

// =============================================
// State
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
};

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

function switchTab(tab) {
  state.tab = tab;
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  Object.entries(views).forEach(([key, el]) => { el.hidden = key !== tab; });

  searchBar.hidden = tab !== 'explore';
  exploreFilters.hidden = tab !== 'explore';
  detailPage.hidden = true;

  if (tab === 'explore') renderExplore();
  if (tab === 'map') initMap();
  if (tab === 'routes') renderRoutes();
}

// =============================================
// Haversine distance (meters)
// =============================================
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters) {
  const feet = meters * 3.28084;
  if (feet < 1000) return `${Math.round(feet)} ft`;
  return `${(feet / 5280).toFixed(1)} mi`;
}

// =============================================
// Explore filtering
// =============================================
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
const mapMarkers = [];

const ICON_ZOOM_THRESHOLD = 15;

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

function calcRouteTotalDist(orderedMurals) {
  let total = 0;
  for (let i = 1; i < orderedMurals.length; i++) {
    total += haversine(orderedMurals[i-1].lat, orderedMurals[i-1].lng, orderedMurals[i].lat, orderedMurals[i].lng);
  }
  return total;
}

const ROUTE_DEFS = [
  { id: 'shine-2025', name: 'SHINE 2025 Origins', desc: 'The latest festival murals', filter: m => m.y === 2025 && m.cat === 'shine' },
  { id: 'shine-2024', name: 'SHINE 2024', desc: '2024 festival collection', filter: m => m.y === 2024 && m.cat === 'shine' },
  { id: 'shine-2023', name: 'SHINE 2023', desc: '2023 festival collection', filter: m => m.y === 2023 && m.cat === 'shine' },
  { id: 'downtown', name: 'Downtown Highlights', desc: 'Best murals within walking distance', filter: m => m.cat !== 'commercial' && haversine(27.7706, -82.6400, m.lat, m.lng) < 2000 },
  { id: 'all-shine', name: 'All SHINE Murals', desc: 'Every reviewed SHINE mural', filter: m => m.cat !== 'commercial' },
];

function renderRoutes() {
  const routeCards = ROUTE_DEFS.map(def => {
    const routeMurals = murals.filter(m => m.lat && m.lng && def.filter(m));
    if (routeMurals.length === 0) return '';
    const ordered = getRouteMurals(def.filter);
    const totalDist = calcRouteTotalDist(ordered);
    const walkMins = Math.round(totalDist / 80); // ~80m/min walking
    const thumb = routeMurals[0]?.img || '';
    return `
      <div class="route-card" data-route="${def.id}">
        <img class="route-card-img" src="${thumb}" alt="${def.name}" loading="lazy" onerror="this.style.background='#ddd'">
        <div class="route-card-body">
          <div class="route-card-name">${def.name}</div>
          <div class="route-card-desc">${def.desc}</div>
          <div class="route-card-stats">${routeMurals.length} stops · ${formatDistance(totalDist)} · ~${walkMins} min walk</div>
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

function openRoute(def) {
  const ordered = getRouteMurals(def.filter);
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

      ${mural.lat && mural.lng ? `
        <a class="detail-directions" href="https://www.google.com/maps/dir/?api=1&destination=${mural.lat},${mural.lng}&travelmode=walking" target="_blank" rel="noopener">
          🚶 Walking Directions
        </a>
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
function getArtistAliases(name) {
  for (const [key, aliases] of Object.entries(ARTIST_ALIASES)) {
    if (aliases.some(a => a.toLowerCase() === name.toLowerCase())) {
      return aliases;
    }
  }
  return [name];
}

// =============================================
// URL deep linking (?mural=ID)
// =============================================
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
