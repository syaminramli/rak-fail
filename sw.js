// Service worker for the three apps: works offline and receives files from Android's Share menu.
const CACHE = 'rak-v1';
const PAGES = ['./', 'index.html', 'pdf.html', 'video.html', 'rak.webmanifest', 'pdf.webmanifest', 'video.webmanifest',
  'icons/rak-192.png', 'icons/pdf-192.png', 'icons/video-192.png'];
const CDN = /^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PAGES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function kvPut(key, val){
  return new Promise((ok, no) => {
    const o = indexedDB.open('rakfail', 1);
    o.onupgradeneeded = () => o.result.createObjectStore('kv');
    o.onerror = () => no(o.error);
    o.onsuccess = () => { const r = o.result.transaction('kv', 'readwrite').objectStore('kv').put(val, key); r.onsuccess = () => ok(); r.onerror = () => no(r.error); };
  });
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  // Share target: keep the shared files, then open the same page normally
  if (req.method === 'POST' && url.searchParams.has('share')){
    e.respondWith((async () => {
      const files = (await req.formData()).getAll('files').filter(f => typeof f !== 'string');
      await kvPut('shared', {t: Date.now(), files});
      return Response.redirect(url.pathname + '?shared=1', 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;
  // Versioned libraries and fonts: cache first
  if (CDN.test(req.url)){
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque'){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  // Our own pages: network first so updates show up, cache when offline
  if (url.origin === location.origin){
    e.respondWith(fetch(req).then(res => {
      if (res.ok && !url.search){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, {ignoreSearch: true})));
  }
});
