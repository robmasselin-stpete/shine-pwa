import { murals, YEARS, YEAR_COLORS } from './data.js';
import { fieldPhotos, ARTIST_ALIASES } from './photos.js';

// =============================================
// State
// =============================================
const state = {
  tab: 'explore',
  searchQuery: '',
  activeYear: null,   // null = all years
  userLat: null,
  userLng: null,
  mapReady: false,
  selectedMural: null, // mural object for detail view
};

// =============================================
// DOM refs
// =============================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

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

// =============================================
// Tab navigation
// =============================================
$$('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    switchTab(btn.dataset.tab);
  });
});

function switchTab(tab) {
  state.tab = tab;

  // Update tab bar
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));

  // Show/hide views
  Object.entries(views).forEach(([key, el]) => {
    el.hidden = key !== tab;
  });

  // Show search & year pills only on explore
  searchBar.hidden = tab !== 'explore';
  yearFilters.hidden = tab !== 'explore';

  // Close detail page
  detailPage.hidden = true;

  // Lazy init views
  if (tab === 'explore') renderExplore();
  if (tab === 'map') initMap();
  if (tab === 'nearby') renderNearby();
  if (tab === 'gallery') renderGallery();
}

// =============================================
// Utility: Haversine distance (meters)
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
  const miles = feet / 5280;
  return `${miles.toFixed(1)} mi`;
}

// =============================================
// Filtering
// =============================================
function getFilteredMurals() {
  let list = murals;
  if (state.activeYear) {
    list = list.filter(m => m.y === state.activeYear);
  }
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    list = list.filter(m =>
      m.a.toLowerCase().includes(q) ||
      m.loc.toLowerCase().includes(q) ||
      (m.t && m.t.toLowerCase().includes(q)) ||
      (m.bldg && m.bldg.toLowerCase().includes(q))
    );
  }
  return list;
}

