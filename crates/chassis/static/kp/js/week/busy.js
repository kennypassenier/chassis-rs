// Holds the rows of a loading week and places its busy card.
/** @typedef {import('./types.js').WeekModel} WeekModel */

/**
 * In rows (below 40rem) a day is as tall as its items, so a week that loads again would fold every day shut and open
 * it again when the items come. Instead each day keeps the height it had while the week loads, and lets go of it only
 * once the items that end the load have arrived, so the same items move nothing; a first load starts from the days'
 * own height, as a data table's first load starts from its skeleton rows. In columns the days have a fixed height.
 * @param {WeekModel} c
 */
export function holdRows(c) {
    // The upcoming list holds as one [kpadopt3]; the day rows each hold their own.
    const boxes = c.upcoming.on && c.upcoming.list ? [c.upcoming.list] : c.cols.map((col) => col.track);
    if (c.state === 'loading') {
        // The list is held to the fraction of a pixel, so its 8 rows and its hold are the same height.
        if (c.held === null && c.mode === 'list')
            c.held = boxes.map((box) => (c.upcoming.on ? box.getBoundingClientRect().height : box.offsetHeight));
        if (c.held) for (const [i, box] of boxes.entries()) box.style.setProperty('--kp-week-hold', `${c.held[i] ?? 0}px`);
        return;
    }
    if (c.held === null) return;
    const held = c.held;
    const until = performance.now() + 6000;
    const win = c.el.ownerDocument.defaultView ?? window;
    const letGo = () => {
        if (c.held !== held || c.state === 'loading') return;
        // The upcoming list stands beside the grid, not in it: its arriving rows are looked for there [kpadopt3].
        const scope = c.upcoming.on && c.upcoming.list ? c.upcoming.list : c.grid;
        const busy = c.leaving || scope.querySelector('[data-kp-arriving], [data-kp-leaving], [data-kp-reversing]');
        if (busy && performance.now() < until) {
            win.requestAnimationFrame(letGo);
            return;
        }
        c.held = null;
        for (const box of boxes) box.style.removeProperty('--kp-week-hold');
    };
    // Two frames first: the arrivals are set going by the theme's watcher after this paint.
    win.requestAnimationFrame(() => win.requestAnimationFrame(letGo));
}

/**
 * Lays the busy layer over the days' columns (in rows, over the items' column), measured from the columns themselves:
 * the day heads and the hour axis stay readable beside it, as the data table's header stays above its layer.
 * @param {WeekModel} c
 */
export function placeBusy(c) {
    const layer = c.busy;
    if (!layer || !c.cols.length) return;
    const host = c.frame.getBoundingClientRect();
    const boxes = (c.upcoming.on && c.upcoming.list ? [c.upcoming.list] : c.cols.map((col) => col.track)).map((box) => box.getBoundingClientRect());
    const top = Math.min(...boxes.map((b) => b.top));
    const bottom = Math.max(...boxes.map((b) => b.bottom));
    const left = Math.min(...boxes.map((b) => b.left));
    const right = Math.max(...boxes.map((b) => b.right));
    layer.style.setProperty('--kp-busy-overlay-top', `${Math.max(0, Math.round(top - host.top))}px`);
    layer.style.setProperty('--kp-busy-overlay-bottom', `${Math.max(0, Math.round(host.bottom - bottom))}px`);
    layer.style.setProperty('--kp-busy-overlay-left', `${Math.max(0, Math.round(left - host.left))}px`);
    layer.style.setProperty('--kp-busy-overlay-right', `${Math.max(0, Math.round(host.right - right))}px`);
}
