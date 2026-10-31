// The compare slider: two versions stacked, a divider between them [kpadopt4-ideas, Kenny 2026-10-16].
//
//   <div class="kp-compare" data-kp-compare>
//       <div data-kp-compare-pane="before"><img src="old.png" width="1200" height="675" alt="The dashboard before" /></div>
//       <div data-kp-compare-pane="after"><img src="new.png" width="1200" height="675" alt="The dashboard after" /></div>
//   </div>
//
// The two panes lie on top of each other; the before pane shows on the start
// side of the divider and the after pane on the end side. The divider is a
// slider (`role="slider"`, 0 to 100): drag its handle, or press the arrow keys
// (a step of 1, with Shift of 10), Page Up and Page Down (10), Home (all
// after) and End (all before). On images a press anywhere moves the divider
// there and a drag follows; on live HTML panes (a pane that holds a link, a
// button or a field) only the handle drags, so the panes stay usable on both
// sides. A label marks each side ("Before", "After", or the
// `data-kp-compare-before` and `-after` words) and steps aside while the
// divider covers it.
//
// The panes keep their size from the first frame: give the images their
// width and height, or the box `data-kp-compare-ratio="16/9"`. While an image
// loads, the box is a quiet plate at its whole size with the data table's own
// loading card in its middle (js/busy-card.js: the theme's spinner and its
// words), as a table that loads (Kenny, 2026-10-16: "Doe iets in de aard van
// een table die laadt met centraal de laadanimatie"); setCompareBusy(el, true)
// holds it there for a page that reads its panes itself. An image that fails
// says so over the whole visible part of its pane, with a normal-size Retry
// that loads it again and fires `kp-compare-retry` ({ pane }). setCompare(el,
// position) moves the divider from a script; `kp-compare-change`
// ({ position }) says where it went.
//
// The divider glides to a press in the theme's own time and curve, follows a
// drag at once, and never glides under reduced motion.
//
// Nothing runs on import; attachCompares(root) returns a detach.

import { attachOne, controllerOf, hostsOf } from './controller.js';
import { Compare } from './compare/controller.js';
import { COMPARE } from './compare/values.js';

export { COMPARE, COMPARE_EVENT, COMPARE_RETRY_EVENT } from './compare/values.js';
export { compareKey } from './compare/keys.js';

/**
 * Hold a slider in its loading state (the busy card over the box) while the page reads its panes, or let it go.
 * @param {Element} el @param {boolean} busy
 */
export function setCompareBusy(el, busy) {
    controllerOf(el, Compare)?.hold(busy);
}

/**
 * Move a slider's divider from a script, without the event.
 * @param {Element} el @param {number} position 0 (all after) to 100 (all before)
 */
export function setCompare(el, position) {
    controllerOf(el, Compare)?.move(position, false, true);
}

/**
 * Wire every compare slider under `root`.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachCompares(root = document) {
    // A slider without both its panes is left alone, as is one that is wired.
    const made = hostsOf(root, COMPARE)
        .filter((el) => !controllerOf(el, Compare) && el.querySelector(':scope > [data-kp-compare-pane="before"]') && el.querySelector(':scope > [data-kp-compare-pane="after"]'))
        .map((el) => attachOne(el, Compare))
        .filter((controller) => controller !== undefined);
    return () => {
        for (const controller of made) controller.destroy();
    };
}