// =============================================
// Year pills
// =============================================
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
        <div class="empty-state-text">No murals found.<br>Try a different search or year.</div>
      </div>
    `;
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

function initMap() {
  if (state.mapReady) return;

  views.map.innerHTML = '<div id="map-container"></div>';

  leafletMap = L.map('map-container', {
    center: [27.7706, -82.6341], // St Pete downtown
    zoom: 14,
    zoomControl: false,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO',
    maxZoom: 19,
  }).addTo(leafletMap);

  // Add mural markers
  murals.forEach(m => {
    if (!m.lat || !m.lng) return;
    const color = YEAR_COLORS[m.y] || '#999';
    const marker = L.circleMarker([m.lat, m.lng], {
      radius: 14,
      fillColor: color,
      color: '#fff',
      weight: 2.5,
      fillOpacity: 0.9,
    }).addTo(leafletMap);

    const popupEl = document.createElement('div');
    popupEl.style.cssText = 'text-align:center;min-width:140px';

    const tapArea = document.createElement('div');
    tapArea.style.cursor = 'pointer';
    if (m.img) {
      const img = document.createElement('img');
      img.src = m.img;
      img.alt = m.a;
      img.loading = 'lazy';
      img.style.cssText = 'width:140px;height:100px;object-fit:cover;border-radius:4px;margin-bottom:6px';
      tapArea.appendChild(img);
    }
    const name = document.createElement('div');
    name.style.cssText = 'font-weight:700;font-size:13px';
    name.textContent = m.a;
    tapArea.appendChild(name);
    tapArea.addEventListener('click', () => openDetail(m));
    popupEl.appendChild(tapArea);

    if (m.t) {
      const title = document.createElement('div');
      title.style.cssText = 'font-size:11px;font-style:italic;color:#555';
      title.textContent = m.t;
      popupEl.appendChild(title);
    }
    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:11px;color:#666;margin:2px 0';
    meta.textContent = m.y + (m.bldg ? ' \u00b7 ' + m.bldg : '');
    popupEl.appendChild(meta);

    const dir = document.createElement('a');
    dir.href = `https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lng}&travelmode=walking`;
    dir.target = '_blank';
    dir.rel = 'noopener';
    dir.style.cssText = 'font-size:12px';
    dir.textContent = 'Directions \u2192';
    popupEl.appendChild(dir);

    marker.bindPopup(popupEl);
    marker.on('click', () => marker.openPopup());
  });

  // User location
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(pos => {
      state.userLat = pos.coords.latitude;
      state.userLng = pos.coords.longitude;
      L.circleMarker([state.userLat, state.userLng], {
        radius: 8,
        fillColor: '#4285F4',
        color: '#fff',
        weight: 3,
        fillOpacity: 1,
      }).addTo(leafletMap).bindPopup('You are here');
    }, () => {}, { enableHighAccuracy: true });
  }

  state.mapReady = true;

  // Fix Leaflet sizing after tab switch
  setTimeout(() => leafletMap.invalidateSize(), 100);
}

// =============================================
// Nearby view
// =============================================
function renderNearby() {
  if (!('geolocation' in navigator)) {
    views.nearby.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📍</div>
        <div class="empty-state-text">Location not available.<br>Enable GPS to find murals near you.</div>
      </div>
    `;
    return;
  }

  views.nearby.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">📡</div>
      <div class="empty-state-text">Finding your location…</div>
    </div>
  `;

  navigator.geolocation.getCurrentPosition(pos => {
    state.userLat = pos.coords.latitude;
    state.userLng = pos.coords.longitude;

    // Murals with distance
    const muralItems = murals
      .filter(m => m.lat && m.lng)
      .map(m => ({
        type: 'mural',
        id: m.id,
        thumb: m.img || '',
        title: m.a,
        subtitle: m.loc,
        dist: haversine(state.userLat, state.userLng, m.lat, m.lng),
        muralId: m.id,
      }));

    // Field photos with distance
    const photoItems = fieldPhotos
      .filter(p => p.lat && p.lng)
      .map((p, i) => {
        const linked = p.muralId ? murals.find(m => m.id === p.muralId) : null;
        return {
          type: 'photo',
          id: `photo-${i}`,
          thumb: `images/field/${p.src}`,
          title: p.note,
          subtitle: linked ? linked.a : 'Festival Photo',
          dist: haversine(state.userLat, state.userLng, p.lat, p.lng),
          muralId: p.muralId,
        };
      });

    // Guarantee photos appear: take top 15 murals + top 5 photos, then sort
    const topMurals = muralItems.sort((a, b) => a.dist - b.dist).slice(0, 15);
    const topPhotos = photoItems.sort((a, b) => a.dist - b.dist).slice(0, 5);
    const combined = [...topMurals, ...topPhotos]
      .sort((a, b) => a.dist - b.dist);

    if (combined.length === 0) {
      views.nearby.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎨</div>
          <div class="empty-state-text">No murals with GPS data yet.</div>
        </div>
      `;
      return;
    }

    views.nearby.innerHTML = `
      <div class="nearby-list">
        ${combined.map(item => `
          <div class="nearby-item" data-type="${item.type}" data-mural-id="${item.muralId || ''}">
            <img class="nearby-thumb" src="${item.thumb}" alt="${item.title}" loading="lazy">
            <div class="nearby-info">
              <div class="nearby-artist">${item.title}${item.type === 'photo' ? ' <span style="font-size:10px;opacity:.6">📸</span>' : ''}</div>
              <div class="nearby-location">${item.subtitle}</div>
              <div class="nearby-distance">${formatDistance(item.dist)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    views.nearby.querySelectorAll('.nearby-item').forEach(item => {
      item.addEventListener('click', () => {
        const type = item.dataset.type;
        const mid = item.dataset.muralId;
        if (type === 'mural' && mid) {
          const mural = murals.find(m => m.id === Number(mid));
          if (mural) openDetail(mural);
        } else if (type === 'photo') {
          // Find the photo by matching the thumbnail src
          const thumb = item.querySelector('.nearby-thumb');
          if (thumb) {
            const photo = fieldPhotos.find(p => thumb.src.includes(p.src));
            if (photo) openPhotoDetail(photo);
          }
        }
      });
    });
  }, () => {
    views.nearby.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📍</div>
        <div class="empty-state-text">Couldn't get your location.<br>Check your GPS permissions.</div>
      </div>
    `;
  }, { enableHighAccuracy: true, timeout: 10000 });
}

// =============================================
// Gallery view
// =============================================
function renderGallery() {
  if (fieldPhotos.length === 0) {
    views.gallery.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📸</div>
        <div class="empty-state-text">No field photos yet.</div>
      </div>
    `;
    return;
  }

  views.gallery.innerHTML = `
    <div class="gallery-grid">
      ${fieldPhotos.map((p, i) => `
        <img src="images/field/${p.src}" alt="${p.note}" loading="lazy" data-photo-idx="${i}">
      `).join('')}
    </div>
  `;

  views.gallery.querySelectorAll('.gallery-grid img').forEach(img => {
    img.style.cursor = 'pointer';
    img.addEventListener('click', () => {
      const photo = fieldPhotos[Number(img.dataset.photoIdx)];
      if (photo) openPhotoDetail(photo);
    });
  });
}

