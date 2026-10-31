// The "N new lines" pill on a live list or log [kpadopt5; homelab's `.hl-newpill`, kyu's live messages].
//
// A list that grows while it is read (a log, a feed of messages) follows its
// newest row as long as the reader is at that end. The moment the reader
// scrolls away, rows that arrive out of sight are counted in a pill that says so
// and jumps back with one press: "12 new lines · back to the tail".
//
//   <div data-kp-newpill-host>
//       <ul data-kp-follow="tail" data-kp-follow-threshold="24" data-kp-pill-unit="line,lines" class="log">…rows…</ul>
//   </div>
//
// The element marked `data-kp-follow` is the scroller (it must scroll, `overflow:
// auto`); its element children are the rows. The pill is drawn in its parent, which
// becomes the positioned host (`[data-kp-newpill-host]`), so it never scrolls with the
// rows. Options, as attributes and as the second argument of attachNewPills():
//
//   data-kp-follow            `tail` (default) | `head`: where new rows arrive (head: a newest-first list)
//   data-kp-follow-threshold  px from the end that still count as following (default 24)
//   data-kp-pill-placement    `bottom` | `top`; default the end the rows arrive at; read again when it changes (js/live-options.js)
//   data-kp-pill-unit         "line,lines": the app's word for a row, singular and plural
//   data-kp-since-left        on by default: a divider "New since 14:32" before the first row that came while the tab was away;
//                             `off` leaves it out (read each time, so it can be switched at runtime)
//   data-kp-follow-key        the key that jumps back and follows again (default End, Home for `head`)
//   data-kp-follow-space      Space pauses and resumes following, for a log
//   data-kp-follow-rows       `children` (default): the scroller's element children are the rows. `tbody`: the rows are the
//                             `<tr>` that arrive in a table body inside the scroller (a datatable in a scrolling box) [wish-1028,
//                             almanac 9]. A row counts once: a row whose `data-kp-row-key` (or id) the pill has already seen
//                             is the same row coming back after a sort, a filter or a page change, and is not new. Detail,
//                             group and held rows are not rows. Read when the pill attaches.
//
// A row counts only while it is shown: a filter that hides it (the `hidden`
// attribute) takes it out of the count, and the count is exact. Scrolling back
// to the end follows again by itself. A button marked `data-kp-follow-toggle="<id>"`
// pauses and resumes the following and says which it will do. The count is said
// to a screen reader at most every ten seconds.

import { attachAll, controllerOf } from './controller.js';
import { NewPill } from './newpill/controller.js';
import { FOLLOW } from './newpill/values.js';

export { FOLLOW, FOLLOW_EVENT, NEWPILL_JUMP_EVENT, FOLLOW_THRESHOLD, NEWPILL_SAY_MS } from './newpill/values.js';

/**
 * @typedef {object} NewPillOptions
 * @property {'tail' | 'head'} [follow]
 * @property {number} [threshold]
 * @property {'bottom' | 'top'} [placement]
 * @property {string} [unit] "line,lines"
 * @property {boolean} [sinceLeft]
 * @property {string} [key]
 * @property {boolean} [space]
 * @property {'children' | 'tbody'} [rows] where the rows arrive: the scroller's children (default) or the rows of a table body inside it
 */

/**
 * @typedef {object} NewPillHandle
 * @property {() => void} pause stop following; new rows are counted
 * @property {() => void} resume jump to the end and follow
 * @property {() => void} jump same as resume
 * @property {() => number} unseen how many shown rows arrived out of sight
 * @property {() => boolean} following
 */

/**
 * The handle of a scroller.
 * @param {Element} el
 * @returns {NewPillHandle | null}
 */
export function newPill(el) {
    return controllerOf(el, NewPill)?.handle ?? null;
}

/**
 * Give every live list under `root` its following and its pill.
 * @param {ParentNode} [root]
 * @param {NewPillOptions} [options]
 * @returns {() => void} detach
 */
export function attachNewPills(root = document, options = {}) {
    return attachAll(root, FOLLOW, NewPill, options);
}
