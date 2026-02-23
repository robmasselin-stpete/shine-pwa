import { murals, YEARS, YEAR_COLORS } from './data.js';
import { fieldPhotos, ARTIST_ALIASES } from './photos.js';

// =============
// State
// =============
const state = {
  tab: 'explore',
  searchQuery: '',
  activeYear: null,
  userLat: null, userLng: null,
  mapReady: false,
  selectedMural: null,
};

// =============
// DOM
// =============
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const views = {
  explore: $('#view-explore'),
  map: $('#view-map'),
  nearby: $('#view-nearby'),
  gallery: $('#view-gallery'),
};
const detailPage = $('#detail-page');
const detailContent = $('#detail-content');
const searchBar = $('#search-bar');
const yearFilters = $('#year-filters');
const yearPills = $('#year-pills');
const searchInput = $('#search-input');

// =============
// Tab nav
// =============
$$('.tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  state.tab = tab;
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  Object.entries(views).forEach(([key, el]) => { el.hidden = key !== tab; });
  searchBar.hidden = tab !== 'explore';
  yearFilters.hidden = tab !== 'explore';
  detailPage.hidden = true;
  if (tab === 'explore') renderExplore();
  if (tab === 'map') initMap();
  if (tab === 'nearby') renderNearby();
  if (tab === 'gallery') renderGallery();
}

// =============
// Haversine
// =============
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
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

// =============
// Filtering
// =============
function getFilteredMurals() {
  let list = murals;
  if (state.activeYear) list = list.filter(m => m.y === state.activeYear);
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

// =============
// Year pills
// =============
function renderYearPills() {
  yearPills.innerHTML = `
    <button class="year-pill ${!state.activeYear ? 'active' : ''}" data-year="">All</button>
    ${YEARS.map(y => `
      <button class="year-pill ${state.activeYear === y ? 'active' : ''}" data-year="${y}">${y}</button>
    `).join('')}
  `;
  yearPills.querySelectorAll('.year-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeYear = btn.dataset.year ? Number(btn.dataset.year) : null;
      renderYearPills();
      renderExplore();
    });
  });
}

// =============
// Search
// =============
searchInput.addEventListener('input', e => {
  state.searchQuery = e.target.value.trim();
  renderExplore();
});

// =============
// Explore grid
// =============
function renderExplore() {
  const filtered = getFilteredMurals();
  if (!filtered.length) {
    views.explore.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🎨</div>
        <div class="empty-state-text">No murals found.<br>Try a different search or year.</div>
      </div>`;
    return;
  }
  views.explore.innerHTML = `
    <div class="mural-grid">
      ${filtered.map(m => `
        <div class="mural-card" data-id="${m.id}">
          <img class="mural-card-img" src="${m.img || ''}" alt="${m.a}" loading="lazy">
          <div class="mural-card-info">
            <div class="mural-card-artist">${m.a}</div>
            <div class="mural-card-meta">${m.bldg || m.loc || ''} · ${m.y}</div>
          </div>
        </div>
      `).join('')}
    </div>`;
  views.explore.querySelectorAll('.mural-card').forEach(card => {
    card.addEventListener('click', () => {
      const mural = murals.find(m => m.id === Number(card.dataset.id));
      if (mural) openDetail(mural);
    });
  });
}

// =============
// Map view — FIX: pins now open detail on click
// =============
let leafletMap = null;
let mapMarkers = [];

function initMap() {
  if (state.mapReady) {
    // If map exists, just resize
    setTimeout(() => leafletMap.invalidateSize(), 100);
    return;
  }

  views.map.innerHTML = '<div id="map-container"></div>';
  leafletMap = L.map('map-container', {
    center: [27.7706, -82.6600],
    zoom: 13,
    zoomControl: false,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 19,
  }).addTo(leafletMap);

  // Add mural markers with CLICK → DETAIL
  murals.forEach(m => {
    if (!m.lat || !m.lng) return;
    const color = YEAR_COLORS[m.y] || '#999';

    const marker = L.circleMarker([m.lat, m.lng], {
      radius: 7,
      fillColor: color,
      color: '#fff',
      weight: 2,
      fillOpacity: 0.9,
    }).addTo(leafletMap);

    // Popup with "View Details" link
    const popupHtml = `
      <div style="text-align:center;min-width:150px">
        ${m.img ? `<img src="${m.img}" style="width:150px;height:100px;object-fit:cover;border-radius:4px;margin-bottom:6px" loading="lazy" onerror="this.style.display='none'">` : ''}
        <div style="font-weight:700;font-size:13px">${m.a}</div>
        ${m.t ? `<div style="font-size:11px;font-style:italic;color:#555">${m.t}</div>` : ''}
        <div style="font-size:11px;color:#666;margin:2px 0">${m.y}${m.bldg ? ' · ' + m.bldg : ''}</div>
        <div style="margin-top:6px;display:flex;gap:8px;justify-content:center">
          <a href="#" class="popup-detail-link" data-mural-id="${m.id}" style="font-size:12px;font-weight:600;color:#1E5B8A">View Details</a>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lng}&travelmode=walking" 
             target="_blank" rel="noopener" style="font-size:12px;color:#666">Directions →</a>
        </div>
      </div>
    `;

    marker.bindPopup(popupHtml);

    // When popup opens, wire up the detail link
    marker.on('popupopen', () => {
      const link = document.querySelector(`.popup-detail-link[data-mural-id="${m.id}"]`);
      if (link) {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          leafletMap.closePopup();
          openDetail(m);
        });
      }
    });

    mapMarkers.push({ marker, mural: m });
  });

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

// =============
// Nearby
// =============
function renderNearby() {
  if (!('geolocation' in navigator)) {
    views.nearby.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📍</div>
        <div class="empty-state-text">Location not available.<br>Enable GPS to find murals near you.</div>
      </div>`;
    return;
  }

  views.nearby.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">📡</div>
      <div class="empty-state-text">Finding your location…</div>
    </div>`;

  navigator.geolocation.getCurrentPosition(pos => {
    state.userLat = pos.coords.latitude;
    state.userLng = pos.coords.longitude;

    const withDist = murals
      .filter(m => m.lat && m.lng)
      .map(m => ({ ...m, dist: haversine(state.userLat, state.userLng, m.lat, m.lng) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 15);

    if (!withDist.length) {
      views.nearby.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎨</div>
          <div class="empty-state-text">No murals with GPS data yet.</div>
        </div>`;
      return;
    }

    views.nearby.innerHTML = `
      <div class="nearby-list">
        ${withDist.map(m => `
          <div class="nearby-item" data-id="${m.id}">
            <img class="nearby-thumb" src="${m.img || ''}" alt="${m.a}" loading="lazy">
            <div class="nearby-info">
              <div class="nearby-artist">${m.a}</div>
              <div class="nearby-location">${m.bldg || m.loc}</div>
              <div class="nearby-distance">${formatDistance(m.dist)}</div>
            </div>
          </div>
        `).join('')}
      </div>`;

    views.nearby.querySelectorAll('.nearby-item').forEach(item => {
      item.addEventListener('click', () => {
        const mural = murals.find(m => m.id === Number(item.dataset.id));
        if (mural) openDetail(mural);
      });
    });
  }, () => {
    views.nearby.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📍</div>
        <div class="empty-state-text">Couldn't get your location.<br>Check your GPS permissions.</div>
      </div>`;
  }, { enableHighAccuracy: true, timeout: 10000 });
}

// =============
// Gallery
// =============
function renderGallery() {
  if (!fieldPhotos.length) {
    views.gallery.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📸</div>
        <div class="empty-state-text">No field photos yet.<br>Coming soon!</div>
      </div>`;
    return;
  }
  views.gallery.innerHTML = `
    <div class="gallery-grid">
      ${fieldPhotos.map(p => `
        <img src="images/field/${p.src}" alt="${p.note}" loading="lazy">
      `).join('')}
    </div>`;
}

