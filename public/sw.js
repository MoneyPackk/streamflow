const CACHE = 'peacocks-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/css/tokens.css',
  '/css/reset.css',
  '/css/nav.css',
  '/css/hero.css',
  '/css/cards.css',
  '/css/player.css',
  '/css/auth.css',
  '/css/profile.css',
  '/css/utils.css',
  '/js/app.js',
  '/js/api.js',
  '/js/auth.js',
  '/js/home.js',
  '/js/player.js',
  '/js/search.js',
  '/js/social.js',
  '/js/profile.js',
  '/js/ui.js',
  '/js/storage.js',
  '/js/templates.js',
  '/images/peacock-tiny.png',
  '/images/peacock-user.png',
  '/images/peacock-pfp.png',
  '/images/peacock-watermark.png',
  '/manifest.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/api/')) return;
  event.respondWith(
    caches.match(event.request).then(cached =>
      cached || fetch(event.request).then(response => {
        if (response.ok && event.request.url.startsWith(self.location.origin)) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
    )
  );
});
