// Local database (feat-localdb-client-1): when a pull happens besides the
// ones that follow an own write: the timer (default 5 minutes, only while the
// page is visible), the connection coming back, the page getting focus or
// becoming visible, the band's retry, and the hints of the app's live
// channel (SSE, `shell/live.rs`): event `sync` names the changed collections,
// `resync` means "everything". Start-up pulls are the caller's.

/** The collections a `sync` hint names (`["dishes"]`, `{"collections":[..]}` or `dishes,freezer`); null = all. */
export function parseHint(text) {
    if (typeof text !== 'string' || text.trim() === '') return null;
    let value = text.trim();
    try {
        value = JSON.parse(value);
    } catch {
        value = value.split(',').map((s) => s.trim());
    }
    const list = Array.isArray(value) ? value : Array.isArray(value?.collections) ? value.collections : null;
    const names = list?.filter((n) => typeof n === 'string' && n !== '');
    return names?.length ? names : null;
}

/**
 * `fire(names | null)` runs the pull (null = every collection) and reports its
 * own failures. Returns the function that unbinds everything.
 */
export function bindTriggers({ win, doc, fire, pullMs, live = null, setTimer, clearTimer, warn = console.warn }) {
    const offs = [];
    const on = (target, name, fn) => {
        target.addEventListener(name, fn);
        offs.push(() => target.removeEventListener(name, fn));
    };
    const all = () => fire(null);

    on(win, 'online', all);
    on(win, 'focus', all);
    on(doc, 'visibilitychange', () => doc.visibilityState === 'visible' && all());
    on(doc, 'kp-connection-retry', all);

    let timer = null;
    const arm = () => {
        timer = setTimer(() => {
            if (!doc.hidden) all();
            arm();
        }, pullMs);
    };
    arm();
    offs.push(() => clearTimer(timer));

    if (live) {
        if (typeof win.EventSource !== 'function') {
            warn('chassisData.db: this browser has no EventSource; the live hints are skipped and the timer covers them.');
        } else {
            const source = new win.EventSource(live);
            source.addEventListener('sync', (e) => fire(parseHint(e.data)));
            source.addEventListener('resync', all);
            offs.push(() => source.close());
        }
    }
    return () => offs.forEach((off) => off());
}
