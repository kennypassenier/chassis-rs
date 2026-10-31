// Remembered state [Kenny, 2026-09-16].
//
// Kenny, after closing a group in the review site's side navigation and
// following a link: "de sidenav moet zijn state onthouden, ik heb bv de
// components dropdown gesloten en klik op een link, dan moet die nog altijd
// dicht zijn. Dit gedrag moet tellen voor alle elementen waar dit verwacht
// wordt door een user." And, in the same breath: "en die key in localStorage
// moet niet hardcoded zijn, stel dat we twee van dezelfde elementen naast
// mekaar op de pagina willen ofzo".
//
// So: ONE mechanism, the way js/theme-core.js is the one place the theme is
// remembered, and a key that comes from the element rather than from the
// module.
//
// ## The key
//
//     <prefix>:<component>:<name>:<slot>
//     kp-remember:sidenav:main-nav:groups
//
//   · prefix     `kp-remember`, settable once with configureRemember() so a
//                consumer can park everything this package writes under a
//                namespace of their own.
//   · component  the package's name for the KIND of thing — `sidenav`,
//                `disclosure`, `tree`, `split`, `datatable`, `tour`
//                (js/tour.js: a tour that ended, under its name). The module
//                supplies it; an author never writes it. Two different
//                components may carry the same name without colliding.
//   · name       the value of `data-kp-remember` on the element, verbatim.
//                No attribute, no memory: remembering is opt-in, and a page
//                that never asks for it gets nothing written into its
//                storage — the same promise `data-kp-sidenav-remember` made
//                before this file existed.
//   · slot       which piece of that component's state: `open`, `rail`,
//                `groups`, `value`, `branches`, `columns`, `sort`,
//                `density`. One entry per slot rather than one blob, so a
//                component that grows a state does not invalidate the four
//                it already had.
//
// **The page is deliberately not in the key.** Kenny's case IS a
// navigation: a group he closed must still be closed on the page the link
// led to, so the state has to cross pages inside the origin. An author who
// wants a per-page memory gives the element a per-page name — which is
// exactly what naming it from the element buys.
//
// ## Two of the same thing on one page
//
// Two elements of the same component with the same name are a fault, not a
// feature: they would mirror each other's state, which is the bug the name
// exists to prevent. So the FIRST element to ask owns the key; a second one
// is refused a memory entirely — it works, at its markup default, and
// writes nothing — and the clash is said out loud once, in the console and
// as `kp-remember-clash` on the element that was refused. Two of the same
// component with DIFFERENT names keep separate state, which is the whole
// point of the attribute.
//
// ## Before first paint
//
// The memory paints MARKUP, and the components go on reading markup. That
// is the trick that keeps this one mechanism: `paintRemembered()` writes
// the stored state onto the element as the attributes an author could have
// written by hand — `data-kp-sidenav-expanded`, `aria-sort`, `open`,
// `aria-valuenow` — and every module then does what it always did, which is
// read its own markup. `restoreRemembered()` does that pass for a whole
// document at module-evaluation time (js/auto.js calls it beside
// applyStoredTheme(), for the same reason), so nothing paints the wrong
// state first and snaps.
//
// ## When there is no storage
//
// Every read and every write is in a try/catch, and the property access
// itself is too: a browser set to refuse site data throws on
// `globalThis.localStorage` rather than returning null. No storage means no
// memory, never a broken component.
//
// The parts are in js/remember/ (store, painters, and the disclosure controller with its page watcher), listed in
// js/README.md.

import { RememberWatch } from './remember/disclosure.js';

export {
    REMEMBER_ATTRIBUTE,
    REMEMBER_CLASH_EVENT,
    REMEMBER_PREFIX,
    configureRemember,
    rememberedName,
    forgetClaims,
    memoryFor,
    forgetRememberedExcept,
} from './remember/store.js';
export { sidenavGroups, treeItemId, columnId, paintRemembered, restoreRemembered } from './remember/painters.js';
export { REMEMBER_HOLD_ATTRIBUTE } from './remember/disclosure.js';

/**
 * The kinds of state this package remembers.
 *
 * @typedef {'sidenav' | 'disclosure' | 'tree' | 'split' | 'datatable' | 'tour' | 'refresh' | 'notices' | 'claim' | 'availability' | 'time' | 'console' | 'focus-steps' | 'picker' | 'alert'} Remembered
 */

/**
 * A memory for one element.
 *
 * @typedef {object} Memory
 * @property {string} name the name the element gave itself
 * @property {(slot: string) => string} key the composed storage key, so a consumer can read or clear it themselves [KT6]
 * @property {<T>(slot: string, fallback: T) => T} read
 * @property {(slot: string, value: unknown) => boolean} write whether it will survive a reload
 * @property {(slot: string) => void} forget
 */

/** @typedef {{ prefix?: string, storage?: Storage | null }} RememberConfig */

/**
 * Wire the disclosures that remember — a `<details data-kp-remember>`, the
 * accordion's own element. Every other component writes its state from its
 * own module; a `<details>` has no module, so this is it.
 *
 * A disclosure added under `root` later is wired as it arrives, and its
 * memory painted in the same step, before the browser paints it, so a page
 * that rebuilds its groups on every refresh shows each one as it was left,
 * with no frame of its markup default (port spec J3). One that leaves the
 * page is let go.
 *
 * `data-kp-remember-hold` on the element or an ancestor holds the memory
 * still: the page sets `open` itself (every group open while a search runs)
 * and nothing is painted over it or written from it. When the hold goes,
 * the stored state is painted back.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachRemembered(root = document) {
    const watch = new RememberWatch(root);
    watch.start();
    return () => watch.stop();
}
