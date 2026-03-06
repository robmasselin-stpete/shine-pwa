// Field photo → mural mapping
// src: path relative to /images/field/
// muralId: links to mural record (null = unmapped)
// note: display caption

export const fieldPhotos = [
  { src: 'IMG_0392.jpeg', muralId: 3,    note: 'Sara Salem — in process at LMCU' },
  { src: 'IMG_0399.jpeg', muralId: 2,    note: 'Aaron Tullo — in process at Cordova Inn' },
  { src: 'IMG_0394.jpeg', muralId: 19,   note: 'Derek Donnelly — Hollander Hotel' },
  { src: 'IMG_0396.jpeg', muralId: 19,   note: 'Derek Donnelly — Hollander Hotel wide' },
  { src: 'IMG_0401.jpeg', muralId: 15,   note: 'Jenipher Chandley — building prep' },
  { src: 'IMG_0144.jpeg', muralId: 5,    note: 'Dreamweaver — Vernis Bowling finished' },
  { src: 'IMG_0415.jpeg', muralId: 8,    note: 'John Vitale — Power to the Patients' },
  // Unmapped field photos — add muralId when identified
  // { src: 'IMG_XXXX.jpeg', muralId: null, note: 'Bike tour — unidentified' },
];

// Artist alias map — handles spelling variants
export const ARTIST_ALIASES = {
  'Dreamweaver': ['Dream Weaver', 'Dreamweaver'],
  'Sio': ['Sionna', 'Sio'],
};
