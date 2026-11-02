// The narrow bar of a control without its own freshness line [ux-1101 round 2]: under 30rem of the control's own width (not the
// window's, so a phone-wide card on a desktop folds too) a `data-kp-refresh-line="off"` control lays its bar on two rows: a caption
// ("Refresh automatically", or the bar's own title or label) with Refresh now on the first, and every choice on a row of its own
// under them, as segments on one line that scroll sideways with a fade on the side that has more, the current one brought into view.
// The menu look gives way to those segments while the bar is narrow, so a phone reaches every choice in one tap; it comes back above
// the width. `data-kp-refresh-stack` steers it as it steers the folded bar: `auto` (default) by width, `always` at any width,
// `never` not at all. The approved bar (`data-kp-refresh-line` absent or `on`) is untouched.

import { getStrings } from '../strings.js';
import { make } from './bar.js';

/** Written on the control while its bar is narrow; the stylesheet lays the two rows on it. */
export const NARROW_ATTRIBUTE = 'data-kp-refresh-narrow';
/** The control's own width under which the bar is narrow [rem]. */
export const NARROW_AT_REM = 30;
/** The px of one rem when the root's font size cannot be read. */
const REM_FALLBACK_PX = 16;

/**
 * Is the bar narrow? Only a control without its own line, outside a form grid; `always` and `never` decide by hand, `auto` by
 * the control's width against 30rem. Pure.
 * @param {{ lineOff: boolean, inFormGrid: boolean, stack: string, width: number, rem: number }} state
 */
export function narrowFor({ lineOff, inFormGrid, stack, width, rem }) {
    // A form grid folds the bar on its own width (data-kp-formgrid-stack) and keeps its tracks.
    if (!lineOff || inFormGrid || stack === 'never') return false;
    if (stack === 'always') return true;
    return width > 0 && width < NARROW_AT_REM * rem;
}

/** Is the bar narrow at the control's width now? @param {HTMLElement} el */
export function isNarrow(el) {
    return narrowFor({
        lineOff: el.getAttribute('data-kp-refresh-line') === 'off',
        inFormGrid: el.closest('.kp-formgrid') !== null,
        stack: el.getAttribute('data-kp-refresh-stack') ?? 'auto',
        width: el.clientWidth,
        rem: parseFloat(getComputedStyle(el.ownerDocument.documentElement).fontSize) || REM_FALLBACK_PX,
    });
}

/**
 * How far to scroll a track so an item stands in its middle: the item's offset from the track's start, less half the room
 * left beside it. The browser clamps the result at both ends. Pure.
 * @param {number} trackLeft @param {number} trackWidth @param {number} itemLeft @param {number} itemWidth
 */
export const centreBy = (trackLeft, trackWidth, itemLeft, itemWidth) => itemLeft - trackLeft - (trackWidth - itemWidth) / 2;

/** The caption on the narrow bar's first row, drawn once and shown only while narrow without a title or label of the page's own. */
export function buildCaption(/** @type {Document} */ doc) {
    const caption = make(doc, 'span', 'kp-refresh__caption');
    // The chooser carries the same words as its name; a screen reader hears them there.
    caption.setAttribute('aria-hidden', 'true');
    caption.textContent = getStrings().refreshLabel;
    return caption;
}

/**
 * Bring the chosen segment into the middle of a scrolling chooser, without moving the page: only the track's own scroll is set.
 * @param {HTMLElement | null} track the segmented control
 */
export function showChosen(track) {
    if (!track || track.scrollWidth <= track.clientWidth) return;
    const chosen = /** @type {HTMLElement | null} */ (track.querySelector('[aria-checked="true"]'));
    if (!chosen) return;
    const box = track.getBoundingClientRect();
    const item = chosen.getBoundingClientRect();
    track.scrollLeft += centreBy(box.left, box.width, item.left, item.width);
}
