// Link anchors on headings and rows [kpadopt6-media; kyu's dead-letter list: one failed message must be pointed at in a chat].
//
// A small `#` beside a heading or a row. A press copies a link to exactly that place and says "Copied" on the mark itself; opening
// such a link scrolls to the place and marks it for two seconds so the eye finds it. Kenny, 2026-10-17: the `#` shows when the
// pointer is over the heading or row or the keyboard is on it, and always on a phone.
//
//   <main data-kp-anchors="headings">…<h2>Dead letters</h2>…</main>
//   <table data-kp-anchors="rows"><tr data-kp-anchor="dead-4f2a">…</tr></table>
//
// Options (markup on the container, each with a default [KT6]; the same names are the options of `attachAnchors(root, options)`):
//   data-kp-anchors          headings | rows | both | off                                  off (opt-in per page)
//   data-kp-anchor           on one element: its id, or empty to make one                 none
//   id source                data-kp-anchor, else the element's own id, else a slug of its text; an id the page has is never overwritten
//   data-kp-anchor-levels    which headings, "2,3"                                         2,3
//   data-kp-anchor-show      hover | always | touch                                        hover on a pointer, always on touch, always on keyboard focus
//   data-kp-anchor-position  after | before                                               after for headings, before (the first cell) for rows
//   data-kp-anchor-copy      url | hash: the full address, or only "#id"                   url
//   data-kp-anchor-target    highlight | none: mark the place a link lands on             highlight
//   data-kp-anchor-offset    a CSS length a sticky bar covers                              --kp-header-height, else 0
//   data-kp-anchor-open      on | off: open a folded group first (`details`), and ask the page to reveal a row on another page  on
//   data-kp-anchor-wait      the longest wait, in ms, for a place that is not drawn yet; 0 says "no longer here" at once         10000
//   data-kp-flash-ms         how long "Copied" stays                                       1500
//
// A hash that arrives before its row is drawn is kept while the container is still drawing (a busy or skeleton row inside it, or
// a change within the last second in any container of the page; at most 10 s, or `data-kp-anchor-wait` on the first container, which says the notice) and resolved when the row renders; a container that has been still for a second
// and has no such row says so at once, not after the full wait. A hash with no place to land says so in a notice ("That item is
// no longer here") with a button that clears the hash. Under a `.kp-formgrid` the mark of a row stands at the end of the label
// cell and the mark of a group heading at the grid's end edge, so every mark has one x [anchors-picker-1019]. A press also writes the address bar
// (`history.replaceState`), and Shift with the press copies a Markdown link. With the shortcut engine, `y` then `l` on a focused row
// copies its link. Fires `kp-anchor-copy` `{ id, url, text, markdown }`, `kp-anchor-reveal` (cancelable) `{ id, target }` and
// `kp-anchor-missing` `{ id }`. Nothing runs on import.
//
// Each container is one AnchorBox controller (js/anchors/controller.js over js/anchors/marks.js, on js/controller.js);
// the parts are listed in js/README.md.

import { attachOne, controllerOf } from './controller.js';
import { AnchorBox } from './anchors/controller.js';
import { ANCHORS, attr } from './anchors/text.js';

export {
    ANCHORS,
    ANCHOR,
    ANCHOR_COPY_EVENT,
    ANCHOR_REVEAL_EVENT,
    ANCHOR_MISSING_EVENT,
    ANCHOR_HIT_MS,
    ANCHOR_WAIT_MS,
    ANCHOR_QUIET_MS,
    ANCHOR_COPIED_MS,
    anchorSlug,
    uniqueAnchorId,
} from './anchors/text.js';

/**
 * @typedef {object} AnchorOptions
 * @property {'headings' | 'rows' | 'both' | 'off'} [anchors]
 * @property {number[]} [levels]
 * @property {'hover' | 'always' | 'touch'} [show]
 * @property {'url' | 'hash'} [copy]
 * @property {'highlight' | 'none'} [target]
 * @property {boolean} [open]
 * @property {number} [copiedMs]
 * @property {number} [wait] the longest wait for a place not drawn yet, in ms
 */

/**
 * Draw a container's marks again, after an option changed (the position of the mark, the levels).
 * @param {Element} box
 */
export function refreshAnchors(box) {
    controllerOf(box, AnchorBox)?.rebuild();
}

/**
 * Wire every container under `root`.
 * @param {ParentNode} [root]
 * @param {AnchorOptions} [options] overrides the markup
 * @returns {() => void} detach
 */
export function attachAnchors(root = document, options = {}) {
    const found = /** @type {HTMLElement[]} */ ([...(root instanceof HTMLElement && root.matches(ANCHORS) ? [root] : []), ...root.querySelectorAll(ANCHORS)]);
    /** @type {AnchorBox[]} */
    const made = [];
    for (const box of found) {
        // A container already wired keeps its mark; one whose mode is off is left alone.
        if (box.dataset.kpAnchorsAttached !== undefined) continue;
        if ((options.anchors ?? attr(box, 'data-kp-anchors', 'off')) === 'off') continue;
        const anchored = attachOne(box, AnchorBox, options);
        if (anchored) made.push(anchored);
    }
    return () => {
        for (const anchored of made) anchored.destroy();
    };
}
