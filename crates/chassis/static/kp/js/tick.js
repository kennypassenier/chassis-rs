// A live number that ticks to its new value [kpadopt4-data; JobTracker's
// `TickNumber` (ui/kit.jsx)].
//
// `[data-kp-count]` (js/effects/count.js) counts up once, when a number
// first arrives. A live counter changes after that: twelve open items become
// fifteen on the next poll. Mark it, and write the new number the way you
// always do; the module counts from the number shown to the new one:
//
//   <span class="kp-kpi__value" data-kp-tick>1.204</span>
//   counter.textContent = '1.210';            // or React re-renders it
//   tickTo(counter, '1.210');                 // the same, by call
//
// The written text is the oracle, as for the count-up: the module reads the
// first number out of it in the page's language (`lang`: `1.204` is a
// thousand two hundred and four in Dutch), counts in its precision, and
// ends on exactly the text that was written, never a rounded or shortened
// one. It writes into the element's own text node, so a framework that
// owns that node (React) still finds it. Down counts too.
//
// `--kp-tick` is how long it takes in ms (default 600; `0` means no
// ticking at all). A reader who asked for less motion sees the new number
// at once, and so does a jump the eye cannot follow (more than 400 steps of
// the precision is drawn as 400). While it runs the element carries
// `aria-busy="true"` and `data-kp-tick-state="running"` (`done` after), so a
// live region speaks only the number it lands on; `kp-tick` fires when it
// lands, with the value in `detail`.

// The module is a facade [closure-pattern B, Kenny 2026-10-30]: the names, the number reader (parse.js), the Ticker of one number
// (also behind tickTo() before any attach) and the TickWatch controller live in js/tick/, listed in js/README.md.

import { watchTicks } from './tick/watch.js';

export { TICK, TICK_KNOB, TICK_MS, TICK_EVENT } from './tick/values.js';
export { parseTick } from './tick/parse.js';
export { tickTo } from './tick/ticker.js';

/**
 * @typedef {object} TickParse
 * @property {number} value
 * @property {number} decimals
 * @property {(value: number) => string} render  the text with another value in the same shape
 */

/**
 * Watch every `[data-kp-tick]` under `root` (and those added later): when
 * its text is changed by anyone but this module, it ticks from the number it
 * showed to the new one.
 * @param {ParentNode} [root]
 * @returns {() => void} detach: every running tick lands on its number
 */
export function attachTicks(root = document) {
    return watchTicks(root);
}
