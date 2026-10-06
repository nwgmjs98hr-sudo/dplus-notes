// Offline support. Everything the app needs (its own files, the Firebase SDK, the fonts stylesheet)
// is stored at install time and served from the cache first, so the app starts instantly offline
// or on a bad connection. A new release changes CACHE, the browser installs the new worker in the
// background and the page reloads once to use it.
// Other CDN files (fonts, the text scanner) are kept in RUNTIME, which survives app updates.
const CACHE = 'dplus-v9';
const RUNTIME = 'dplus-cdn';
const FB = 'https://www.gstatic.com/firebasejs/12.18.0/';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/util.js', 'js/store.js', 'js/editor.js',
  'js/rich.js', 'js/files.js', 'js/scan.js', 'js/ocr-worker.js', 'js/firebase.js', 'js/demo.js', 'js/config.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
const REMOTE = [FB + 'firebase-app.js', FB + 'firebase-auth.js', FB + 'firebase-firestore.js',
  'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap'];
const CDN = /^https:\/\/(www\.gstatic\.com\/firebasejs\/|fonts\.googleapis\.com\/|fonts\.gstatic\.com\/|cdn\.jsdelivr\.net\/npm\/)/;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })));
    // Firebase must be cached or the app cannot start offline; fonts are optional.
    for (const u of REMOTE) {
      try { const r = await fetch(u, { mode: 'cors', cache: 'reload' }); if (r.ok) await c.put(u, r); }
      catch (err) { if (u.startsWith(FB)) throw err; }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== RUNTIME).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const timeout = ms => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const own = url.origin === location.origin;
  if (!own && !CDN.test(req.url)) return; // Firestore and Auth traffic is left alone
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: own })
      || (req.mode === 'navigate' ? await caches.match('index.html') : null);
    if (hit) return hit;
    try {
      const res = await Promise.race([fetch(req), timeout(own ? 10000 : 60000)]);
      if (res && (res.ok || res.type === 'opaque')) (await caches.open(own ? CACHE : RUNTIME)).put(req, res.clone());
      return res;
    } catch {
      return Response.error();
    }
  })());
});
