// The pure decisions of the service worker (feat-webapp-4): which requests
// may be answered from or stored in the cache, what a cache is called and
// which ones a new release drops. No browser API is touched here, so a node
// test runs these functions as they are; sw.js (the browser part) is
// appended after this file by the server.
//
// The rule behind all of it: the cache is a way to show the last page while
// offline, never a way to show an old page while online. Anything that is
// not a plain, complete 200 from this origin stays out of it.

const CACHE_PREFIX = 'chassis-pwa-';
const MAX_ENTRIES = 200;

// Paths that are never cached: the JSON API (data must be live), the login
// and logout (a cached login page would outlive the session), and the
// worker itself.
const NEVER_CACHED = ['/api', '/login', '/logout', '/sw.js', '/manifest.webmanifest'];

// What the worker may keep, as an allow-list (fix-swcache-1): pages the user
// navigates to, and the app's static files. Everything else, above all the
// app's own JSON data (e.g. /data/tasks.json), goes straight to the network:
// a cached answer would linger in browser storage and show a stale snapshot
// offline (Habits: an item added offline later duplicated).
const ASSET_PREFIXES = ['/static/', '/pwa/'];
const ASSET_EXTENSIONS = new Set([
    'js', 'mjs', 'css', 'map', 'woff2', 'ttf', 'png', 'svg', 'ico',
    'jpg', 'jpeg', 'webp', 'gif', 'webmanifest',
]);

/** Whether the request loads a page: a navigation, a document or an HTML Accept. */
function isNavigation({ mode = '', destination = '', accept = '' }) {
    return mode === 'navigate' || destination === 'document' || accept.includes('text/html');
}

/** Whether the path is one of the kit's or the app's static files. */
function isAssetPath(pathname) {
    if (ASSET_PREFIXES.some((p) => pathname.startsWith(p))) return true;
    const name = pathname.slice(pathname.lastIndexOf('/') + 1);
    const dot = name.lastIndexOf('.');
    return dot > 0 && ASSET_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/** The cache's name: it changes with the kit's assets and with the app. */
function cacheNameFor(kitVersion, appVersion) {
    return `${CACHE_PREFIX}${kitVersion}-${appVersion}`;
}

/** The caches of this worker family that are not the current one. */
function staleCaches(names, current) {
    return names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== current);
}

/**
 * Whether the worker handles this request at all (else the browser does):
 * only pages and static files (see the allow-list above).
 * An event stream is never handled: a never-ending response routed through
 * the worker's own fetch() held a connection per page, and Firefox stopped
 * loading pages after six (Habits, 2026-11-01).
 */
function isCacheableRequest({ method, url, origin, hasRange, accept = '', mode = '', destination = '' }) {
    if (method !== 'GET' || hasRange) return false;
    if (accept.includes('text/event-stream')) return false;
    let u;
    try {
        u = new URL(url);
    } catch {
        return false;
    }
    if (u.origin !== origin) return false;
    if (NEVER_CACHED.some((p) => u.pathname === p || u.pathname.startsWith(`${p}/`))) return false;
    return isNavigation({ mode, destination, accept }) || isAssetPath(u.pathname);
}

/**
 * Whether a response may be stored: a complete 200 of this origin that was
 * not reached through a redirect (a 303 to /login followed by the browser
 * would otherwise store the login page under the page's own URL), is not an
 * event stream and does not forbid storing. `res` needs status, type,
 * redirected and headers.get.
 */
function isCacheableResponse(res) {
    if (res.status !== 200 || res.type !== 'basic' || res.redirected) return false;
    const type = res.headers.get('content-type') || '';
    if (type.startsWith('text/event-stream') || type.includes('application/json')) return false;
    const control = (res.headers.get('cache-control') || '').toLowerCase();
    return !control.includes('no-store') && !control.includes('private');
}

/** The oldest keys beyond `max`, in the order the cache lists them. */
function surplusKeys(keys, max = MAX_ENTRIES) {
    return keys.length > max ? keys.slice(0, keys.length - max) : [];
}

if (typeof module !== 'undefined') {
    module.exports = { cacheNameFor, staleCaches, isCacheableRequest, isCacheableResponse, surplusKeys };
}
