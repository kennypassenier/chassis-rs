// The effects module [S45, AR34, AR35, AR44]: the reveals of the hook
// vocabulary, in one file, for both channels.
//
// A consumer marks what a passage IS — `data-kp-surface="hero"`, a
// `<mark>`, `data-kp-reveal="headline|emphasis|rule"`, `data-kp-divider`
// — and a theme decides what that looks like. This module performs the
// part a stylesheet cannot: the decipher of a headline, the clearance of
// marks one after another, the rule that draws when its heading scrolls
// into view. It toggles state classes only (STATE); the register paints.
//
// Which reveals a theme performs is the theme's answer, read from three
// custom properties on the root (`--kp-reveal-headline: decipher`, and so
// on, ROUTINES): a theme that declares none has answered quietly, and the
// module leaves the element at rest. Under formal a headline is a
// headline.
//
// Every reveal has a rest state that holds without this script: the
// register keys its start states on the root attribute `data-kp-effects`,
// which the head snippet (js/no-flash.js) sets before first paint and
// attachEffects() sets again, so a page without the module shows drawn
// rules and clear marks, and a page with it never flashes from rest to
// start [AR34].
//
// Reveals run once per session per page by default — a server-rendered
// dashboard is a full load per click, and nobody wants the heading to
// decipher on every one — and `data-kp-reveal-every="load"` opts back in
// [AR44]. The memo is sessionStorage, key per path and hook, the module's
// only storage (M4).
//
// Nothing here throws. An unknown surface or reveal value is reported
// once per page as `kp-effect-unknown` with the accepted values, and
// js/diagnostics.js lists it. Reduced motion, at attach or mid-session,
// resolves every running reveal to its rest state at once [DI7].
//
//   import { attachEffects } from '@kp-soft/themes/js/effects';
//   const effects = attachEffects(document, { threshold: 0.6 });
//   effects.observe(elementRenderedLater);
//   effects.detach();
//
// DI5: every animation the register runs has its row in TIMINGS (js/effects-core/timings.js),
// and gates/check-motion.mjs holds the table and the keyframes in step
// and reports every rate (S42: reported, never corrected by the gate).
//
// The module is a facade (js/effects/ holds the hooks, each fetched when asked for): the vocabulary, the knobs and the DI5 table
// are in js/effects-core/, and every attach is one EffectsEngine (js/effects-core/engine.js) whose fields are what the old closure
// kept; the hooks receive its context (js/effects-core/context.js). The parts are listed in js/README.md.

import { EffectsEngine } from './effects-core/engine.js';

export {
    HOOKS,
    SURFACES,
    REVEALS,
    HEADLINE_ROUTINES,
    ARRIVALS,
    STATE,
    ROUTINES,
    ARRIVAL,
} from './effects-core/vocabulary.js';
export {
    CARET_KNOB,
    KNOBS,
    COUNT_KNOB,
    COUNT_FROM_KNOB,
    BOOT_PROGRESS,
    MARQUEE_KNOB,
    MARQUEE_PAUSE_KNOB,
    MEASURE_KNOB,
    POINTER_KNOB,
    POINTER,
    LIGHT_KNOB,
    LIGHT,
    LIGHT_SELECTOR,
    LIGHT_REACH,
    LIGHT_FAR,
    PRESS_KNOB,
    PRESS,
    PRESS_SIZE,
    PRESS_HOLD,
    PRESS_HELD,
    PRESS_HOLD_MS,
    ROOT_ATTRIBUTE,
    DONE_ATTRIBUTE,
    REVEAL_STATE,
    TEXT_ATTRIBUTE,
    UNKNOWN_EVENT,
    REVEAL_EVENT,
    MEMO_PREFIX,
    GLYPHS,
} from './effects-core/knobs.js';
export { TIMINGS } from './effects-core/timings.js';
export { unknownEffects } from './effects-core/registry.js';

/**
 * @typedef {object} EffectsOptions
 * @property {boolean} [reduceMotion] override the media query (a test, or a consumer's own switch)
 * @property {number} [threshold] IntersectionObserver ratio for the rule (default: `--kp-reveal-threshold`, 0.6)
 * @property {number} [cps] decipher characters per second (default: `--kp-decipher-cps`, 26)
 * @property {number} [stagger] ms between one mark clearing and the next (default: `--kp-reveal-stagger`, 260)
 * @property {number} [delay] ms before the first mark clears on load (default: `--kp-classified-delay`, 1500)
 * @property {boolean} [manageRoot] set and, on detach, remove the root attribute (default true; a wrapper around one element passes false)
 */

/**
 * @typedef {object} EffectsHandle
 * @property {() => void} detach stop everything the module started and remove the root attribute; safe to call twice
 * @property {(element: Element) => void} observe start an element rendered after attach, and its subtree [AR34]
 * @property {Promise<void>} ready resolves once every hook this attach asked for has been fetched and run [scope-117]
 */

/**
 * The four variables every part of attachEffects writes [scope-117].
 * @typedef {object} EffectsState
 * @property {boolean} detached
 * @property {IntersectionObserver | null} io
 * @property {IntersectionObserver | null} ioHeadline
 * @property {number} pending
 */

/**
 * What a hook module receives from attachEffects [scope-117]: the closure it
 * was cut out of, by name.
 * @typedef {Record<string, any> & { state: EffectsState }} EffectsContext
 */

/**
 * Attach the reveals under `root` and return a handle.
 *
 * @param {Document | Element} [root]
 * @param {EffectsOptions} [options]
 * @returns {EffectsHandle}
 */
export function attachEffects(root = document, options = {}) {
    return new EffectsEngine(root, options).start();
}
