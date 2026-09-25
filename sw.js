const CACHE_NAME = 'aipp-ios-offline-v14';
const LOCAL_FILES = [
  './', './index.html', './styles.css', './app.js', './manifest.webmanifest',
  './apple-touch-icon.png', './icon-192.png', './icon-512.png'
];
const XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(LOCAL_FILES.map(url => cache.add(url)));
    // Cache SheetJS while online so Excel import also works later offline.
    try { await cache.add(new Request(XLSX_CDN, {mode:'cors'})); } catch (_) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const req = event.request;
  const url = new URL(req.url);

  // Navigation: network first for updates, cached app shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', fresh.clone()).catch(()=>{});
        return fresh;
      } catch (_) {
        return (await caches.match('./index.html')) || (await caches.match('./'));
      }
    })());
    return;
  }

  // App assets + SheetJS: cache first for fast/offline use, refresh in background.
  if (url.origin === self.location.origin || req.url === XLSX_CDN) {
    event.respondWith((async () => {
      const cached = await caches.match(req, {ignoreSearch:true});
      const network = fetch(req).then(async response => {
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, response.clone()).catch(()=>{});
        }
        return response;
      }).catch(()=>null);
      if (cached) { event.waitUntil(network); return cached; }
      return (await network) || Response.error();
    })());
  }
});
