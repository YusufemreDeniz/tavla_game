/**
 * App shell service worker.
 * API, SignalR ve oyun state'i asla cache'lenmez; yalnızca statik kabuk saklanır.
 */
const CACHE_NAME = 'kiztavlasi-shell-v1';
const SHELL_URLS = ['/', '/manifest.webmanifest', '/icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API, hub ve health istekleri asla cache'ten dönmez.
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/hubs') ||
    url.pathname.startsWith('/health') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && (url.pathname.startsWith('/assets') || SHELL_URLS.includes(url.pathname))) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(
          (cached) =>
            cached ??
            caches.match('/').then(
              (shell) =>
                shell ??
                new Response('Bağlantı kesildi. Oyun durumu korunuyor, yeniden bağlanılıyor.', {
                  status: 503,
                  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                }),
            ),
        ),
      ),
  );
});