// =============================================
// Photo detail page (for gallery tap)
// =============================================
function openPhotoDetail(photo) {
  detailPage.hidden = false;

  const linked = photo.muralId ? murals.find(m => m.id === photo.muralId) : null;

  // Find nearby murals by GPS
  const nearby = (photo.lat && photo.lng)
    ? murals
        .filter(m => m.lat && m.lng)
        .map(m => ({ ...m, dist: haversine(photo.lat, photo.lng, m.lat, m.lng) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 6)
    : [];

  detailContent.innerHTML = `
    <img class="detail-hero" src="images/field/${photo.src}" alt="${photo.note}">
    <div class="detail-body">
      <div class="detail-artist">${photo.note}</div>
      ${linked ? `<div class="detail-title">Linked mural: ${linked.a}${linked.t ? ' — ' + linked.t : ''}</div>` : ''}

      ${photo.lat && photo.lng ? `
        <div class="detail-address">
          <span>📍</span>
          <span>${photo.lat.toFixed(4)}, ${photo.lng.toFixed(4)}</span>
        </div>
        <a class="detail-directions" href="https://www.google.com/maps/dir/?api=1&destination=${photo.lat},${photo.lng}&travelmode=walking" target="_blank" rel="noopener">
          🚶 Walking Directions
        </a>
      ` : ''}

      ${linked ? `
        <div class="detail-section">
          <div class="detail-section-title">Linked Mural</div>
          <div class="detail-nearby-row">
            <div class="detail-nearby-card" data-id="${linked.id}">
              <img src="${linked.img || ''}" alt="${linked.a}" loading="lazy">
              <div class="detail-nearby-card-artist">${linked.a}</div>
              <div class="detail-nearby-card-dist">${linked.y}</div>
            </div>
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
    </div>
  `;

  // Wire up mural card clicks
  detailContent.querySelectorAll('.detail-nearby-card').forEach(card => {
    card.addEventListener('click', () => {
      const m = murals.find(m => m.id === Number(card.dataset.id));
      if (m) openDetail(m);
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

  // Get field photos: linked by muralId OR geographically nearby (within 200m)
  const linkedPhotos = fieldPhotos.filter(p => p.muralId === mural.id);
  const nearbyPhotos = (mural.lat && mural.lng)
    ? fieldPhotos.filter(p =>
        p.lat && p.lng &&
        p.muralId !== mural.id &&
        !linkedPhotos.includes(p) &&
        haversine(mural.lat, mural.lng, p.lat, p.lng) < 200
      )
    : [];
  const photos = [...linkedPhotos, ...nearbyPhotos];

  // Get nearby murals (by GPS distance)
  const nearby = murals
    .filter(m => m.id !== mural.id && m.lat && m.lng && mural.lat && mural.lng)
    .map(m => ({ ...m, dist: haversine(mural.lat, mural.lng, m.lat, m.lng) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 6);

  // Get more by same artist (handle aliases)
  const artistNames = getArtistAliases(mural.a);
  const moreByArtist = murals.filter(m =>
    m.id !== mural.id && artistNames.some(name =>
      m.a.toLowerCase() === name.toLowerCase()
    )
  );

  detailContent.innerHTML = `
    <img class="detail-hero" src="${mural.img || ''}" alt="${mural.a}">
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

      ${photos.length > 0 ? `
        <div class="detail-section">
          <div class="detail-section-title">📸 Field Photos</div>
          <div class="detail-photo-scroll">
            ${photos.map(p => `
              <div class="detail-photo-card">
                <img src="images/field/${p.src}" alt="${p.note}" loading="lazy">
                <div style="font-size:11px;color:#666;padding:4px 2px 0">${p.note}</div>
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

  // Wire up nearby/more-by-artist card clicks
  detailContent.querySelectorAll('.detail-nearby-card').forEach(card => {
    card.addEventListener('click', () => {
      const m = murals.find(m => m.id === Number(card.dataset.id));
      if (m) openDetail(m);
    });
  });

  // Scroll to top
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
renderYearPills();
renderExplore();
handleDeepLink();