// =============
// Detail page — now with otherImg support
// =============
function openDetail(mural) {
  state.selectedMural = mural;
  detailPage.hidden = false;

  const photos = fieldPhotos.filter(p => p.muralId === mural.id);

  // Nearby by distance
  const nearby = murals
    .filter(m => m.id !== mural.id && m.lat && m.lng && mural.lat && mural.lng)
    .map(m => ({ ...m, dist: haversine(mural.lat, mural.lng, m.lat, m.lng) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 6);

  // More by same artist
  const artistNames = getArtistAliases(mural.a);
  const moreByArtist = murals.filter(m =>
    m.id !== mural.id &&
    artistNames.some(name => m.a.toLowerCase() === name.toLowerCase())
  );

  detailContent.innerHTML = `
    <img class="detail-hero" src="${mural.img || ''}" alt="${mural.a}" onerror="this.style.display='none'">
    <div class="detail-body">
      <div class="detail-artist">${mural.a}</div>
      ${mural.t ? `<div class="detail-title">${mural.t}</div>` : ''}
      <span class="detail-year-badge">SHINE ${mural.y}</span>
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

      ${mural.oimg ? `
        <div class="detail-section">
          <div class="detail-section-title">Other Work by ${mural.a}</div>
          <div class="detail-photo-scroll">
            <div class="detail-photo-card">
              <img src="${mural.oimg}" alt="Other work by ${mural.a}" loading="lazy" onerror="this.parentElement.style.display='none'">
            </div>
          </div>
        </div>
      ` : ''}

      ${photos.length > 0 ? `
        <div class="detail-section">
          <div class="detail-section-title">📸 Field Photos</div>
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

  // Wire up nearby/more card clicks
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

// =============
// Artist aliases
// =============
function getArtistAliases(name) {
  for (const [, aliases] of Object.entries(ARTIST_ALIASES)) {
    if (aliases.some(a => a.toLowerCase() === name.toLowerCase())) return aliases;
  }
  return [name];
}

// =============
// Deep link: ?mural=ID
// =============
function handleDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const muralId = params.get('mural');
  if (muralId) {
    const mural = murals.find(m => m.id === Number(muralId));
    if (mural) openDetail(mural);
  }
}

// =============
// Init
// =============
renderYearPills();
renderExplore();
handleDeepLink();
