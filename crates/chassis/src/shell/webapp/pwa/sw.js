
// The browser part of the service worker (feat-webapp-4). Network first for
// everything it handles: a page, a script or a stylesheet comes from the
// server whenever the server answers, and the cache only fills in when the
// network fails. KIT_VERSION and APP_VERSION are put in front of this file
// by the server, so a new release gets a new cache name and the activate
// step drops the old ones.

const CACHE = cacheNameFor(KIT_VERSION, APP_VERSION);
const OFFLINE_URL = '/pwa/offline';
const PRECACHE = [
    OFFLINE_URL,
    '/pwa/offline.js',
    `/static/kp/dist/kp-themes.css?v=${KIT_VERSION}`,
    `/static/kp/css/fonts.css?v=${KIT_VERSION}`,
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
    );
});

// Drop the caches of earlier releases, take the open pages over and tell
// them. The page reloads at most once per release (pwa-register.js), so the
// message cannot start a loop.
self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const names = await caches.keys();
            await Promise.all(staleCaches(names, CACHE).map((n) => caches.delete(n)));
            await self.clients.claim();
            const pages = await self.clients.matchAll({ type: 'window' });
            for (const page of pages) page.postMessage({ type: 'chassis-sw-activated', version: CACHE });
        })(),
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    const wanted = isCacheableRequest({
        method: req.method,
        url: req.url,
        origin: self.location.origin,
        hasRange: req.headers.has('range'),
    });
    if (wanted) event.respondWith(networkFirst(event, req));
});

async function networkFirst(event, req) {
    const cache = await caches.open(CACHE);
    try {
        const res = await fetch(req);
        if (isCacheableResponse(res)) event.waitUntil(store(cache, req, res.clone()));
        return res;
    } catch (err) {
        const hit = await cache.match(req);
        if (hit) return hit;
        if (req.mode === 'navigate') return offlinePage(cache);
        return Response.error();
    }
}

async function store(cache, req, res) {
    await cache.put(req, res);
    const extra = surplusKeys(await cache.keys());
    await Promise.all(extra.map((k) => cache.delete(k)));
}

// The offline page, marked so the page's own retry can tell it from a real
// answer.
async function offlinePage(cache) {
    const page = await cache.match(OFFLINE_URL);
    const body = page ? await page.text() : '<!doctype html><title>Offline</title><p>You are offline.</p>';
    return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Chassis-Offline': '1' },
    });
}
