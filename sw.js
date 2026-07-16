// Service worker: full offline cache
const CACHE = 'agenda-v13';
const ASSETS = [
  './',
  './index.html',
  './app.css?v=13',
  './js/i18n.js?v=13',
  './js/store.js?v=13',
  './js/trackers.js?v=13',
  './js/views.js?v=13',
  './js/goals.js?v=13',
  './js/sync.js?v=13',
  './js/app.js?v=13',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request, { ignoreSearch: false }).then(hit =>
      hit || fetch(e.request).then(res => {
        if (e.request.method === 'GET' && res.ok && new URL(e.request.url).origin === location.origin) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match('./index.html'))
    )
  );
});
