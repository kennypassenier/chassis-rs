// A bar that folds what does not fit behind a "More" menu [kpadopt-nav].
//
// The homelab dashboard's bar (admin/web/js/main.js `fitBar`) used to fold
// ALL its links behind the phone toggle the moment a theme's wide letters
// wrapped one of them onto a second row. This folds only the links that do
// not fit, from the end, and keeps the rest in the bar:
//
//   <div class="kp-nav-wrap">
//     <nav class="kp-nav" data-kp-nav-fold aria-label="Main">
//       <span class="kp-nav__brand">Your app</span>
//       <ul class="kp-nav__links">…</ul>
//     </nav>
//   </div>
//
// Opt-in by `data-kp-nav-fold` on the nav. The script adds one list item at
// the end of `.kp-nav__links`, `.kp-nav__more`, which holds kp's own menu
// button (js/menu-button.js: a `.kp-menu-button` whose button is a bar link
// and whose menu is a `.kp-menu--rich`), so the More menu has the keys, the
// placement and the theme of every other menu. Nothing is moved or cloned in
// the bar: a link that does not fit stays in its list item, which only turns
// `data-kp-nav-folded` (out of the flow, invisible, out of the focus order,
// still measurable), and the menu holds one entry for it that clicks the real
// link, so a router's own handler still runs. A list item with a dropdown or a
// mega menu becomes a named group in the menu: its heading, then its links.
//
// No layout shift. The list takes the room the brand and the end slots leave
// (`flex: 1 1 0`), so what it holds never changes how wide it is, and it does
// not wrap: the bar is one row before the script runs (the overflow is
// clipped, not wrapped) and one row after. A folded link is measured at its
// own natural width, so the fit does not depend on the state it is in; there
// is nothing to oscillate. The decision is taken inside a ResizeObserver
// callback, before the frame is painted.
//
// The bar's own phone toggle (`data-kp-nav-toggle`) wins where it is shown:
// below the 40rem container query, with a toggle present, the bar collapses
// as it always did and this stands down.
//
// Marks: `data-kp-nav-fold-ready` on the nav once it has been fitted,
// `data-kp-nav-folding` while anything is folded, `data-kp-nav-folded` on each
// folded item, `data-kp-nav-more-current` on the More item when the current
// page is behind it and `data-kp-nav-more-alert` when a counter (`.kp-badge`)
// is (a dot on the button, announced); `aria-current="true"` goes on the button
// itself while the current page is behind it. `data-kp-nav-keep` on an item keeps it in the bar. Fires `kp-nav-fold` on
// the nav when the folded set changes: `{ folded, items }`. Every word is in
// the dictionary (`navMore`, `navMoreMenu`, `navMoreAlert`, `navMoreUnavailable`).
//
// A separator between two groups of links [kpadopt3] is a list item of its own,
// `<li class="kp-nav__sep" aria-hidden="true"></li>`: a rule in the bar, never a
// target. The fold reads it as part of the bar: a separator stands only between
// two links that are shown, so one whose links on either side have folded folds
// with them (no rule dangles before More or at the start), and in the More menu
// the links that followed it start a group below the menu's own separator
// (`.kp-menu__separator`). A separator is never counted as a folded item.
//
// Nothing runs on import; attachNavFolds(root) returns a detach.
//
// Each bar is one NavFold controller (js/nav-fold/controller.js over js/nav-fold/core.js, on js/controller.js); the parts are listed in js/README.md.

import { attachOne, controllerOf, hostsOf } from './controller.js';
import { NavFold } from './nav-fold/controller.js';
import { NAV_FOLD, NAV_FOLD_OWNED } from './nav-fold/read.js';

export { NAV_FOLD, NAV_FOLD_EVENT, NAV_MORE, NAV_SEP, NAV_FOLD_OWNED } from './nav-fold/read.js';
export { planFold, planSeparators } from './nav-fold/plan.js';

/**
 * @typedef {object} NavFoldOptions
 * @property {Partial<import('./strings.js').Strings>} [strings] any of the dictionary's `navMore…` words, for this bar only
 */

/**
 * Fold one bar.
 *
 * @param {HTMLElement} nav the `.kp-nav` carrying `data-kp-nav-fold`
 * @param {NavFoldOptions} [options]
 * @returns {() => void} detach
 */
export function foldNav(nav, { strings } = {}) {
    if (controllerOf(nav, NavFold)) return () => {};
    // A bar with no list yet (or no window) stays unmarked, so a later call can still fold it.
    if (!nav.querySelector(':scope > .kp-nav__links') || !nav.ownerDocument.defaultView) return () => {};
    const controller = attachOne(nav, NavFold, { strings });
    return () => controller?.destroy();
}

/**
 * Fold every bar under `root` that carries `data-kp-nav-fold`. A bar the React
 * NavBar renders folds itself; pass `ownedBy: ''` to fold it here instead.
 *
 * @param {ParentNode} [root]
 * @param {NavFoldOptions & { ownedBy?: string }} [options]
 * @returns {() => void} detach
 */
export function attachNavFolds(root = document, { ownedBy = NAV_FOLD_OWNED, ...options } = {}) {
    const bars = hostsOf(root, NAV_FOLD).filter((nav) => ownedBy === '' || !nav.matches(ownedBy));
    const undo = bars.map((nav) => foldNav(nav, options));
    return () => undo.splice(0).forEach((off) => off());
}
