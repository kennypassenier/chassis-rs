// Fits the strip to its width and measures its edges.
import { getStrings } from '../strings.js';
import { CELL } from './constants.js';
import { uptimeFit } from './figures.js';
import { SPECS, UNPINNED } from './state.js';

/**
 * Show the latest cells that fit (or all of them, scrolling, with `data-kp-uptime-fit="scroll"`) and write the axis.
 * @param {HTMLElement} el
 */
export function fit(el) {
    const spec = SPECS.get(el) ?? {};
    const track = /** @type {HTMLElement | null} */ (el.querySelector(':scope > .kp-uptime__track'));
    if (!track) return;
    const s = getStrings();
    const cells = /** @type {HTMLElement[]} */ ([...track.children]);
    const periods = spec.periods ?? [];
    const scroll = el.dataset.kpUptimeFit === 'scroll';
    const style = getComputedStyle(track);
    const min = Number.parseFloat(style.getPropertyValue('--kp-uptime-cell-min')) || 4;
    const gap = Number.parseFloat(style.columnGap) || 0;
    const n = scroll ? cells.length : uptimeFit(cells.length, track.clientWidth, min, gap);
    const firstShown = cells.length - n;
    let moved = false;
    cells.forEach((cell, i) => {
        const hide = i < firstShown;
        if (cell.hidden !== hide) {
            cell.hidden = hide;
            moved = true;
        }
    });
    if (moved) {
        const focusable = cells.filter((c) => !c.hidden && c.tabIndex === 0);
        if (focusable.length === 0) {
            const last = cells.at(-1);
            if (last && last.matches(CELL)) last.tabIndex = 0;
        }
        for (const c of cells) if (c.hidden && c.tabIndex === 0) c.tabIndex = -1;
    }
    track.style.setProperty('--kp-uptime-cells', String(n));
    // A scrolling strip stays at the latest period until the reader scrolls away from it.
    if (scroll && !UNPINNED.has(el)) track.scrollLeft = track.scrollWidth;

    const from = el.querySelector('.kp-uptime__from');
    const to = el.querySelector('.kp-uptime__to');
    const shown = el.querySelector('.kp-uptime__shown');
    const state = el.dataset.kpUptimeState;
    const real = state === 'ready' && periods.length > 0;
    if (from) from.textContent = real ? (firstShown === 0 && spec.from ? spec.from : (periods[firstShown]?.label ?? '')) : (spec.from ?? '');
    if (to) to.textContent = spec.to ?? (real ? (periods.at(-1)?.label ?? '') : '');
    if (shown) shown.textContent = real && !scroll && firstShown > 0 ? s.uptimeShown(n, cells.length) : '';
    if (scroll) edges(el, track);
}

/**
 * Mark the side a scrolling strip has more periods on, so the stylesheet fades that edge.
 * @param {HTMLElement} el @param {HTMLElement} track
 */
export function edges(el, track) {
    const max = track.scrollWidth - track.clientWidth;
    el.toggleAttribute('data-kp-uptime-before', track.scrollLeft > 1);
    el.toggleAttribute('data-kp-uptime-after', track.scrollLeft < max - 1);
}
