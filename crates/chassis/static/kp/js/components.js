// The component contracts, framework-free [L7, DI4, DI10].
//
// Kenny's standing rule 31, and DI10's own wording: drive it from
// attributes rather than per-button code, so a new button gets the
// behaviour by declaring it instead of by someone remembering.
//
// Two contracts are enforced here, both of them the kind that a review
// catches once and then stops catching:
//
//   1. A destructive button must offer an undo or a confirmation
//      (SC 3.3.4 Error Prevention, AA). It is an OR, not an AND.
//   2. A badge or alert carrying a semantic colour must also say what it
//      means in text (DI4). Seven pale plates are one plate to someone
//      who cannot tell the colours apart.
//
// A violation is reported, loudly, and the offending control is disarmed
// rather than left to delete something. It is not thrown: one bad button
// on a dashboard should not take the page down with it.
//
// Recoverable since 3.0.0 [KT6, decision D7]. The first version disabled
// a consumer's button, forgot what the button had been, offered no way
// to detach and never looked again — so markup that arrived a moment too
// late stayed dead for the life of the page. Now enforcement records
// what it changed, returns a detach that puts it back, re-evaluates when
// called again, exempts what the consumer marks, and says what it says
// through the dictionary. The rule is the same; the ownership moved.

export {
    VIOLATION_EVENT,
    CONFIRM_WINDOW_MS,
    CONFIRM_MODES,
    CONFIRM_OWNED,
    TYPE_CONFIRM_EVENT,
    TYPE_CONFIRM,
    typeConfirmMatches,
    buildTypeConfirm,
    attachTypeConfirms,
} from './components/type-confirm.js';
export { EXEMPT, findViolations, enforceContracts, attachConfirmations } from './components/contracts.js';
export { openConfirmation } from './components/confirm-dialog.js';
export { skipTo, attachSkipLinks } from './components/skip-links.js';
export { TO_TOP_EVENT, TO_TOP, attachToTop } from './components/to-top.js';
export { NAV_TOGGLE_EVENT, NAV_OWNED, attachNavToggles } from './components/nav-toggle.js';
export { NAV_COMPACT_EVENT, NAV_STICKY_OWNED, attachStickyNavs, stickyNav } from './components/sticky-nav.js';
export { placeNavMenu, placeNavPanel } from './components/nav-place.js';
export { attachNavMenus } from './components/nav-menus.js';
export { setStateWord } from './components/state-word.js';

/** @typedef {import('./components/type-confirm.js').Rule} Rule */
/** @typedef {import('./components/type-confirm.js').Violation} Violation */
