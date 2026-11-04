
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
    '/pwa/offline.css',
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
            const stale = await staleCachesNow();
            await Promise.all(stale.map((n) => caches.delete(n).catch(warn('drop a cache'))));
            await self.clients.claim();
            const pages = await self.clients.matchAll({ type: 'window' });
            for (const page of pages) page.postMessage(activationMessage(CACHE, stale));
        })(),
    );
});

// The earlier releases' caches; an unreadable cache storage means none.
async function staleCachesNow() {
    try {
        return staleCaches(await caches.keys(), CACHE);
    } catch (err) {
        warn('list the caches')(err);
        return [];
    }
}

// A cache fault never reaches the page: it is logged here and the network
// answers instead (fix-sw-first-1).
function warn(what) {
    return (err) => console.warn(`chassis: service worker could not ${what}:`, err);
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (isLogoutRequest({ url: req.url, origin: self.location.origin })) {
        event.waitUntil(Promise.all([purgePrivate(), purgeAppData()]));
        return;
    }
    const wanted = isCacheableRequest({
        method: req.method,
        url: req.url,
        origin: self.location.origin,
        hasRange: req.headers.has('range'),
        accept: req.headers.get('accept') || '',
        mode: req.mode,
        destination: req.destination,
    });
    if (wanted) event.respondWith(answer(event, req));
});

// The answer never rejects (fix-sw-icon-1, Kitchen C2): a rejected
// respondWith is the "ServiceWorker intercepted the request and encountered
// an unexpected error" line in the console. When the network-first answer
// and the plain fetch both fail (a browser icon load the page left, or the
// network dropped between the two), a quiet 504 stands in.
async function answer(event, req) {
    try {
        return await networkFirst(event, req);
    } catch (err) {
        warn('answer')(err);
    }
    try {
        return await fetch(req);
    } catch (err) {
        if (!req.signal?.aborted) warn('fetch after a failed answer')(err);
        return gatewayTimeout();
    }
}

function gatewayTimeout() {
    return new Response(null, { status: 504, statusText: 'Gateway Timeout', headers: { 'X-Chassis-Offline': '1' } });
}

async function openCache() {
    try {
        return await caches.open(CACHE);
    } catch (err) {
        warn('open its cache')(err);
        return null;
    }
}

async function networkFirst(event, req) {
    const cache = await openCache();
    try {
        const res = await fetch(req);
        if (cache && isCacheableResponse(res)) event.waitUntil(store(cache, req, res.clone()).catch(warn('store a copy')));
        return res;
    } catch (err) {
        const hit = cache ? await cache.match(req).catch(() => undefined) : undefined;
        if (hit) return hit;
        if (req.mode === 'navigate') return offlinePage(cache);
        // The page gave the request up: nobody reads the answer, so no error.
        if (req.signal?.aborted) return gatewayTimeout();
        return Response.error();
    }
}

// A logout leaves no page or private file in browser storage: offline, the
// next person at this device would otherwise read the last page that was open.
async function purgePrivate() {
    const cache = await caches.open(CACHE);
    for (const key of await cache.keys()) {
        if (!survivesLogout(new URL(key.url).pathname)) await cache.delete(key);
    }
}

// ... and the same for the offline app data client (chassis-data.js): its
// databases are named `chassis-data:<app>`. The page purges them first; this
// covers a logout that left the page before that finished.
async function purgeAppData() {
    if (!self.indexedDB?.databases) return;
    for (const db of await self.indexedDB.databases()) {
        if (isAppDataDb(db.name)) self.indexedDB.deleteDatabase(db.name);
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
    const page = cache ? await cache.match(OFFLINE_URL).catch(() => undefined) : undefined;
    const body = page ? await page.text() : '<!doctype html><title>Offline</title><p>You are offline.</p>';
    return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Chassis-Offline': '1' },
    });
}
