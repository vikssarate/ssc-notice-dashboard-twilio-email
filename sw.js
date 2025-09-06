// /sw.js  — PWA service worker
const VERSION = "v7";                          // bump to force update
const STATIC_CACHE = `static-${VERSION}`;
const PAGES_CACHE  = `pages-${VERSION}`;
const API_CACHE    = `api-${VERSION}`;

// Include both root and /frontend files so either layout works
const APP_SHELL = [
  "/", "/index.html", "/app.js", "/manifest.webmanifest",
  "/frontend/index.html", "/frontend/app.js", "/frontend/manifest.webmanifest"
];

// ---------- install ----------
self.addEventListener("install", (evt) => {
  evt.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

// ---------- activate ----------
self.addEventListener("activate", (evt) => {
  evt.waitUntil((async () => {
    const keep = new Set([STATIC_CACHE, PAGES_CACHE, API_CACHE]);
    for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

function isAPI(url) {
  return url.origin === location.origin &&
    (/\/api\/coach/.test(url.pathname) || /\/api\/coaching-notices/.test(url.pathname));
}
function isStatic(req) {
  return req.method === "GET" &&
         req.destination && ["script","style","image","font"].includes(req.destination);
}

// Limit cache size (simple LRU-ish)
async function trimCache(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  while (keys.length > max) {
    await c.delete(keys[0]);
    keys.shift();
  }
}

// ---------- fetch ----------
self.addEventListener("fetch", (evt) => {
  const req = evt.request;
  const url = new URL(req.url);

  // 1) API: network-first, fallback to cache
  if (isAPI(url) && req.method === "GET") {
    evt.respondWith((async () => {
      try {
        const net = await fetch(req);
        const clone = net.clone();
        const cache = await caches.open(API_CACHE);
        cache.put(req, clone);
        trimCache(API_CACHE, 120);
        return net;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        return new Response(JSON.stringify({ ok:false, offline:true }), {
          headers: { "Content-Type":"application/json" }, status: 503
        });
      }
    })());
    return;
  }

  // 2) Static assets: stale-while-revalidate
  if (isStatic(req)) {
    evt.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(req);
      const fetchPromise = fetch(req).then((res) => {
        cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })());
    return;
  }

  // 3) Navigations (app shell): network-first, offline fallback to cached index
  if (req.mode === "navigate") {
    evt.respondWith((async () => {
      try {
        const net = await fetch(req);
        const cache = await caches.open(PAGES_CACHE);
        cache.put(req, net.clone());
        trimCache(PAGES_CACHE, 30);
        return net;
      } catch {
        return (
          (await caches.match("/index.html")) ||
          (await caches.match("/frontend/index.html")) ||
          new Response("<h1>Offline</h1>", { headers: { "Content-Type":"text/html" } })
        );
      }
    })());
  }
});

// allow immediate activation
self.addEventListener("message", (evt) => {
  if (evt.data && evt.data.type === "SKIP_WAITING") self.skipWaiting();
});
