// Minimal service worker — enables PWA install prompt on Android/Chrome
// No caching — just passes requests through to the network
self.addEventListener('fetch', function() {});
