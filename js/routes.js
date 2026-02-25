// SHINE — Curated Tour Routes (2025)
// Each route is an ordered list of mural IDs with a travel mode

export const tourRoutes = [
  {
    id: 'walk-2025',
    name: 'Walking Tour',
    description: 'Downtown murals on foot — the core SHINE 2025 experience',
    mode: 'foot',
    icon: '\u{1F6B6}',
    stops: [6, 23, 1, 11, 7, 9],
    // Derek Donnelly (Hollander) → Emmanuel Jarus (Green Bench) →
    // Aaron Tullo (Cordova Inn) → John Vitale (600 1st Ave N) →
    // Dreamweaver (Vernis Bowling) → Isac Gres (Melting Pot)
  },
  {
    id: 'bike-2025',
    name: 'Bike Route',
    description: 'All 2025 artists — covers downtown and beyond',
    mode: 'bike',
    icon: '\u{1F6B2}',
    stops: [17, 5, 23, 1, 11, 7, 9, 10, 16],
    // Sara Salem (LMCU) → Derek Donnelly (1847 1st Ave N) →
    // Emmanuel Jarus (Green Bench) → Aaron Tullo (Cordova Inn) →
    // John Vitale (600 1st Ave N) → Dreamweaver (Vernis Bowling) →
    // Isac Gres (Melting Pot) → Jenipher Chandley (31st & 7th) →
    // Reid Jenkins (Founders Pro)
  },
  {
    id: 'auto-2025',
    name: 'Auto Tour',
    description: 'Drive the highlights — 5 key 2025 murals',
    mode: 'driving',
    icon: '\u{1F697}',
    stops: [17, 5, 23, 1, 12],
    // Sara Salem (LMCU) → Derek Donnelly (1847 1st Ave N) →
    // Emmanuel Jarus (Green Bench) → Aaron Tullo (Cordova Inn) →
    // John Vitale (The Factory)
  },
];
