// A page that stays open across an app update can lazily import() a kp-themes
// chunk that the new binary no longer serves (chunk names carry a content
// hash, so a changed module gets a new name and the old file is gone). The
// import rejects, and the component it was meant to load silently never
// appears. The honest fix is to run the new scripts: reload, once.
//
// Chosen over a worker-side cache fallback because the service worker drops
// the earlier release's cache on activation, so it would have nothing to
// serve; and the rest of the page's scripts are stale as well, so only a
// reload makes the page consistent again.
//
// A loop is impossible: a reload is allowed at most once per COOLDOWN_MS per
// tab (sessionStorage), so a chunk that is really broken fails visibly.

export const RELOAD_KEY = 'chassis-stale-import-reloaded';
export const COOLDOWN_MS = 60_000;

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

/** Reload once when a lazy import fails; safe to call more than once. */
export function guardStaleImports(win) {
    if (win.__chassisStaleImportGuard || typeof win.addEventListener !== 'function') return;
    win.__chassisStaleImportGuard = true;
    win.addEventListener('unhandledrejection', (event) => {
        if (!isFailedImport(event.reason)) return;
        let store = null;
        try {
            store = win.sessionStorage;
        } catch {
            // Blocked storage: no cooldown can be kept, so do not reload.
            console.warn('chassis: a script chunk failed to load and storage is blocked; reload the page.');
            return;
        }
        const now = Date.now();
        if (!mayReload(store, now)) return;
        store.setItem(RELOAD_KEY, String(now));
        console.warn('chassis: a script chunk is gone after an update; reloading once.', event.reason);
        win.location.reload();
    });
}
