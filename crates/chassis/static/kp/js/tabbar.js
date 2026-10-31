// The bottom tab bar for phone widths [kpadopt-nav].
//
// The homelab dashboard drew its own (`.nx-tabbar`, chrome.js
// `mountTabBar`): the four frequent areas within thumb reach, a "More" tab
// that opens a sheet, a count on the tab that needs the reader. The look is
// CSS (`.kp-tabbar` in css/components.css, one answer per register); this
// file is the little that CSS cannot do:
//
//   <nav class="kp-tabbar" aria-label="Areas">
//     <a class="kp-tabbar__tab" href="/" aria-current="page" data-kp-tab="home">
//       <span class="kp-tabbar__icon"><svg …/></span>
//       <span class="kp-tabbar__label">Home</span>
//     </a>
//     <a class="kp-tabbar__tab" href="/inbox" data-kp-tab="inbox">
//       <span class="kp-tabbar__icon"><svg …/></span>
//       <span class="kp-tabbar__label">Needs you</span>
//       <span class="kp-badge kp-tabbar__badge" hidden></span>
//     </a>
//     <button type="button" class="kp-tabbar__tab kp-tabbar__tab--more" data-kp-dialog="more-drawer">
//       <span class="kp-tabbar__icon kp-tabbar__icon--more" aria-hidden="true"></span>
//       <span class="kp-tabbar__label">More</span>
//     </button>
//   </nav>
//   <dialog class="kp-drawer kp-dialog" id="more-drawer">…</dialog>
//
// The More tab opens a drawer through the page's existing `data-kp-dialog`
// wiring (attachDialogs, js/overlays.js); this adds what a tab bar needs of
// it: the tab says it opens a dialog (`aria-haspopup`) and whether it is open
// (`aria-expanded`), and it reads as the current tab (`aria-current="true"`, a
// current item of the set, as the folding bar's More button does) while the
// drawer holds the current page, that is while a `[aria-current]` link is
// inside it. A tab the page marked itself is left as the page marked it.
//
// The drawer is closed by its close button (give it a visible glyph: `×`),
// Escape, a press on the strip of page the drawer leaves open at its start edge
// on a phone (`dialog[data-kp-tabbar-drawer]`, css/components.css), and a press
// on one of its entries.
//
// The bar publishes its height as `--kp-tabbar-height` on the root while it is
// on the screen (0px when it is not), so the page keeps its last line, a toast
// and the back-to-top control clear of it, whatever the theme or the safe-area
// inset makes of its height.
//
// `setTabbarBadge(tab, count)` writes a count (every digit of it, never capped or abbreviated; hidden at 0
// or null); `setTabbarCurrent(bar, id)` moves `aria-current` to the tab with
// that `data-kp-tab`; `setTabbarBusy(tab, busy)` puts one tab to wait. Nothing runs on import; attachTabbars(root) returns a
// detach.
//
// A count on a tab of the underline row [gap-tab-count; the admin dashboard's `sh-count` on a stack page, "Apps 7 · Logs 12"].
// The bottom bar has had its badge since kpadopt-nav; the row of `.kp-tab` had none, so the dashboard drew a grey pill of its own
// and a number that appeared late moved the tab. The count is a part of the tab, written from attributes (an attribute change
// redraws it) or by `setTabCount(tab, count, options)`:
//
//   <button type="button" class="kp-tab" role="tab" aria-selected="false"
//           data-kp-tab-count="12" data-kp-tab-count-tone="error" data-kp-tab-count-unit="error,errors">Logs</button>
//
//   data-kp-tab-count            the exact number (12 is 12 and 1534 is 1534, never `9+`); empty or absent: no count (not 0)
//   data-kp-tab-count-tone       neutral (default), info, success, warning or error: the badge's own plates
//   data-kp-tab-count-unit       "error,errors": the word after the number, singular then plural. A screen reader always hears it
//                            ("Logs, 12 errors"); it is drawn too with `data-kp-tab-count-show-unit`
//   data-kp-tab-count-state      loading: a skeleton the width of the last number (two digits at first), never a 0; error: a dash,
//                            and the words "could not be counted" for a screen reader and the title
//   data-kp-tab-count-zero       show: a 0 is information ("History 0 incidents"); otherwise 0 draws nothing
//
// The room of the digits is held (`--kp-tab-count-digits`, never fewer than two), so a number that arrives, grows a digit or
// changes tone moves no tab. Nothing runs on import; attachTabCounts(root) returns a detach.
//
// Each bar is one TabbarController (js/tabbar/controller.js, with js/tabbar/dialog.js for its More tab, on js/controller.js); the tab count and the
// badge functions are in js/tabbar/count.js and badge.js, and the parts are listed in js/README.md.

import { attachAll } from './controller.js';
import { TabbarController } from './tabbar/controller.js';
import { TABBAR } from './tabbar/badge.js';

export { TABBAR, TABBAR_HEIGHT_PROPERTY, setTabbarBadge, setTabbarCurrent, setTabbarBusy } from './tabbar/badge.js';
export { TAB, TAB_COUNT_TONES, TAB_COUNT_EVENT, drawTabCount, setTabCount } from './tabbar/count.js';
export { attachTabCounts } from './tabbar/count-watch.js';

/** @typedef {'neutral' | 'info' | 'success' | 'warning' | 'error'} TabCountTone */

/**
 * Wire every tab bar under `root`. Idempotent.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachTabbars(root = document) {
    return attachAll(root, TABBAR, TabbarController);
}
