// "On this page": a contents list that follows the reader [wish-1120, homelab 95; the dashboard's Settings side list].
//
// A long page is a few sections; a list of them beside it says where the reader is and takes them to another with one press. This module
// builds that list from the page's own headings, marks the one the reader is in as they scroll (scroll-spy), and keeps the list in step
// when the headings change:
//
//   <nav class="kp-contents" data-kp-contents data-kp-contents-for="#settings" data-kp-contents-headings="h2, h3"></nav>
//
// Or from items the page gives, where the sections are cards without a heading of their own or want a count beside the name:
//
//   setContents(nav, [{ id: 'wc', label: 'Working copy' }, { id: 'signin', label: 'Sign-in', count: 3 }, { id: 'sub', label: 'Keys', level: 1 }]);
//
// Options, as attributes on the `nav` (read again when they change), each with a default [KT6]:
//
//   data-kp-contents-for       a selector for where the headings are                    the nearest `main`, else the page
//   data-kp-contents-headings  a selector for the headings that count                   h2
//   data-kp-contents-offset    px from the top of the window where a section counts as reached (a sticky header's height)   80
//   data-kp-contents-min       the fewest entries that earn a list; with fewer it is hidden   2
//   data-kp-contents-title     the heading over the list ("On this page"); `none` leaves it out
//   data-kp-contents-hash      `off`: a press does not write the address's #fragment    on
//   data-kp-contents-scroller  a selector for the box that scrolls the sections, when it is not the page (a pane with its own scroll); the
//                              offset then counts from the box's top edge. Left out, the pane the first section sits in is found by itself   the page
//
// A heading without an `id` gets one from its words. A press (or Enter on the entry) scrolls to the section, in its pane when it has one and the
// page does not move (smoothly, unless the reader asked for less motion),
// writes `#id` into the address without a new history entry, and gives the section's heading the focus, so a keyboard reader arrives where
// the page did. The entry of the section the reader is in has `aria-current="location"` and `data-kp-current`; it follows the scroll, and
// at the foot of the page the last entry is the current one. Entries nest by heading level (`data-kp-level`). `kp-contents-change`
// `{ id, label, previous }` is fired on the list when the current entry changes. `data-kp-state="loading"` shows three bars in the list's
// own footprint until the page gives its items. Nothing runs on import; attachContents(root) returns a detach.
//
// Each list is one ContentsList (js/page-contents/controller.js over draw.js, spy.js, read.js and core.js, on js/controller.js; the nav is its host);
// the parts are listed in js/README.md.

import { attachAll, controllerOf } from './controller.js';
import { ContentsList } from './page-contents/controller.js';
import { CONTENTS } from './page-contents/values.js';

export { CONTENTS, CONTENTS_EVENT } from './page-contents/values.js';
export { contentsSlug, currentSection } from './page-contents/slug.js';

/**
 * @typedef {object} ContentsItem
 * @property {string} id the section's `id`
 * @property {string} label the entry's words
 * @property {number} [level] 0 (default) for a section, 1 under it, and so on
 * @property {string | number} [count] a small number or word after the label
 */

/**
 * @typedef {object} ContentsHandle
 * @property {() => string | null} current the id of the current entry
 * @property {() => void} refresh read the headings again now
 * @property {(items: readonly ContentsItem[] | null) => void} setItems entries the page gives; null goes back to the headings
 */

/**
 * The handle of an attached list.
 * @param {Element} nav
 * @returns {ContentsHandle | null}
 */
export function contents(nav) {
    return controllerOf(nav, ContentsList)?.handle ?? null;
}

/**
 * Give a list its entries (the page's own sections), or `null` to go back to reading the headings.
 * @param {Element} nav an attached `[data-kp-contents]`
 * @param {readonly ContentsItem[] | null} items
 */
export function setContents(nav, items) {
    contents(nav)?.setItems(items);
}

/**
 * Build a contents list for every `[data-kp-contents]` under `root` and follow the reader.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachContents(root = document) {
    return attachAll(root, CONTENTS, ContentsList);
}
