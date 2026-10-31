// A freshness line that ticks: "updated 12 s ago" [scope-143].
//
// Live data says how old it is, and the words keep up by themselves. Mark
// the element with `data-kp-ago` and give it its moment as a machine reads
// it, in `datetime` (a `<time>`'s ISO moment) or in `data-kp-ago` itself
// (ISO or milliseconds since the epoch):
//
//   <time class="kp-ago" data-kp-ago data-kp-ago-verb="updated"
//         data-kp-stale-after="180" datetime="2026-10-04T12:00:05Z">updated 12 s ago</time>
//
// attachAgo(root) rewrites every such element under `root` once a second,
// with ONE timer for the whole page however many lines it carries, and finds
// lines added later by watching the page rather than querying it every
// second. The words come from the dictionary (js/strings.js: `agoText`,
// `agoNever` and the four unit words), with exact numbers and the two
// largest units, a zero part left out: `12 s`, `2 min`, `2 min 5 s`, `3 h`,
// `3 h 12 min`, `1 day`, `2 days 4 h`. A moment in the future (another
// clock running ahead) reads `0 s`; no moment reads `not updated yet`.
//
// What else it keeps:
//   - The absolute moment in the title and `aria-description`, as rule 52
//     writes a moment a person reads: dd/mm/yyyy HH:mm, 24-hour, in
//     Europe/Brussels whatever the reader's zone (`timeZone` to change it).
//   - `data-kp-stale-after="<seconds>"`: older than that, the element gets
//     `data-kp-stale`, which the stylesheet draws as a warning plate with a
//     shadow, so turning stale moves nothing.
//   - `data-kp-stale-tone="calm"` [audhd-opts-1019]: a stale line is drawn as a quiet plate (the muted ground and the
//     ordinary ink, no warning colour) instead of the amber one, for data that is old on purpose (a frozen recipe, an
//     archive) and where "stale" is not a fault. The same size and shadow edge, so the tone changes no size either;
//     CSS only, so it follows the attribute at runtime. Knobs: `--kp-ago-calm-bg`, `--kp-ago-calm-fg`.
//   - `data-kp-ago-units="days"` [audhd-opts-1019]: from one day on the line counts whole days and nothing else, "frozen
//     97 days ago" instead of "frozen 97 days 4 h ago" (the hours of a long age are noise); under a day it reads as
//     always ("5 h", "3 h 12 min"), so a fresh line is still exact. No value is the two-largest-units reading above. It
//     follows the attribute at runtime (the line watches it, with its other options).
//   - `data-kp-ago-bare`: no verb at all, "12 s ago" instead of "updated 12 s ago", for a line that stands in a column of its
//     own (the activity feed's time, js/feed.js) [gap-activity-feed-1019].
//   - Its width: the line reserves (`min-inline-size`) the widest text its
//     current unit can reach ("updated 59 min 59 s ago" under an hour), so
//     a unit change does not push its neighbours; `data-kp-ago-width="14ch"`
//     sets the width itself. That is the only layout read, once per unit.
//   - No chatter: the line is `aria-live="off"`, so a screen reader is not
//     told the time every second, and a line found inside a live region
//     warns once in the console. `data-kp-ago-announce="state"` adds a
//     hidden status beside it that speaks only when the line turns stale or
//     fresh again.
//   - The timer stops while the tab is hidden and repaints every line the
//     moment it is shown again.
//
// Nothing runs on import; attachAgo(root) returns a detach. `now` can be
// given, so a test never reads the real clock.
//
// Not one controller per line: the lines of a page share ONE timer (js/freshness/engine.js over js/freshness/state.js). Each attachAgo(root) call
// is one AgoWatch controller (js/freshness/watch.js, on js/controller.js) that adopts its lines and watches its root; the parts are in js/README.md.

import { AgoWatch } from './freshness/watch.js';
import { FRESHNESS_TIME_ZONE } from './freshness/values.js';

export { AGO, FRESHNESS_TIME_ZONE } from './freshness/values.js';
export { humanDuration, agoText, agoMoment, momentOf } from './freshness/text.js';
export { setAgo } from './freshness/engine.js';

/** @typedef {import('./strings.js').Strings} Strings */

/**
 * @typedef {object} AgoContext
 * @property {string} timeZone
 * @property {() => number} now
 * @property {Partial<Strings> | undefined} overrides the attach's own words, over the dictionary's as they stand
 * @property {object} owner the attach that found the line
 */

/**
 * @typedef {object} AgoState
 * @property {number | null | undefined} at the moment last painted
 * @property {string} sample the text the reserved width was measured from
 * @property {boolean | null} stale the stale state last painted (null before the first)
 */

/**
 * Keep every freshness line under `root` ticking, now and as lines arrive,
 * change or leave. One timer serves the whole page.
 *
 * @param {ParentNode} [root]
 * @param {{ timeZone?: string, now?: () => number, strings?: Partial<Strings> }} [options]
 * @returns {() => void} detach
 */
export function attachAgo(root = document, { timeZone = FRESHNESS_TIME_ZONE, now = () => Date.now(), strings } = {}) {
    const watch = new AgoWatch(/** @type {HTMLElement} */ (/** @type {unknown} */ (root)), { timeZone, now, strings });
    try {
        watch.connect();
    } catch (error) {
        watch.destroy();
        throw error;
    }
    return () => watch.destroy();
}
