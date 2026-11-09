/* =========================================================
   Service worker — lets the portal open offline and install as an app.
   Bump CACHE when files change so phones pick up the new version.
   ========================================================= */
const CACHE = 'leo306d1-treasury-v1.8';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css?v=1.8',
  './js/core.js?v=1.8',
  './js/ui.js?v=1.8',
  './js/auth.js?v=1.8',
  './js/views-auth.js?v=1.8',
  './js/views-dashboard.js?v=1.8',
  './js/views-clubs.js?v=1.8',
  './js/views-club.js?v=1.8',
  './js/files.js?v=1.8',
  './js/receipts.js?v=1.8',
  './js/views-reports.js?v=1.8',
  './js/views-payments.js?v=1.8',
  './js/views-settings.js?v=1.8',
  './js/views-users.js?v=1.8',
  './js/pwa.js?v=1.8',
  './js/main.js?v=1.8',
  './assets/logo.webp',
  './assets/logo-sm.webp',
  './assets/lions-intl.png',
  './assets/leo-logo.png',
  './assets/leo-mark-gold.webp',
  './assets/leo-mark-maroon.webp',
  './assets/favicon.png',
  './assets/icons/app-icon-192.png',
  './assets/icons/app-icon-512.png',
  './assets/icons/app-icon-maskable-512.png',
  './assets/icons/app-icon-apple-180.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: serve from cache, refresh in the background
  if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Page navigations: network first (fresh version), cached shell when offline
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put('./index.html', copy));
      return res;
    }).catch(() => caches.match('./index.html')));
    return;
  }

  // Everything else: cache first, then network (and cache it)
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
