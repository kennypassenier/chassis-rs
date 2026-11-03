// A page that stays open across an app update can lazily import() a kp-themes
// chunk that the new binary no longer serves (chunk names carry a content
// hash, so a changed module gets a new name and the old file is gone). The
// import rejects, and the component it was meant to load silently never
// appears. The honest fix is to run the new scripts: reload, once.
//
// Chosen over a worker-side cache fallback because the service worker drops
// the earlier release's cache on activation, and only holds files the page
// already fetched, so it would have nothing to serve for a chunk not yet
// imported; and the rest of the page's scripts are stale as well, so only a
// reload makes the page consistent again.
//
// Two ways in. The `unhandledrejection` listener covers an import nobody
// catches. `guardImport(import(...))` covers an import whose caller catches
// the failure itself (the Status page logs it and carries on, which left
// "Loading failed for the module version-delta.js" in the console and the
// page half drawn): the kit's own import sites wrap their import in it.
//
// Reload::Ask: a page whose app chose the moment itself (an installed web
// app, data-chassis-reload="ask") is not reloaded here. The guard fires the
// same `chassis-pwa-update` event as a new release and the app's prompt
// reloads through `detail.apply()`.
//
// A loop is impossible: a reload is allowed at most once per COOLDOWN_MS per
// tab (sessionStorage), so a chunk that is really broken fails visibly.

export const RELOAD_KEY = 'chassis-stale-import-reloaded';
export const COOLDOWN_MS = 60_000;
export const UPDATE_EVENT = 'chassis-pwa-update';
export const STALE_VERSION = 'stale-chunk';
const STATE = '__chassisStaleImportGuard';

// What browsers say when a dynamic import cannot be fetched: Chrome "Failed
// to fetch dynamically imported module", Firefox "error loading dynamically
// imported module", Safari "Importing a module script failed".
const FAILED_IMPORT = /dynamically imported module|importing a module script failed/i;

/** Whether a rejection reason is a failed dynamic import. */
export function isFailedImport(reason) {
    const text = typeof reason === 'string' ? reason : reason?.message;
    return typeof text === 'string' && FAILED_IMPORT.test(text);
}

/** Whether the tab may reload now: not already done within the cooldown. */
export function mayReload(store, now) {
    const last = Number(store?.getItem(RELOAD_KEY));
    return !(Number.isFinite(last) && last > 0 && now - last < COOLDOWN_MS);
}

/** The tab's sessionStorage, or null when the browser blocks it. */
function tabStore(win) {
    try {
        return win.sessionStorage;
    } catch {
        return null;
    }
}

/** Hand the reload to the app's prompt, once; `apply()` reloads and starts the cooldown. */
function askToReload(win, state, store, reason) {
    if (state.asked) return;
    state.asked = true;
    console.warn('chassis: a script chunk is gone after an update; asking before reloading.', reason);
    const apply = () => {
        store.setItem(RELOAD_KEY, String(Date.now()));
        win.location.reload();
    };
    const Event = win.CustomEvent ?? CustomEvent;
    win.dispatchEvent(new Event(UPDATE_EVENT, { detail: { version: STALE_VERSION, apply } }));
}

/** What to do about a failed dynamic import: reload once, or ask in `ask` mode. */
function onFailedImport(win, state, reason) {
    if (!isFailedImport(reason)) return;
    const store = tabStore(win);
    if (!store) {
        // Blocked storage: no cooldown can be kept, so do not reload.
        console.warn('chassis: a script chunk failed to load and storage is blocked; reload the page.');
        return;
    }
    if (!mayReload(store, Date.now())) return;
    if (state.ask) return askToReload(win, state, store, reason);
    store.setItem(RELOAD_KEY, String(Date.now()));
    console.warn('chassis: a script chunk is gone after an update; reloading once.', reason);
    win.location.reload();
}

/**
 * Watch for failed lazy imports; safe to call more than once. A later call
 * may switch on `{ ask: true }` (pwa-register.js knows the mode, boot-kit.js
 * runs first and does not).
 */
export function guardStaleImports(win, { ask = false } = {}) {
    const known = win[STATE];
    if (known) {
        known.ask ||= ask;
        return;
    }
    if (typeof win.addEventListener !== 'function') return;
    const state = { ask, asked: false, handle: (reason) => onFailedImport(win, state, reason) };
    win[STATE] = state;
    win.addEventListener('unhandledrejection', (event) => state.handle(event.reason));
}

/**
 * Pass a dynamic import through the guard and return it unchanged: a failed
 * one is reported to the guard and still rejects for the caller.
 */
export function guardImport(promise, win = globalThis) {
    return promise.catch((reason) => {
        win[STATE]?.handle(reason);
        throw reason;
    });
}
