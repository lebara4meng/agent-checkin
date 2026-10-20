/*
 * Service worker — lets the installed app open without internet.
 * Bump VERSION whenever you upload a new index.html so phones pick up the update.
 */
const VERSION = 'v5';
const SHELL = `shell-${VERSION}`;
const LIBS = 'libs-v1';           // Tailwind, Leaflet, face models — rarely change
const SHELL_FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './maskable-512.png'];
const LIB_HOSTS = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL)
    .then(c => c.addAll(SHELL_FILES.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('shell-') && k !== SHELL).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // check-ins (POST) always go to the network
  const url = new URL(req.url);
  if (url.origin === location.origin && /\/admin[^/]*$/.test(url.pathname)) return;   // admin dashboard: always live
  if (url.hostname.endsWith('google.com') || url.hostname.endsWith('googleusercontent.com')) return;

  // The app page: try the network first (fresh version), fall back to the saved copy offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req, { cache: 'no-cache' }).then(res => {
        const copy = res.clone();
        caches.open(SHELL).then(c => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Libraries and face models: serve from cache, download once.
  if (LIB_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.open(LIBS).then(cache => cache.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
      })))
    );
    return;
  }

  // Our own files (icons, manifest): always try the latest from the server first,
  // so name/icon changes show up without editing this file; use the saved copy offline.
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req, { cache: 'no-cache' }).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req))
    );
  }
});
