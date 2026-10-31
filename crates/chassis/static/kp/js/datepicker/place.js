// Places an open calendar panel inside the window, raises it above its containers and measures the day view to hold.

import { placeBlockSide, raiseOverlay, raised } from '../top-layer.js';

/**
 * Keep an open calendar inside the window [Kenny's note of 2026-09-13]. The
 * panel hangs from the picker's inline start, so a picker near the inline
 * end of the window — the last filter of a data table — opened its calendar
 * past the edge: measured at x=1374 of a 1280px page. When it would cross
 * that edge it hangs from the picker's inline end instead and opens toward
 * the inline start; when that is worse (a picker narrower than its calendar
 * in a window narrower than both), the side that overflows less is kept.
 * `data-kp-align="end"` says which side was taken. A panel in the top layer
 * (js/top-layer.js) is placed in window coordinates under its picker; one
 * that is not keeps hanging from the picker and only the side changes.
 *
 * @param {HTMLElement} panel an open `.kp-datepicker__panel`
 */
export function placeDatePanel(panel) {
    delete panel.dataset.kpAlign;
    const width = document.documentElement.clientWidth;
    const rtl = getComputedStyle(panel).direction === 'rtl';
    /** How far past the window's inline-end edge a panel starting at x runs. @param {number} x @param {number} w */
    const pastEnd = (x, w) => (rtl ? -x : x + w - width);
    /** @param {number} x @param {number} w */
    const pastStart = (x, w) => (rtl ? x + w - width : -x);

    if (raised(panel)) {
        const anchor = (panel.closest('[data-kp-datepicker]') ?? panel.parentElement ?? panel).getBoundingClientRect();
        const w = panel.offsetWidth;
        const fromStart = rtl ? anchor.right - w : anchor.left;
        const fromEnd = rtl ? anchor.left : anchor.right - w;
        let x = fromStart;
        if (pastEnd(fromStart, w) > 0 && Math.max(0, pastStart(fromEnd, w)) <= pastEnd(fromStart, w)) {
            x = fromEnd;
            panel.dataset.kpAlign = 'end';
        }
        panel.style.left = `${Math.round(x)}px`;
        panel.style.top = `${Math.round(anchor.bottom)}px`;
        // Above the picker when the window has no room under it [fix-30].
        placeBlockSide(panel, anchor);
        return;
    }

    const start = panel.getBoundingClientRect();
    if (pastEnd(start.left, start.width) <= 0) return;
    panel.dataset.kpAlign = 'end';
    const end = panel.getBoundingClientRect();
    if (Math.max(0, pastStart(end.left, end.width)) > pastEnd(start.left, start.width)) delete panel.dataset.kpAlign;
}

/**
 * Open a calendar above every container it sits in (js/top-layer.js: a
 * card's clip-path cut every day of it away in four themes), inside the
 * window, and following its field while it is open. Both channels open
 * with it. Returns the way back down.
 *
 * @param {HTMLElement} panel an open `.kp-datepicker__panel`
 * @returns {() => void} lower
 */
export function raiseDatePanel(panel) {
    const lower = raiseOverlay(panel, placeDatePanel);
    return () => {
        lower();
        panel.style.removeProperty('left');
        panel.style.removeProperty('top');
        delete panel.dataset.kpAlign;
    };
}

/**
 * The size of the day view, to hold while the month or year grid shows, so
 * the panel does not jump under the pointer. Read as the computed sizes, in
 * each element's own box-sizing, so writing them back as minimums lands on
 * the same box whatever a register set.
 *
 * @param {HTMLElement} panel an open `.kp-datepicker__panel` showing days
 * @returns {{ inline: string, block: string, gridInline: string, gridBlock: string }}
 */
export function measureDateView(panel) {
    const grid = panel.querySelector('.kp-datepicker__grid');
    const own = getComputedStyle(panel);
    const cells = grid === null ? null : getComputedStyle(grid);
    return {
        inline: own.width,
        block: own.height,
        gridInline: cells?.width ?? 'auto',
        gridBlock: cells?.height ?? 'auto',
    };
}
