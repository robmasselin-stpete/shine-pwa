// SHINE — QR Code / PixelStix URL Mapping
// Plaques use hwid.us short links → redirect to content.pixelstix.com

export function normalizeUrl(url) {
  try {
    let s = url.trim().toLowerCase();
    s = s.replace(/^https?:\/\//, '');
    s = s.replace(/^www\./, '');
    s = s.replace(/\/+$/, '');
    return s;
  } catch { return url; }
}

const rawMap = {
  'hwid.us/hubfp48hnamothrrmvevenogra9irg': 23, // Emmanuel Jarus — Green Bench Brewing
  // Add more as you scan plaques:
  // 'hwid.us/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx': ID,
};

export function lookupQrUrl(url) {
  const key = normalizeUrl(url);
  if (rawMap[key] !== undefined) return rawMap[key];
  for (const [mapKey, id] of Object.entries(rawMap)) {
    if (key === mapKey || key.startsWith(mapKey + '/') || mapKey.startsWith(key + '/')) {
      return id;
    }
  }
  return null;
}
