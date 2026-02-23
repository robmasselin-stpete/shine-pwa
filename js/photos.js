// Field photo → mural mapping
// src: path relative to /images/field/
// muralId: links to mural record (null = unmapped festival/atmosphere shot)
// note: display caption
// lat, lng: GPS coordinates for Nearby sorting

export const fieldPhotos = [
  // ── Downtown / Central Ave area ──
  { src: 'IMG_0394.jpeg', muralId: 6,    note: 'Derek Donnelly — Hollander Hotel',            lat: 27.7762, lng: -82.637 },
  { src: 'IMG_0395.jpeg', muralId: null,  note: 'Spa Beach mural by Karin Smith',              lat: 27.770,  lng: -82.640 },
  { src: 'IMG_0396.jpeg', muralId: 6,    note: 'Derek Donnelly — Hollander Hotel wide',       lat: 27.7762, lng: -82.637 },
  { src: 'IMG_0397.jpeg', muralId: 23,   note: 'Emmanuel Jarus — SHINE plaque',               lat: 27.771,  lng: -82.652 },
  { src: 'IMG_0399.jpeg', muralId: 1,    note: 'Aaron Tullo — in process at Cordova Inn',     lat: 27.7728, lng: -82.6348 },
  { src: 'IMG_0400.jpeg', muralId: null,  note: 'Surrealist figures mural — Central Ave',      lat: 27.770,  lng: -82.655 },
  { src: 'IMG_0401.jpeg', muralId: 10,   note: 'Jenipher Chandley — building prep',           lat: 27.7583, lng: -82.688 },
  { src: 'IMG_0402.jpeg', muralId: null,  note: 'Shark mural on pink building',                lat: 27.770,  lng: -82.653 },
  { src: 'IMG_0403.jpeg', muralId: null,  note: 'Faded eyes mural — Central Arts District',    lat: 27.770,  lng: -82.653 },
  { src: 'IMG_0404.jpeg', muralId: 4,    note: 'Cecilia Lueza — in progress at Haddy',        lat: 27.7747, lng: -82.6445 },
  { src: 'IMG_0405.jpeg', muralId: 4,    note: 'Cecilia Lueza — from below',                  lat: 27.7747, lng: -82.6445 },
  { src: 'IMG_0406.jpeg', muralId: 9,    note: 'Isac Gres — in progress at Melting Pot',      lat: 27.7706, lng: -82.646 },
  { src: 'IMG_0407.jpeg', muralId: 4,    note: 'Cecilia Lueza — alley view with lift',        lat: 27.7747, lng: -82.6445 },
  { src: 'IMG_0408.jpeg', muralId: null,  note: 'Bank of America building murals',             lat: 27.771,  lng: -82.652 },
  { src: 'IMG_0409.jpeg', muralId: null,  note: 'Dinosaur in Hawaiian shirt mural',            lat: 27.771,  lng: -82.652 },
  { src: 'IMG_0410.jpeg', muralId: null,  note: 'Steampunk gears mural',                      lat: 27.770,  lng: -82.653 },
  { src: 'IMG_0411.jpeg', muralId: null,  note: 'Steampunk gears mural — angle 2',            lat: 27.770,  lng: -82.653 },
  { src: 'IMG_0412.jpeg', muralId: null,  note: 'Steampunk gears mural — angle 3',            lat: 27.770,  lng: -82.653 },
  { src: 'IMG_0413.jpeg', muralId: null,  note: 'Steampunk gears mural — wide',               lat: 27.770,  lng: -82.653 },
  { src: 'IMG_0414.jpeg', muralId: null,  note: 'Dinosaur mural close-up',                    lat: 27.771,  lng: -82.652 },
  { src: 'IMG_0415.jpeg', muralId: 11,   note: 'John Vitale — 600 1st Ave N',                lat: 27.7719, lng: -82.647 },

  // ── South side / Warehouse district ──
  { src: 'IMG_0416.jpeg', muralId: 31,   note: 'Stevie Shao — floral mural',                 lat: 27.764,  lng: -82.6464 },
  { src: 'IMG_0417.jpeg', muralId: null,  note: 'Warehouse murals — rear view',               lat: 27.749,  lng: -82.677 },
  { src: 'IMG_0418.jpeg', muralId: null,  note: 'Warehouse murals — rear angle 2',            lat: 27.749,  lng: -82.677 },
  { src: 'IMG_0419.jpeg', muralId: null,  note: 'Warehouse murals — front with birds',        lat: 27.749,  lng: -82.677 },
  { src: 'IMG_0420.jpeg', muralId: null,  note: 'Colorful mural at The Factory',              lat: 27.749,  lng: -82.6774 },
  { src: 'IMG_0421.jpeg', muralId: null,  note: 'The Factory — 2606 Fairfield Ave S',         lat: 27.749,  lng: -82.6774 },

  // ── 31st St & 7th Ave S wall ──
  { src: 'IMG_0422.jpeg', muralId: 8,    note: 'Elizabeth Barenis — tropical plants',         lat: 27.7583, lng: -82.688 },
  { src: 'IMG_0423.jpeg', muralId: null,  note: 'Aurailieus & Elizabeth Barenis — wall overview', lat: 27.7583, lng: -82.688 },
  { src: 'IMG_0424.jpeg', muralId: null,  note: '31st St mural wall — multi-artist panels',   lat: 27.7583, lng: -82.688 },
  { src: 'IMG_0425.jpeg', muralId: null,  note: 'Eye character by r2romero',                  lat: 27.7583, lng: -82.688 },
  { src: 'IMG_0426.jpeg', muralId: 3,    note: 'Brain The Genius — painting Culture',         lat: 27.7583, lng: -82.688 },
  { src: 'IMG_0427.jpeg', muralId: 2,    note: 'Amy Ilic-Volpe — Here & Now',                lat: 27.7583, lng: -82.688 },
  { src: 'IMG_0428.jpeg', muralId: null,  note: 'Gothic B with moon — 31st St wall',          lat: 27.7583, lng: -82.688 },
  { src: 'IMG_0429.jpeg', muralId: null,  note: 'Waves and hands mural',                      lat: 27.7583, lng: -82.688 },
  { src: 'IMG_0430.jpeg', muralId: null,  note: 'Blue brushstrokes — mural in progress',      lat: 27.7583, lng: -82.688 },
  { src: 'IMG_0431.jpeg', muralId: null,  note: 'Festival atmosphere — sky at dusk',           lat: 27.758,  lng: -82.688 },
  { src: 'IMG_0432.jpeg', muralId: 29,   note: 'NeSpoon — lace pattern at Cemex',             lat: 27.7604, lng: -82.6697 },
];

// Artist alias map — handles spelling variants
export const ARTIST_ALIASES = {
  'Dreamweaver': ['Dream Weaver', 'Dreamweaver'],
  'Sio': ['Sionna', 'Sio'],
};
