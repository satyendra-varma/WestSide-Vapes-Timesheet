/* WestSide Vapes service worker (DECISIONS D-040).
 *
 * Caches ONLY the app's own static files (the HTML shell, hashed JS/CSS bundles, icons, manifest) so the
 * app opens on a flaky connection. It never caches or even touches:
 *   - any non-GET request (every API call, including customer requests, is a POST),
 *   - any other origin (the Apps Script backend, the mock backend, fonts, anything),
 *   - anything that looks like an API URL (/exec, ?action=) as a second safety net.
 * No timesheet, roster, employee or customer data ever goes into the cache.
 */
const CACHE = 'wsv-static-v1';
const SCOPE = new URL(self.registration ? self.registration.scope : './', self.location.href).pathname;

function isApiLike(url) {
  return /\/exec(\/|$)/.test(url.pathname) || url.searchParams.has('action') ||
    /(^|\.)script\.google\.com$|(^|\.)googleusercontent\.com$/.test(url.hostname);
}

function isStaticAsset(url) {
  return url.pathname.startsWith(SCOPE + 'assets/') || url.pathname.startsWith(SCOPE + 'icons/') ||
    url.pathname === SCOPE + 'manifest.webmanifest';
}

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

function cacheIfOk(request, response) {
  if (response && response.ok && response.type === 'basic') {
    var copy = response.clone();
    caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
  }
  return response;
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isApiLike(url)) return;
  if (!url.pathname.startsWith(SCOPE)) return;

  if (request.mode === 'navigate') {
    // Network first so a new deploy is picked up; the cached shell is only a fallback when offline.
    event.respondWith(
      fetch(request)
        .then(function (response) { return cacheIfOk(new Request(SCOPE), response); })
        .catch(function () {
          return caches.match(new Request(SCOPE)).then(function (cached) { return cached || Response.error(); });
        })
    );
    return;
  }

  if (isStaticAsset(url)) {
    // Hashed bundles never change, so cache first.
    event.respondWith(
      caches.match(request).then(function (cached) {
        return cached || fetch(request).then(function (response) { return cacheIfOk(request, response); });
      })
    );
  }
});
