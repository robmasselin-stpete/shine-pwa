// SHINE — QR Code / PixelStix URL Mapping
// Plaques use hwid.us short links → redirect to content.pixelstix.com
// Matching is fuzzy: case-insensitive, 0/O treated as equivalent

export function normalizeUrl(url) {
  try {
    let s = url.trim().toLowerCase();
    s = s.replace(/^https?:\/\//, '');
    s = s.replace(/^www\./, '');
    s = s.replace(/\/+$/, '');
    return s;
  } catch { return url; }
}

// Map of code hashes (lowercased) → mural IDs
// These are the path segments from hwid.us short links
const codeMap = {
  'hubfp48hnam0thrrmvevenogra9irg': 23, // Emmanuel Jarus — Green Bench Brewing
  // Add more as you scan plaques:
  // 'xxxxxxxxxxxxxxxxxxxxxxxxxxxx': ID,
};

// Make a code fuzzy by collapsing 0/o/O and 1/l/I
function fuzzy(s) {
  return s.toLowerCase().replace(/[0o]/g, '~').replace(/[1li]/g, '!');
}

export function lookupQrUrl(url) {
  const key = normalizeUrl(url);

  // Try each known code — uses includes() so URL structure doesn't matter
  for (const [code, id] of Object.entries(codeMap)) {
    // Exact substring match
    if (key.includes(code)) return id;
    // Fuzzy match (0↔o, 1↔l↔i)
    if (fuzzy(key).includes(fuzzy(code))) return id;
  }

  return null;
}
