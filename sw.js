// Service worker: full offline cache
const CACHE = 'agenda-v26';
const ASSETS = [
  './',
  './index.html',
  './app.css?v=26',
  './js/i18n.js?v=26',
  './js/store.js?v=26',
  './js/trackers.js?v=26',
  './js/views.js?v=26',
  './js/goals.js?v=26',
  './js/sync.js?v=26',
  './js/app.js?v=26',
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
  // La PÁGINA siempre se pide primero a la red (si hay). Antes se servía desde
  // la caché y un dispositivo podía quedarse pegado en una versión vieja.
  // Sin internet, sigue funcionando con la copia guardada.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put('./index.html', clone));
        return res;
      }).catch(() => caches.match('./index.html').then(hit => hit || caches.match('./')))
    );
    return;
  }
  // El resto (js, css, íconos) va con caché primero: ya lleva ?v= en la URL,
  // así que una versión nueva pide archivos con nombre distinto.
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
