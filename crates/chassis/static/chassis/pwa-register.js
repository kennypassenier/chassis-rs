// Registers the service worker of an installable web app (feat-webapp-4).
// Loaded by webapp-runtime.js, so it is in every page the file server
// serves, under the CSP's `script-src 'self'`.
//
// A page registers only when it links the kit's manifest: the server adds
// that link exactly when the app is installable, so an app that opted out
// (or a page that never had the link) registers nothing.
//
// A new release activates its worker at once and tells the open pages. A
// page that was already controlled when it loaded reloads once, so it runs
// the new scripts; the release it reloaded for is remembered for the tab,
// so the message can never start a loop.

export const MANIFEST_HREF = '/manifest.webmanifest';
export const WORKER_URL = '/sw.js';
const RELOADED_KEY = 'chassis-sw-reloaded';

/** Whether the page links the kit's manifest. */
export function linksManifest(doc) {
    return doc.querySelector(`link[rel="manifest"][href="${MANIFEST_HREF}"]`) !== null;
}

/**
 * Whether a worker message means "reload now": it announces an activation,
 * the page was already controlled when it loaded (a first install needs no
 * reload) and this tab has not reloaded for that release yet.
 */
export function shouldReload({ hadController, message, lastReloaded }) {
    if (!message || message.type !== 'chassis-sw-activated') return false;
    return hadController && message.version !== lastReloaded;
}

/** Register the worker and wire the one-reload-per-release rule. */
export function registerPwa(win, doc, nav = win.navigator) {
    if (!nav?.serviceWorker || typeof doc.querySelector !== 'function' || !linksManifest(doc)) return null;
    const hadController = Boolean(nav.serviceWorker.controller);
    const store = (() => {
        try {
            return win.sessionStorage;
        } catch {
            return null; // blocked storage: reload at most once per page load instead
        }
    })();
    let reloaded = false;
    nav.serviceWorker.addEventListener('message', (event) => {
        const lastReloaded = store?.getItem(RELOADED_KEY) ?? (reloaded ? event.data?.version : null);
        if (!shouldReload({ hadController, message: event.data, lastReloaded })) return;
        reloaded = true;
        store?.setItem(RELOADED_KEY, event.data.version);
        win.location.reload();
    });
    return nav.serviceWorker.register(WORKER_URL, { scope: '/' }).catch((err) => {
        console.warn('chassis: the service worker could not be registered:', err);
    });
}
