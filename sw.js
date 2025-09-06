// /sw.js — PWA service worker
const VERSION = "coach-v1";
const STATIC_CACHE = `static-${VERSION}`;
const PAGES_CACHE  = `pages-${VERSION}`;
const API_CACHE    = `api-${VERSION}`;

const APP_SHELL = [
  "/", "/frontend/coaching.html", "/frontend/coaching.js",
  "/manifest.webmanifest"
];

self.addEventListener("install", (evt) => {
  evt.waitUntil(caches.open(STATIC_CACHE).then(c => c.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (evt) => {
  evt.waitUntil((async () => {
    const keep = new Set([STATIC_CACHE, PAGES_CACHE, API_CACHE]);
    for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

function isAPI(url) {
  return url.origin === location.origin && /\/api\/(coach|coaching-notices)/.test(url.pathname);
}

self.addEventListener("fetch", (evt) => {
  const req = evt.request;
  const url = new URL(req.url);

  if (isAPI(url) && req.method === "GET") {
    evt.respondWith((async () => {
      try {
        const net = await fetch(req);
        const clone = net.clone();
        (await caches.open(API_CACHE)).put(req, clone);
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

  if (req.mode === "navigate") {
    evt.respondWith((async () => {
      try {
        const net = await fetch(req);
        (await caches.open(PAGES_CACHE)).put(req, net.clone());
        return net;
      } catch {
        return (await caches.match("/frontend/coaching.html")) ||
               new Response("<h1>Offline</h1>", { headers: { "Content-Type":"text/html" } });
      }
    })());
  }
});
