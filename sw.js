const CACHE_NAME = 'smbg-cache-v1';
const ASSETS_TO_CACHE = [
  './index.html',
  './style.css',
  './app.js',
  './config.js',
  './manifest.json',
  './icon.svg',
  './icon-maskable.svg',
  './icon_192.png',
  './icon_512.png'
];

// Install Event - Pre-cache Static Assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching static assets');
      // Using cache.addAll with individual catch block or robust handling
      return Promise.all(
        ASSETS_TO_CACHE.map((url) => {
          return cache.add(url).catch((err) => {
            console.error(`[Service Worker] Failed to cache asset: ${url}`, err);
          });
        })
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Serve cached assets when offline, otherwise fetch from network
self.addEventListener('fetch', (event) => {
  // Only intercept local HTTP/HTTPS GET requests
  if (!event.request.url.startsWith(self.location.origin) || event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached version immediately, but fetch and update cache in background
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
            }
          })
          .catch(() => {/* Ignore background sync/network errors */});
        return cachedResponse;
      }

      // Fallback to network
      return fetch(event.request).catch((err) => {
        // If offline and request is for navigation, return cached home page index.html
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        throw err;
      });
    })
  );
});
