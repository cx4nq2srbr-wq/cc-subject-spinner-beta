const CACHE_NAME = 'cc-spinner-v4.0.33 beta'; // Bumped version to trigger this new update!
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './data.js',
  './manifest.json',
  './icon.png'
];

// 1. Install (Aggressive Update: Force the new version to skip the waiting room!)
self.addEventListener('install', (event) => {
  self.skipWaiting(); // THE FIX: Instantly take over!
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// 2. Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing Old Cache');
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim()) // Immediately control the open pages
  );
});

// 3. Network-First Strategy
// This checks the internet for the new HTML first. If offline, it uses the cache.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});