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

/** The cache's name: it changes with the kit's assets and with the app. */
function cacheNameFor(kitVersion, appVersion) {
    return `${CACHE_PREFIX}${kitVersion}-${appVersion}`;
}

/** The caches of this worker family that are not the current one. */
function staleCaches(names, current) {
    return names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== current);
}

/** Whether the worker handles this request at all (else the browser does). */
function isCacheableRequest({ method, url, origin, hasRange }) {
    if (method !== 'GET' || hasRange) return false;
    let u;
    try {
        u = new URL(url);
    } catch {
        return false;
    }
    if (u.origin !== origin) return false;
    return !NEVER_CACHED.some((p) => u.pathname === p || u.pathname.startsWith(`${p}/`));
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
    if (type.startsWith('text/event-stream')) return false;
    const control = (res.headers.get('cache-control') || '').toLowerCase();
    return !control.includes('no-store');
}

/** The oldest keys beyond `max`, in the order the cache lists them. */
function surplusKeys(keys, max = MAX_ENTRIES) {
    return keys.length > max ? keys.slice(0, keys.length - max) : [];
}

if (typeof module !== 'undefined') {
    module.exports = { cacheNameFor, staleCaches, isCacheableRequest, isCacheableResponse, surplusKeys };
}
