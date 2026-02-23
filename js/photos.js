// Field photo → mural mapping
// src: path relative to /images/field/
// muralId: links to mural record (null = unmapped festival/atmosphere shot)
// note: display caption
// lat, lng: GPS coordinates for Nearby sorting

export const fieldPhotos = [
  { src: 'IMG_0392.jpeg', muralId: 3,    note: 'Sara Salem — in process at LMCU',          lat: 27.7583, lng: -82.688 },
  { src: 'IMG_0399.jpeg', muralId: 2,    note: 'Aaron Tullo — in process at Cordova Inn',   lat: 27.7583, lng: -82.688 },
  { src: 'IMG_0394.jpeg', muralId: 19,   note: 'Derek Donnelly — Hollander Hotel',          lat: 27.7583, lng: -82.688 },
  { src: 'IMG_0396.jpeg', muralId: 19,   note: 'Derek Donnelly — Hollander Hotel wide',     lat: 27.7583, lng: -82.688 },
  { src: 'IMG_0401.jpeg', muralId: 15,   note: 'Jenipher Chandley — building prep',         lat: 27.7583, lng: -82.688 },
  { src: 'IMG_0144.jpeg', muralId: 5,    note: 'Dreamweaver — Vernis Bowling finished',     lat: 27.7757, lng: -82.673 },
  { src: 'IMG_0415.jpeg', muralId: 8,    note: 'John Vitale — Power to the Patients',       lat: 27.7583, lng: -82.688 },
  // Unmapped field photos — add muralId when identified
  // { src: 'IMG_XXXX.jpeg', muralId: null, note: 'Bike tour', lat: 27.770, lng: -82.640 },
];

// Artist alias map — handles spelling variants
export const ARTIST_ALIASES = {
  'Dreamweaver': ['Dream Weaver', 'Dreamweaver'],
  'Sio': ['Sionna', 'Sio'],
};
