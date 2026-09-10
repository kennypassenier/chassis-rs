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
// DI5: every animation the register runs has its row in TIMINGS below,
// and gates/check-motion.mjs holds the table and the keyframes in step
// and reports every rate (S42: reported, never corrected by the gate).

/** The attributes of the hook vocabulary [AR35]. Contract values. */
import { getStrings } from './strings.js';

export const HOOKS = Object.freeze({
    surface: 'data-kp-surface',
    reveal: 'data-kp-reveal',
    revealTrigger: 'data-kp-reveal-trigger',
    revealEvery: 'data-kp-reveal-every',
    divider: 'data-kp-divider',
    /** A row of items a theme may run [M1, 2026-09-08]. */
    marquee: 'data-kp-marquee',
    label: 'data-kp-label',
    /** The label a stamp takes once the file is open [S49, A11]. */
    labelOpen: 'data-kp-label-open',
    /** Set on the container while the file is open. */
    openState: 'data-kp-open',
    navSide: 'data-kp-nav-side',
});

/** The surfaces a section can stand on [TH116]. */
export const SURFACES = Object.freeze(['hero', 'app']);

/** What an element can be revealed as [TH119, TH120, TH122]. */
export const REVEALS = Object.freeze(['headline', 'emphasis', 'rule']);

/**
 * The routine names a theme may put in a reveal knob, and the arrival
 * names it may put in `--kp-arrival` [G6, 2026-09-08]. A value outside
 * these lists used to fall through the whole chain to the last branch —
 * the glyph noise of cyberpunk — so one letter wrong in a register gave a
 * theme the loudest effect in the package with no warning at all. It is
 * reported as `kp-effect-unknown` now, exactly like an unknown surface,
 * and the element rests instead.
 */
export const HEADLINE_ROUTINES = Object.freeze([
    'decipher',
    'type',
    'dissolve',
    'shout',
    'slam',
    'focus',
    'resolve',
    'blur',
    'sharpen',
    'clip',
    'overprint',
    'gild',
    'wipe',
    'calibrate',
    'ink',
    'arrive',
    'draw',
    'tracking',
    'popdown',
]);
/** What a theme may ask of the page's arrival: synthwave's boot line, phantom's calling card. */
export const ARRIVALS = Object.freeze(['boot', 'card']);

/**
 * The state classes this module toggles, and nothing else. Contract
 * values: a consumer may select on them, a register does.
 */
export const STATE = Object.freeze({
    // The pastel headline [S48, LIFT_PLAN row 6]: the overprint layer
    // springs from a wide mis-registration into its rest position once.
    registering: 'is-registering',
    // The light headline [S48, A1]: the clip window opening once.
    revealing: 'is-revealing',
    // The grotesk headline [S48, LIFT_PLAN row 12]: Hiroto Sato's
    // blur+brightness resolve, a one-shot optical sweep on the whole,
    // unsplit line — no word-splitting, so it is its own routine rather
    // than the shared `focus` word-stagger group shade-dark already owns.
    sharpening: 'is-sharpening',
    in: 'is-in',
    cleared: 'is-cleared',
    deciphered: 'is-deciphered',
    glitching: 'is-glitching',
    noise: 'is-noise',
    // The synthwave routines [SW2]: the tracking wipe and the shine of a
    // headline, and the boot overlay switching off.
    tracking: 'is-tracking',
    shine: 'is-shine',
    off: 'is-off',
    // The lift routines [S48, LIFT_PLAN rows 2–5]: a headline whose words
    // arrive one after another (phantom's shout, brutalism's slam), one that
    // clears out of a dither (retro), one that types itself (terminal).
    words: 'is-words',
    dissolving: 'is-dissolving',
    typing: 'is-typing',
    // The nostromo headline [S48, LIFT_PLAN row 19]: the whole line popping
    // down under a clip-path, its text never touched.
    popping: 'is-popping',
    // The sepia headline [S48, LIFT_PLAN row 9]: the ghost look before the
    // ink-in settle, on only while the transition runs.
    settling: 'is-settling',
    // The solstice headline [S48, LIFT_PLAN row 18]: an overlay of three
    // bands wiping away once over text that never moves.
    calibrating: 'is-calibrating',
    // The mono headline [S48, LIFT_PLAN row 11]: a hard-edge mask sweeping
    // across the whole, unsplit line once.
    revealed: 'is-revealed',
    // The lapis headline [S48, LIFT_PLAN row 6]: a single wipe over the
    // whole clause, once — the gilder's burnishing pass, not a per-word or
    // per-glyph reveal, so it earns its own routine rather than reusing
    // `dissolve` or `type` [S49].
    gilding: 'is-gilding',
});

/**
 * The custom properties a theme declares to say which reveals it performs
 * [S45]: `--kp-reveal-headline: decipher`, `--kp-reveal-emphasis:
 * classified`, `--kp-reveal-rule: draw`. Absent or empty means quiet.
 */
export const ROUTINES = Object.freeze({
    headline: '--kp-reveal-headline',
    emphasis: '--kp-reveal-emphasis',
    rule: '--kp-reveal-rule',
    // How the page arrives, read from the root [SW2]: `boot` builds the
    // overlay below; anything else, or nothing, is quiet.
    arrival: '--kp-arrival',
});
/** The class names of the arrival overlay the module builds. */
export const ARRIVAL = Object.freeze({ root: 'kp-boot', line: 'kp-boot__line', skip: 'kp-boot__skip', bar: 'kp-boot__bar' });
/** The knob a theme sets to put a block cursor inside its fields [TM2, R6-Q7]: `--kp-caret: block`. */
export const CARET_KNOB = '--kp-caret';
/** The knobs a theme's own boot reads [S49, A11]. */
export const KNOBS = Object.freeze({
    /** `block` builds the segmented bar retro's POST counts along. */
    arrivalBar: '--kp-arrival-bar',
    /** What a `{count}` in a boot line counts up to. Default 640, as a memory test reads. */
    arrivalCount: '--kp-arrival-count',
});
/** The custom property the arrival bar's fill reads, 0 to 1. */
export const BOOT_PROGRESS = '--kp-boot-progress';

/** How long one full pass of a marquee takes [M1, 2026-09-08]. */
export const MARQUEE_KNOB = '--kp-marquee';
/** Whether a marquee rests while it is off screen: `offscreen` (default) or `never` [M2]. */
export const MARQUEE_PAUSE_KNOB = '--kp-marquee-pause';

/** The knob blueprint sets to run its own live dimension lines [S48, LIFT_PLAN row 6]: `--kp-measure: live`. */
export const MEASURE_KNOB = '--kp-measure';

/** Set on the root before first paint; the register keys its start states on it [AR34]. */
export const ROOT_ATTRIBUTE = 'data-kp-effects';

/** Set on the root once the reveals of a load have run. */
export const DONE_ATTRIBUTE = 'data-kp-effects-done';

/**
 * The state a reveal is in, on the element that carries it [TF2, 2026-09-09].
 *
 * `DONE_ATTRIBUTE` says the module has finished the page; this says what
 * happened to one element, and it stays readable afterwards. Until now the
 * only signal was the `kp-reveal` event, which is a moment: whoever was
 * not listening when it fired could never learn the answer. A consumer
 * asking "is the dossier armed yet" had nowhere to look, and a test had
 * nothing to wait for — which is how two retro tests could fail under
 * load while passing alone.
 *
 * Three values, and they are the whole truth about an element:
 *   armed  — wired to a trigger and waiting for it; nothing has run
 *   rest   — settled without playing (reduced motion, no routine, seen)
 *   played — the routine ran
 */
export const REVEAL_STATE = 'data-kp-reveal-state';

/** The copy of a headline the register's slice pseudo-elements read. */
export const TEXT_ATTRIBUTE = 'data-kp-text';

/**
 * Dispatched once per page on an element that names a surface or a
 * reveal the vocabulary does not know, bubbling. detail:
 * `{ hook, value, accepted }`. Never thrown [AR44].
 */
export const UNKNOWN_EVENT = 'kp-effect-unknown';

/**
 * Dispatched on an element when its reveal has reached its rest state,
 * bubbling. detail: `{ reveal, routine, skipped }` — `skipped` says the
 * element went straight to rest (reduced motion, a quiet theme, or seen
 * this session) rather than through the motion.
 */
export const REVEAL_EVENT = 'kp-reveal';

/** The sessionStorage key prefix of the once-per-session memo [AR44, M4]. */
export const MEMO_PREFIX = 'kp-effects:';

/** The glyphs a headline deciphers through [AR40]: no block glyphs. */
export const GLYPHS = '01<>/\\|=+*#%@&$?!ZXKQ';

/**
 * DI5 for every animation the package runs [TH129, T20, AR40].
 *
 * One row per keyframe name: how long, how often, what moves, and the
 * opacity at each keyframe step (the luminance the gate rates). The
 * register's keyframes carry no comment of their own; this is the table
 * and gates/check-motion.mjs refuses a keyframe without a row or a row
 * whose steps drift from its keyframe. Rates are reported, never
 * corrected (S42).
 *
 * @type {Readonly<Record<string, { durationMs: number, cycles: number, property: string, luminanceSteps: number[] }>>}
 */
export const TIMINGS = Object.freeze({
    // The 5.0.0 register [S41, C2]: the navbar strip entering, the hover
    // glitch (two steps, once), the headline's slice burst (one burst of
    // six bands, once) and the charge sweep (a transform, no luminance).
    // The synthwave register [SW1]: the tracking wipe and the shine of the
    // chrome headline, the tube that switches on (one dip), the sun cut on
    // a button, the bar entering, the floor's drift and the CRT switching
    // the boot overlay off — every one once, except the drift, which moves
    // a pattern and never changes luminance.
    'kp-tracking': { durationMs: 700, cycles: 1, property: 'opacity', luminanceSteps: [1, 0] },
    'kp-shine': { durationMs: 1400, cycles: 1, property: 'background-position', luminanceSteps: [] },
    'kp-tube-on': { durationMs: 1100, cycles: 1, property: 'color', luminanceSteps: [0, 1, 0, 1] },
    'kp-sun-cut': { durationMs: 360, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 0] },
    'kp-bar-in': { durationMs: 520, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-floor-drift': { durationMs: 6000, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-crt-off': { durationMs: 550, cycles: 1, property: 'opacity', luminanceSteps: [1, 0] },
    // The phantom register [PH1]: the words of a headline shouting in, the
    // film cut of a toast, the loader's bar and its shove out to the left.
    'kp-shout': { durationMs: 620, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-cut-in': { durationMs: 180, cycles: 1, property: 'opacity', luminanceSteps: [0, 0.6, 1] },
    'kp-bar-run': { durationMs: 900, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-load-out': { durationMs: 640, cycles: 1, property: 'transform', luminanceSteps: [] },
    // The retro register [RT1]: the dither clearing off a headline and off
    // the boot screen (four densities, one direction), the selection bar
    // dragging across a mark, the redaction brush lifting.
    'kp-dither-clear': { durationMs: 640, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 1, 1, 0] },
    'kp-dither-out': { durationMs: 520, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 1, 1, 0] },
    'kp-drag-select': { durationMs: 360, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-redact-lift': { durationMs: 400, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    // The terminal register [TM1]: the sweep band that rests eight of ten
    // seconds and the tube collapsing the boot screen.
    'kp-sweep': { durationMs: 10000, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-tube-off': { durationMs: 420, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 0] },
    // The cursor in the box [TM2, R6-Q7]: one character cell on and off, once a second.
    'kp-caret': { durationMs: 1000, cycles: Infinity, property: 'background-size', luminanceSteps: [1, 1, 0, 0] },
    // The shade-dark register [S48, LIFT_PLAN row 24]: the headline's words
    // arriving out of a blur, the hero button and the dossier card settling
    // out of the same blur once on load, and the confirmation dialog's
    // native open/close — the last two shared with academia's, which mounts
    // its dialog the same way.
    'kp-focus': { durationMs: 600, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-focus-in': { durationMs: 500, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-dialog-in': { durationMs: 180, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-backdrop-in': { durationMs: 180, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    // The nostromo register [S48, LIFT_PLAN row 19]: the headline and the
    // dossier stamp popping down under a clip-path, once, on load.
    'kp-popdown': { durationMs: 340, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    // The dark register [S48, LIFT_PLAN row 15]: the headline's word-by-word
    // resolve out of a blur, and the mark's ignite and the rule's sweep —
    // both scroll-bound (animation-timeline: view()), not time-based, so
    // their duration is the demo's own measured pace across the range
    // rather than a clock the browser runs.
    'kp-resolve': { durationMs: 640, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-ignite': { durationMs: 600, cycles: 1, property: 'color', luminanceSteps: [0, 1] },
    'kp-sweep-in': { durationMs: 600, cycles: 1, property: 'background-position', luminanceSteps: [] },
    // The sepia register [S48, LIFT_PLAN row 9]: the confirmation dialog's
    // backdrop fade — a keyframe rather than a transition, because a
    // ::backdrop needs @starting-style to transition on its own appearance
    // and this theme does not use it.
    'kp-confirm-in': { durationMs: 160, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    // The solstice register [S48, LIFT_PLAN row 18]: the calibration wipe
    // over the headline, the rule draw, and the dossier's redaction lift.
    'kp-cal-slide': { durationMs: 740, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-cal-rule': { durationMs: 480, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-cal-redact': { durationMs: 320, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    // The mono register [S48, LIFT_PLAN row 11]: a hard-edge mask sweeping
    // once across a headline (the whole line, unsplit) or a redaction bar.
    // No luminance step: the mask moves, the content under it does not
    // change colour.
    'kp-wipe': { durationMs: 600, cycles: 1, property: 'mask-position', luminanceSteps: [] },
    // The lapis register [S48, LIFT_PLAN row 6]: the burnish, a single
    // clip-path wipe over the headline once, no loop.
    'kp-burnish': { durationMs: 900, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    // The high-contrast register [S48, LIFT_PLAN row 14]: the headline's
    // ellipse wipe and the rule's horizontal scale, both plain CSS with no
    // [data-kp-effects] gate — they run once on every load, not once per
    // session (a deliberate divergence, recorded in that theme's anatomy).
    'kp-hc-headline-wipe': { durationMs: 550, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-hc-rule-wipe': { durationMs: 400, cycles: 1, property: 'transform', luminanceSteps: [] },
    // The brutalism register [BR1]: the words dropping onto their offset and
    // the seamless marquee.
    'kp-slam': { durationMs: 260, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-marquee': { durationMs: 42000, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-strip-in': { durationMs: 520, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-strip-in-end': { durationMs: 520, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-slice-a': { durationMs: 320, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 0] },
    'kp-slice-1': { durationMs: 600, cycles: 1, property: 'opacity', luminanceSteps: [1, 0, 0] },
    'kp-slice-2': { durationMs: 600, cycles: 1, property: 'opacity', luminanceSteps: [1, 0, 0] },
    'kp-charge': { durationMs: 520, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-slide-in': { durationMs: 140, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-rule-in': { durationMs: 420, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-settle': { durationMs: 140, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-blink': { durationMs: 1000, cycles: Infinity, property: 'opacity', luminanceSteps: [1, 1, 0, 0] },
    'kp-drift': { durationMs: 40000, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-ember': { durationMs: 840, cycles: 1, property: 'box-shadow', luminanceSteps: [] },
    'kp-spin': { durationMs: 900, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-pulse': { durationMs: 1600, cycles: Infinity, property: 'opacity', luminanceSteps: [1, 0.6, 1] },
    // The shared marquee [M1, 2026-09-08]: one transform across a doubled
    // row, no luminance change of its own, and the only loop besides
    // brutalism's hatch. The duration is a knob, so this row carries the
    // package default the base layer declares.
    'kp-marquee-pass': { durationMs: 42000, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    // offset — a translate only, no luminance change.
    'kp-kento-blue': { durationMs: 700, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-kento-red': { durationMs: 700, cycles: 1, property: 'transform', luminanceSteps: [] },
    // The pastel register [S48, LIFT_PLAN row 6]: the overprint layer's
    // spring-in (opacity, matched against its own keyframe below) and the
    // mark fill and the rule draw, both transform-free size changes with
    // no luminance step of their own.
    'kp-registration': { durationMs: 650, cycles: 1, property: 'opacity', luminanceSteps: [0, 0.55] },
    'kp-fill': { durationMs: 420, cycles: 1, property: 'background-size', luminanceSteps: [] },
    'kp-draw': { durationMs: 500, cycles: 1, property: 'width', luminanceSteps: [] },
    // The shade-light register [SL2]: the headline's words resolving out
    // of a blur, the lede's marks filling in (a size, not a luminance
    // change), and the dialog rising into place.
    'kp-word-in': { durationMs: 520, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-mark-in': { durationMs: 300, cycles: 1, property: 'background-size', luminanceSteps: [] },
    // The forest register [S48, LIFT_PLAN forest row]: the headline's own
    // fade-in and the contour trace that draws beside it, both CSS-only
    // (no routine — see css/forest-register.css's type section).
    'kp-headline-in': { durationMs: 500, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-trace': { durationMs: 1800, cycles: 1, property: 'stroke-dashoffset', luminanceSteps: [] },
    // The deco register [S48, LIFT_PLAN row 8]: the cartouche's frame
    // scaling in once with the headline, and the dossier's jewel plates
    // clearing on the "Open the file" trigger, staggered 140ms apart.
    'kp-cartouche-in': { durationMs: 520, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-redaction-clear': { durationMs: 320, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    // The light register [S48, LIFT_PLAN, A1]: the headline's rounded clip
    // window opening once (a shape and a fade, never a loop), and the lede
    // marks' background-size sweep with its one colour swap — a highlighter
    // reveal, not a flash.
    'kp-clip-reveal': { durationMs: 620, cycles: 1, property: 'opacity', luminanceSteps: [0, 1, 1] },
    'kp-mark-sweep': { durationMs: 420, cycles: 1, property: 'color', luminanceSteps: [0, 1] },
    // The grotesk register [S48, LIFT_PLAN row 12]: the headline's optical
    // resolve, a monotone blur+brightness sweep, once, on the whole,
    // unsplit line (`kp-sharpen-in` — not `kp-focus-in`/`focus`, which the
    // dark and shade-dark registers already own for their own, different
    // mechanics). The confirmation dialog's one-shot open reuses the
    // `kp-dialog-in` row above, which academia, nostromo and shade-dark
    // already share.
    'kp-sharpen-in': { durationMs: 640, cycles: 1, property: 'filter', luminanceSteps: [] },
    // The blueprint register [S48, LIFT_PLAN row 6]: the headline settling
    // in, and the two dimension lines extending like a tape measure (a
    // transform each, no luminance change) with their labels fading in.
    // The lede's marks and the dossier's redactions are plain transitions
    // on a later class toggle, not keyframes, so they carry no row here —
    // the same choice terminal's own redaction made [TM1].
    'kp-headline-fade': { durationMs: 300, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-dim-draw': { durationMs: 500, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-dim-label': { durationMs: 300, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-elev-draw': { durationMs: 500, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-elev-label': { durationMs: 300, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
});

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
 */

/** Elements this module has started, so a second attach does not start them again [AR34]. */
const started = new WeakSet();
/** Fields whose caret listeners are already bound, so a second attach adds none [G16]. */
const carets = new WeakSet();

/** The unknown hook values reported on this page, `hook=value`, for the diagnostics [AR44]. */
const unknownReported = new Set();

/** What has been reported as unknown on this page, for js/diagnostics.js. */
export function unknownEffects() {
    return [...unknownReported];
}

/**
 * Attach the reveals under `root` and return a handle.
 *
 * @param {Document | Element} [root]
 * @param {EffectsOptions} [options]
 * @returns {EffectsHandle}
 */
export function attachEffects(root = document, options = {}) {
    const doc = root.ownerDocument ?? /** @type {Document} */ (root);
    const html = doc.documentElement;
    const manageRoot = options.manageRoot ?? true;
    const view = doc.defaultView;
    const query = view && typeof view.matchMedia === 'function' ? view.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const reduced = () => options.reduceMotion ?? (query ? query.matches : false);
    const rootStyle = view ? view.getComputedStyle(html) : null;
    /** @param {string} name @param {number} fallback */
    const knob = (name, fallback) => {
        const n = rootStyle ? parseFloat(rootStyle.getPropertyValue(name)) : NaN;
        return Number.isFinite(n) ? n : fallback;
    };
    // The knobs are read once per attach, not per element [AR43].
    const cfg = {
        threshold: options.threshold ?? knob('--kp-reveal-threshold', 0.6),
        cps: options.cps ?? knob('--kp-decipher-cps', 26),
        lead: knob('--kp-decipher-lead', 260),
        swap: knob('--kp-decipher-swap', 0.5),
        stagger: options.stagger ?? knob('--kp-reveal-stagger', 260),
        delay: options.delay ?? knob('--kp-classified-delay', 1500),
        // The word routines: ms between one word arriving and the next.
        wordStagger: knob('--kp-word-stagger', 60),
        // The card arrival: how long the word holds after its bar has run.
        cardHold: knob('--kp-card-hold', 300),
    };
    if (manageRoot) html.setAttribute(ROOT_ATTRIBUTE, '');

    let detached = false;
    /** @type {Set<ReturnType<typeof setTimeout>>} */
    const timers = new Set();
    /** @type {Set<number>} */
    const frames = new Set();
    /** @type {Array<() => void>} */
    const cleanups = [];
    /** @type {Array<() => void>} */
    const finishers = [];
    /** @type {IntersectionObserver | null} */
    let io = null;

    /** The headline's own on-view watcher [S48, academia, LIFT_PLAN row 10]:
     * kept apart from `io` (the rule hook's) so a page whose rule reveal is
     * quiet still gets a working headline draw, and the other way round. */
    /** @type {IntersectionObserver | null} */
    let ioHeadline = null;
    let pending = 0;

    const done = () => {
        if (detached || pending > 0) return;
        html.setAttribute(DONE_ATTRIBUTE, '');
    };
    /** @param {Element} el @param {string} reveal @param {string} routine @param {boolean} skipped */
    const announce = (el, reveal, routine, skipped) => {
        // The readable half of the announcement [TF2]. The event is the
        // moment; this is the record of it, and it outlives the moment.
        el.setAttribute(REVEAL_STATE, skipped ? 'rest' : 'played');
        el.dispatchEvent(new CustomEvent(REVEAL_EVENT, { bubbles: true, detail: { reveal, routine, skipped } }));
    };
    /** @param {() => void} fn @param {number} ms */
    const later = (fn, ms) => {
        const id = setTimeout(() => {
            timers.delete(id);
            if (!detached) fn();
        }, ms);
        timers.add(id);
    };
    /** @param {Element} el @param {'headline' | 'emphasis' | 'rule' | 'arrival'} reveal */
    const routineOf = (el, reveal) => (view ? view.getComputedStyle(el).getPropertyValue(ROUTINES[reveal]).trim() : '');
    /**
     * The memo key: the path, the hook, and the element's position among
     * its kind — so the hero's marks and the dossier's are two memos, and
     * a second headline on the page is its own [AR44].
     *
     * @param {Element} el @param {string} reveal
     */
    const memoKey = (el, reveal) => {
        // Identity, not position [G16, 2026-09-08]. The key used to be the
        // element's index among its siblings of the same reveal, taken
        // over the whole document — so a page that rendered a second
        // headline above the first shifted every index and elements
        // inherited each other's memo: one stopped playing, another played
        // twice. The element's own id when it has one, else its text,
        // which is what a reveal is about in the first place.
        if (reveal === 'emphasis' && el.matches('mark')) return `${MEMO_PREFIX}${view?.location.pathname ?? ''}:${reveal}:loose`;
        const id = el.getAttribute('id');
        const own = id || (el.textContent ?? '').trim().slice(0, 64);
        // Two elements of the same reveal can open with the same words —
        // the concept page carries two dossiers whose first sixty-four
        // characters match — so the ordinal among the ones sharing this
        // key keeps them apart. It is not the element's position on the
        // page, which was the fault: inserting a headline above another
        // used to renumber every one of them.
        const siblings = id
            ? []
            : [...doc.querySelectorAll(`[${HOOKS.reveal}='${reveal}']`)].filter((n) => (n.textContent ?? '').trim().slice(0, 64) === own);
        const kind = siblings.length > 1 ? `${own}#${siblings.indexOf(el)}` : own;
        return `${MEMO_PREFIX}${view?.location.pathname ?? ''}:${reveal}:${kind}`;
    };
    /** @param {Element} el @param {string} reveal @returns {boolean} true when this page already ran the reveal this session */
    const seen = (el, reveal) => {
        if (el.getAttribute(HOOKS.revealEvery) === 'load') return false;
        try {
            const key = memoKey(el, reveal);
            const storage = view?.sessionStorage;
            if (!storage) return false;
            if (storage.getItem(key)) return true;
            storage.setItem(key, '1');
            return false;
        } catch {
            return false;
        }
    };

    // ── Unknown values [AR44] ─────────────────────────────────────────
    /** @param {Element} el */
    /**
     * Report a routine name nothing answers to, once per name, and hand
     * back the empty string so the element rests [G6, 2026-09-08]. Same
     * event and same shape as an unknown surface or reveal: heard, never
     * thrown [AR44].
     *
     * @param {Element} el @param {string} knob @param {string} value @param {readonly string[]} accepted
     * @returns {string}
     */
    const reportUnknownRoutine = (el, knob, value, accepted) => {
        const key = `${knob}=${value}`;
        if (!unknownReported.has(key)) {
            unknownReported.add(key);
            el.dispatchEvent(new CustomEvent(UNKNOWN_EVENT, { bubbles: true, detail: { hook: knob, value, accepted: [...accepted] } }));
        }
        return '';
    };

    /** @param {Element} el */
    const checkValues = (el) => {
        /** @type {[string, readonly string[]][]} */
        const pairs = [
            [HOOKS.surface, SURFACES],
            [HOOKS.reveal, REVEALS],
        ];
        for (const [hook, accepted] of pairs) {
            const value = el.getAttribute(hook);
            if (value === null || accepted.includes(value)) continue;
            const key = `${hook}=${value}`;
            if (unknownReported.has(key)) continue;
            unknownReported.add(key);
            el.dispatchEvent(new CustomEvent(UNKNOWN_EVENT, { bubbles: true, detail: { hook, value, accepted: [...accepted] } }));
        }
    };

    // ── The headline: decipher, then one slice burst [TH119] ───────────
    /** @param {Element} el */
    const headline = (el) => {
        const text = el.textContent ?? '';
        el.setAttribute(TEXT_ATTRIBUTE, text);
        if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', text);
        const asked = routineOf(el, 'headline');
        // A name no routine answers to is reported and then treated as
        // silence [G6]: the chain below ends at decipher, so a typo in a
        // register used to give that theme glyph noise over its headline
        // rather than the rest it asked for.
        const routine =
            asked === '' || HEADLINE_ROUTINES.includes(asked) ? asked : reportUnknownRoutine(el, ROUTINES.headline, asked, HEADLINE_ROUTINES);
        /** @param {boolean} skipped */
        const rest = (skipped) => {
            el.textContent = text;
            el.classList.add(STATE.deciphered);
            announce(el, 'headline', routine, skipped);
        };
        if (routine === '' || reduced() || seen(el, 'headline')) {
            rest(true);
            return;
        }
        if (routine === 'tracking') {
            // The synthwave headline [SW2]: the text stays whole; one tracking
            // wipe crosses it, then one shine. The register animates the
            // classes; without an animation the classes come off by the
            // table's durations, so nothing waits on an event that never comes.
            pending++;
            let ended = false;
            const shine = () => {
                if (ended) return;
                ended = true;
                el.classList.remove(STATE.tracking);
                el.classList.add(STATE.shine);
                const off = () => el.classList.remove(STATE.shine);
                el.addEventListener('animationend', off, { once: true });
                later(off, TIMINGS['kp-shine'].durationMs + 50);
                rest(false);
                pending--;
                done();
            };
            finishers.push(shine);
            el.classList.add(STATE.tracking);
            const onEnd = (/** @type {Event} */ e) => {
                if (/** @type {AnimationEvent} */ (e).animationName !== 'kp-tracking') return;
                el.removeEventListener('animationend', onEnd);
                shine();
            };
            el.addEventListener('animationend', onEnd);
            later(shine, TIMINGS['kp-tracking'].durationMs + 50);
            return;
        }
        if (routine === 'popdown') {
            // The nostromo headline [S48, LIFT_PLAN nostromo row]: the text
            // stays whole throughout — no glyph or word is ever touched —
            // under a clip-path the register sweeps open top-down; the
            // class runs it, then the element rests. Without an animation
            // the class comes off by the table's duration.
            pending++;
            el.classList.add(STATE.popping);
            let ended = false;
            const finish = () => {
                if (ended) return;
                ended = true;
                el.classList.remove(STATE.popping);
                rest(false);
                pending--;
                done();
            };
            finishers.push(finish);
            const onEnd = (/** @type {Event} */ e) => {
                if (/** @type {AnimationEvent} */ (e).animationName !== 'kp-popdown') return;
                el.removeEventListener('animationend', onEnd);
                finish();
            };
            el.addEventListener('animationend', onEnd);
            later(finish, TIMINGS['kp-popdown'].durationMs + 50);
            return;
        }
        if (routine === 'draw') {
            // The academia headline [lift row 10]: the words are never
            // touched — no noise, no split into words. A rule beneath the
            // heading grows in once it enters the viewport, the exact
            // mechanism `rule()` below already performs, generalised to
            // h1 because the approved demo drives both off one
            // IntersectionObserver and one class ("The Reading Room",
            // 2026-09-08). The register paints the draw; this only
            // watches and flips the class.
            if (!view || typeof view.IntersectionObserver !== 'function') {
                el.classList.add(STATE.in);
                announce(el, 'headline', routine, true);
                return;
            }
            pending++;
            finishers.push(() => {
                el.classList.add(STATE.in);
                announce(el, 'headline', routine, false);
            });
            ioHeadline ??= new view.IntersectionObserver(
                (entries) => {
                    for (const entry of entries) {
                        if (!entry.isIntersecting) continue;
                        ioHeadline?.unobserve(entry.target);
                        entry.target.classList.add(STATE.in);
                        announce(entry.target, 'headline', routine, false);
                        pending--;
                        done();
                    }
                },
                { threshold: cfg.threshold },
            );
            ioHeadline.observe(el);
            return;
        }
        if (routine === 'arrive') {
            // The formal headline [S49, LIFT_PLAN row 16]: whole and
            // untouched — this theme does not glitch or type, it commits.
            // Nothing here manipulates a character; the class the register
            // reads (STATE.deciphered, same completion marker every
            // routine sets) is held off by one frame past the next, the
            // same two-`requestAnimationFrame` technique the approved demo
            // used itself, so the browser paints the hidden state before a
            // plain CSS transition (fade, rise) carries it to rest.
            pending++;
            let ended = false;
            const finish = () => {
                if (ended) return;
                ended = true;
                rest(false);
                pending--;
                done();
            };
            finishers.push(finish);
            const arm = () => later(finish, 500);
            if (view) view.requestAnimationFrame(() => view.requestAnimationFrame(arm));
            else arm();
            return;
        }
        if (routine === 'ink') {
            // The sepia headline [S48, LIFT_PLAN row 9]: no per-word
            // stagger — the whole line is one CSS transition, a faint
            // ghost of the ink colour settling to the full one, because
            // this theme (anatomy.md) is "unhurried on purpose". `settling`
            // is transient like `dissolving`/`typing`: added, then removed
            // once the transition has run, so a quiet theme or reduced
            // motion — which skip straight to `rest(true)` above and never
            // add it — render the plain, already-settled headline rather
            // than a permanent ghost. A transition, not a keyframe
            // animation (css/sepia-register.css carries no `@keyframes`
            // for it, so it has no TIMINGS row).
            pending++;
            el.classList.add(STATE.settling);
            let ended = false;
            const finish = () => {
                if (ended) return;
                ended = true;
                el.classList.remove(STATE.settling);
                rest(false);
                pending--;
                done();
            };
            finishers.push(finish);
            const onEnd = (/** @type {Event} */ e) => {
                if (/** @type {TransitionEvent} */ (e).propertyName !== 'filter' || e.target !== el) return;
                el.removeEventListener('transitionend', onEnd);
                finish();
            };
            el.addEventListener('transitionend', onEnd);
            // One frame at the ghost values, painted with `settling` on,
            // before the class comes off and the transition it guards
            // carries the properties back to their plain, settled values
            // over the next 1050ms — the demo's own requestAnimationFrame,
            // not a synchronous removal a browser could coalesce into the
            // first paint and skip the transition for.
            const off = () => el.classList.remove(STATE.settling);
            if (view) view.requestAnimationFrame(off);
            else off();
            later(finish, 1050 + 50);
            return;
        }
        if (routine === 'calibrate') {
            // The solstice headline [S49, A1]: the text is whole and solid
            // under a mix-blend-mode overlay the register paints; the class
            // runs the overlay's one wipe, then the element rests. Without
            // an animation the class comes off by the table's duration.
            pending++;
            el.classList.add(STATE.calibrating);
            let ended = false;
            const finish = () => {
                if (ended) return;
                ended = true;
                el.classList.remove(STATE.calibrating);
                rest(false);
                pending--;
                done();
            };
            finishers.push(finish);
            const onEnd = (/** @type {Event} */ e) => {
                if (/** @type {AnimationEvent} */ (e).animationName !== 'kp-cal-slide') return;
                el.removeEventListener('animationend', onEnd);
                finish();
            };
            el.addEventListener('animationend', onEnd);
            later(finish, TIMINGS['kp-cal-slide'].durationMs + 50);
            return;
        }
        if (routine === 'wipe') {
            // The mono headline [S48, LIFT_PLAN row 6]: the text stays whole,
            // never split into words or glyphs; the register sweeps a
            // hard-edge mask across it once, left to right — rauno.me's
            // verticalFade, adapted from opacity to mask-position so nothing
            // ever flashes. The class arms the register's own animation;
            // without one the class comes off by the table's duration.
            pending++;
            el.classList.add(STATE.revealed);
            let ended = false;
            const finish = () => {
                if (ended) return;
                ended = true;
                el.classList.remove(STATE.revealed);
                rest(false);
                pending--;
                done();
            };
            finishers.push(finish);
            const onEnd = (/** @type {Event} */ e) => {
                if (/** @type {AnimationEvent} */ (e).animationName !== 'kp-wipe') return;
                el.removeEventListener('animationend', onEnd);
                finish();
            };
            el.addEventListener('animationend', onEnd);
            later(finish, TIMINGS['kp-wipe'].durationMs + 50);
            return;
        }
        if (routine === 'gild') {
            // The lapis headline [S48, LIFT_PLAN row 6]: the text is whole
            // and already gold; the class runs one clip-path wipe left to
            // right (the register's `kp-burnish` keyframe), then the
            // element rests. Without an animation the class comes off by
            // the table's duration — same shape as `dissolve`, a different
            // keyframe, because the demo's mechanism is neither a dither
            // nor a per-glyph type [S49].
            pending++;
            el.classList.add(STATE.gilding);
            let ended = false;
            const finish = () => {
                if (ended) return;
                ended = true;
                el.classList.remove(STATE.gilding);
                rest(false);
                pending--;
                done();
            };
            finishers.push(finish);
            const onEnd = (/** @type {Event} */ e) => {
                if (/** @type {AnimationEvent} */ (e).animationName !== 'kp-burnish') return;
                el.removeEventListener('animationend', onEnd);
                finish();
            };
            el.addEventListener('animationend', onEnd);
            later(finish, TIMINGS['kp-burnish'].durationMs + 50);
            return;
        }
        if (routine === 'sharpen') {
            // The grotesk headline [S49, LIFT_PLAN row 12]: the text is whole
            // under a blur+brightness the register paints; the class runs the
            // one-shot optical resolve, then the element rests. Without an
            // animation the class comes off by the table's duration. Its own
            // routine name and keyframe, distinct from the `focus` word-
            // stagger group and `kp-focus-in` shade-dark already owns.
            pending++;
            el.classList.add(STATE.sharpening);
            let ended = false;
            const finish = () => {
                if (ended) return;
                ended = true;
                el.classList.remove(STATE.sharpening);
                rest(false);
                pending--;
                done();
            };
            finishers.push(finish);
            const onEnd = (/** @type {Event} */ e) => {
                if (/** @type {AnimationEvent} */ (e).animationName !== 'kp-sharpen-in') return;
                el.removeEventListener('animationend', onEnd);
                finish();
            };
            el.addEventListener('animationend', onEnd);
            later(finish, TIMINGS['kp-sharpen-in'].durationMs + 50);
            return;
        }

        if (routine === 'clip') {
            // The light headline [S48, LIFT_PLAN, A1]: the text is whole the
            // entire time — no noise, no dither, no per-word stagger — and
            // the register opens a rounded clip window around it once. The
            // class runs the reveal; without an animation the class comes
            // off by the table's duration, same shape as dissolve above.
            pending++;
            el.classList.add(STATE.revealing);
            let ended = false;
            const finish = () => {
                if (ended) return;
                ended = true;
                el.classList.remove(STATE.revealing);
                rest(false);
                pending--;
                done();
            };
            finishers.push(finish);
            const onEnd = (/** @type {Event} */ e) => {
                if (/** @type {AnimationEvent} */ (e).animationName !== 'kp-clip-reveal') return;
                el.removeEventListener('animationend', onEnd);
                finish();
            };
            el.addEventListener('animationend', onEnd);
            later(finish, TIMINGS['kp-clip-reveal'].durationMs + 50);
            return;
        }

        if (routine === 'overprint') {
            // The pastel headline [S48, LIFT_PLAN row 6]: the text is
            // whole; the register's ::before duplicate (the second-ink
            // layer, already there at its rest offset for a no-script
            // page) springs from a wide mis-registration into that rest
            // position once. The element's own text never changes.
            pending++;
            el.classList.add(STATE.registering);
            let ended = false;
            const finish = () => {
                if (ended) return;
                ended = true;
                el.classList.remove(STATE.registering);
                rest(false);
                pending--;
                done();
            };
            finishers.push(finish);
            const onEnd = (/** @type {Event} */ e) => {
                if (/** @type {AnimationEvent} */ (e).animationName !== 'kp-registration') return;
                el.removeEventListener('animationend', onEnd);
                finish();
            };
            el.addEventListener('animationend', onEnd);
            later(finish, TIMINGS['kp-registration'].durationMs + 50);
            return;
        }

        if (routine === 'shout' || routine === 'slam' || routine === 'focus' || routine === 'resolve' || routine === 'blur') {
            // A word routine [PH2, BR2, S48 shade-dark and dark]: every word in its own span with its
            // index, the register animates them one after another by
            // `--kp-i`; the element ends as its own text. The keyframe is
            // `kp-<routine>` and its row in TIMINGS says how long one word
            // takes; the stagger is the theme's knob. One routine names its
            // keyframe otherwise: shade-light's `blur` runs `kp-word-in`,
            // the name its own approved demo used [SL2, S49].
            pending++;
            const parts = text.split(/(\s+)/);
            let index = 0;
            const nodes = parts.map((part) => {
                if (part === '') return null;
                if (/^\s+$/.test(part)) return doc.createTextNode(part);
                const span = doc.createElement('span');
                span.setAttribute('data-word', '');
                span.setAttribute('aria-hidden', 'true');
                span.style.setProperty('--kp-i', String(index++));
                span.textContent = part;
                return span;
            });
            el.replaceChildren(...nodes.filter((n) => n !== null));
            el.classList.add(STATE.words);
            let ended = false;
            const finish = () => {
                if (ended) return;
                ended = true;
                el.classList.remove(STATE.words);
                rest(false);
                pending--;
                done();
            };
            finishers.push(finish);
            const keyframe = routine === 'blur' ? 'kp-word-in' : `kp-${routine}`;
            later(finish, TIMINGS[keyframe].durationMs + index * cfg.wordStagger + 50);
            return;
        }
        if (routine === 'dissolve') {
            // The retro headline [RT2]: the text is whole under a dither the
            // register paints; the class runs the dither's clearing, then the
            // element rests. Without an animation the class comes off by the
            // table's duration.
            pending++;
            el.classList.add(STATE.dissolving);
            let ended = false;
            const finish = () => {
                if (ended) return;
                ended = true;
                el.classList.remove(STATE.dissolving);
                rest(false);
                pending--;
                done();
            };
            finishers.push(finish);
            const onEnd = (/** @type {Event} */ e) => {
                if (/** @type {AnimationEvent} */ (e).animationName !== 'kp-dither-clear') return;
                el.removeEventListener('animationend', onEnd);
                finish();
            };
            el.addEventListener('animationend', onEnd);
            later(finish, TIMINGS['kp-dither-clear'].durationMs + 50);
            return;
        }
        if (routine === 'type') {
            // The terminal headline [TM2]: typed one glyph at a time at the
            // decipher rate, a block caret riding the last one; the caret
            // leaves with the last glyph and the element rests as its text.
            pending++;
            const chars = [...text];
            const caret = doc.createElement('span');
            caret.setAttribute('data-caret', '');
            caret.setAttribute('aria-hidden', 'true');
            el.classList.add(STATE.typing);
            el.textContent = '';
            el.append(caret);
            let typed = 0;
            let ended = false;
            const finish = () => {
                if (ended) return;
                ended = true;
                el.classList.remove(STATE.typing);
                rest(false);
                pending--;
                done();
            };
            finishers.push(finish);
            const perChar = 1000 / Math.max(1, cfg.cps);
            const step = () => {
                if (ended) return;
                typed++;
                el.textContent = chars.slice(0, typed).join('');
                if (typed < chars.length) {
                    el.append(caret);
                    later(step, perChar);
                } else finish();
            };
            later(step, cfg.lead);
            return;
        }
        pending++;
        const chars = [...text];
        const spans = chars.map((ch) => {
            const span = doc.createElement('span');
            span.setAttribute('data-glyph', '');
            span.setAttribute('aria-hidden', 'true');
            if (/\s/.test(ch)) span.textContent = ch;
            else {
                span.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
                span.classList.add(STATE.noise);
            }
            return span;
        });
        el.replaceChildren(...spans);
        const perChar = 1000 / Math.max(1, cfg.cps);
        let start = 0;
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            rest(false);
            el.classList.add(STATE.glitching);
            const off = () => el.classList.remove(STATE.glitching);
            el.addEventListener('animationend', off, { once: true });
            // No animation (a quiet register, or reduced motion switched on
            // mid-run): the class comes off on its own.
            later(off, TIMINGS['kp-slice-1'].durationMs + 50);
            pending--;
            done();
        };
        finishers.push(finish);
        /** @param {number} now */
        const tick = (now) => {
            frames.delete(id);
            if (detached || finished) return;
            if (start === 0) start = now;
            const t = now - start;
            let all = true;
            spans.forEach((span, i) => {
                const ch = chars[i] ?? '';
                if (/\s/.test(ch)) return;
                if (t > cfg.lead + i * perChar) {
                    if (span.classList.contains(STATE.noise)) {
                        span.textContent = ch;
                        span.classList.remove(STATE.noise);
                    }
                } else {
                    all = false;
                    if (Math.random() < cfg.swap) span.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
                }
            });
            if (all) finish();
            else id = schedule();
        };
        let id = 0;
        const schedule = () => {
            const next = view ? view.requestAnimationFrame(tick) : 0;
            frames.add(next);
            return next;
        };
        id = schedule();
    };

    // ── Emphasis: marks clear themselves, or on a trigger [TH120] ──────
    /** @param {Element[]} marks @param {number} first @param {number} step @param {Element} on @param {string} routine */
    const clearInSteps = (marks, first, step, on, routine) => {
        if (marks.length === 0) return;
        pending++;
        finishers.push(() => {
            for (const mark of marks) mark.classList.add(STATE.cleared);
        });
        marks.forEach((mark, i) => {
            later(
                () => {
                    mark.classList.add(STATE.cleared);
                    if (i === marks.length - 1) {
                        pending--;
                        announce(on, 'emphasis', routine, false);
                        done();
                    }
                },
                first + i * step,
            );
        });
    };
    /** @param {Element} container an element carrying data-kp-reveal="emphasis" */
    const emphasis = (container) => {
        const marks = [...container.querySelectorAll('mark')];
        // A register whose plate drags the words in with it reads them
        // from here [S49, A11, retro]: the element's own text, copied to
        // the same attribute a headline carries, never authored copy.
        for (const mark of marks) if (!mark.hasAttribute(TEXT_ATTRIBUTE)) mark.setAttribute(TEXT_ATTRIBUTE, mark.textContent ?? '');
        // The emphasis knob carries the register's own vocabulary — plate,
        // wash, redact, ignite — because the module does the same thing
        // whatever it is called: cover the marks, clear them on the
        // trigger. Only a name the module branches on can be wrong, which
        // is why the headline knob is checked and this one is not.
        const routine = routineOf(container, 'emphasis');
        const trigger = container.querySelector(`[${HOOKS.revealTrigger}]`);
        // A container with nothing to clear (a button that carries the hook
        // for its own reveal) touches neither the marks nor the memo.
        if (marks.length === 0) {
            announce(container, 'emphasis', routine, true);
            return;
        }
        const atRest = () => {
            for (const mark of marks) mark.classList.add(STATE.cleared);
            announce(container, 'emphasis', routine, true);
        };
        if (routine === '' || reduced()) {
            atRest();
            if (trigger) wireTrigger(trigger, marks, container, routine);
            return;
        }
        if (trigger) {
            // The dossier: the marks stay covered until the trigger opens the
            // file; the register staggers the lift. A second press closes it.
            wireTrigger(trigger, marks, container, routine);
            trigger.setAttribute('aria-pressed', 'false');
            // Armed is a state, and it was the one nobody could see: this
            // branch announces nothing, because nothing has happened yet
            // [TF2]. It still has to be readable, or "waiting for a click"
            // and "never wired at all" look identical from outside.
            container.setAttribute(REVEAL_STATE, 'armed');
            return;
        }
        if (seen(container, 'emphasis')) {
            atRest();
            return;
        }
        clearInSteps(marks, cfg.delay, cfg.stagger, container, routine);
    };
    /** @param {Element} trigger @param {Element[]} marks @param {Element} container @param {string} routine */
    const wireTrigger = (trigger, marks, container, routine) => {
        const onClick = () => {
            const open = trigger.getAttribute('aria-pressed') !== 'true';
            trigger.setAttribute('aria-pressed', String(open));
            for (const mark of marks) mark.classList.toggle(STATE.cleared, open);
            // The stamp a theme changes when the file opens [S49, A11]:
            // the second word is the page's (data-kp-label-open), and the
            // register swaps to it while this attribute is set.
            container.toggleAttribute(HOOKS.openState, open);
            // announce() writes 'played' here, which is right: the trigger
            // is what makes it play. Closing it again is a play too — the
            // marks move either way [TF2].
            announce(container, 'emphasis', routine, false);
        };
        trigger.addEventListener('click', onClick);
        cleanups.push(() => trigger.removeEventListener('click', onClick));
    };
    /** The marks outside any emphasis container clear on load, one after another. */
    /** @param {ParentNode} scope */
    const looseMarks = (scope) => {
        const marks = [...scope.querySelectorAll('mark')].filter((m) => m.closest(`[${HOOKS.reveal}='emphasis']`) === null && !started.has(m));
        if (marks.length === 0) return;
        for (const mark of marks) if (!mark.hasAttribute(TEXT_ATTRIBUTE)) mark.setAttribute(TEXT_ATTRIBUTE, mark.textContent ?? '');
        for (const m of marks) started.add(m);
        const first = marks[0];
        const routine = routineOf(first, 'emphasis');
        if (routine === '' || reduced() || seen(first, 'emphasis')) {
            for (const mark of marks) mark.classList.add(STATE.cleared);
            announce(first, 'emphasis', routine, true);
            return;
        }
        clearInSteps(marks, cfg.delay, cfg.stagger, first, routine);
    };

    // ── The rule: drawn when its heading enters the viewport [TH122] ───
    /** @param {Element} el */
    const rule = (el) => {
        const routine = routineOf(el, 'rule');
        /** @param {boolean} skipped */
        const draw = (skipped) => {
            el.classList.add(STATE.in);
            announce(el, 'rule', routine, skipped);
        };
        if (routine === '' || reduced() || seen(el, 'rule') || !view || typeof view.IntersectionObserver !== 'function') {
            draw(true);
            return;
        }
        pending++;
        finishers.push(() => draw(false));
        io ??= new view.IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    io?.unobserve(entry.target);
                    entry.target.classList.add(STATE.in);
                    announce(entry.target, 'rule', routine, false);
                    pending--;
                    done();
                }
            },
            { threshold: cfg.threshold },
        );
        io.observe(el);
    };

    // ── Dispatch ──────────────────────────────────────────────────────
    /** @param {Element} el */
    const startOne = (el) => {
        if (started.has(el)) return;
        checkValues(el);
        const reveal = el.getAttribute(HOOKS.reveal);
        if (reveal === null || !REVEALS.includes(reveal)) return;
        started.add(el);
        if (reveal === 'headline') headline(el);
        else if (reveal === 'emphasis') emphasis(el);
        else rule(el);
    };
    /** @param {ParentNode | Element} scope */
    const scan = (scope) => {
        if (scope instanceof Element && scope.hasAttribute(HOOKS.reveal)) startOne(scope);
        if (scope instanceof Element && scope.hasAttribute(HOOKS.surface)) checkValues(scope);
        for (const el of scope.querySelectorAll(`[${HOOKS.surface}], [${HOOKS.reveal}]`)) startOne(el);
        looseMarks(scope);
        done();
    };

    // Reduced motion switched on mid-session: every running reveal
    // resolves to its rest state at once [DI7].
    const onPreference = () => {
        if (!reduced()) return;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const id of frames) view?.cancelAnimationFrame(id);
        frames.clear();
        io?.disconnect();
        io = null;
        // Everything the module started, not only the rule's observer
        // [G8, 2026-09-08]. The draw routine keeps its own observer, the
        // marquee keeps one per band, and the caret and the measuring
        // lines hold listeners; leaving those running meant a reveal
        // still fired after somebody asked for the motion to stop, and
        // the count went negative when it did.
        ioHeadline?.disconnect();
        ioHeadline = null;
        for (const cleanup of cleanups.splice(0)) cleanup();
        for (const finish of finishers.splice(0)) finish();
        pending = 0;
        done();
    };
    // The subscription to the preference is deliberately not in
    // `cleanups`: onPreference empties that list to stop the observers and
    // listeners the routines made, and it must not unsubscribe itself
    // while doing so. detach() drops it explicitly [G8].
    if (query) query.addEventListener('change', onPreference);

    scan(root);

    // ── The caret [TM2, R6-Q7]: a block cursor inside the focused field ─
    // A theme answers `--kp-caret: block` on the root; the module only
    // writes the column (`--kp-col`, in the field's own ch, clamped to the
    // field's width) that the register paints the block at, so the cursor
    // lives in the box at the caret and never after the label — Kenny's
    // reading of 2026-09-08. Text-like inputs only; a textarea keeps the
    // browser's own caret.
    const caret = () => {
        const routine = rootStyle ? rootStyle.getPropertyValue(CARET_KNOB).trim() : '';
        if (routine !== 'block' || !view) return;
        const inputs = /** @type {HTMLInputElement[]} */ ([...root.querySelectorAll('input.kp-field__input')]).filter((el) =>
            /^(text|email|search|url|tel|password)?$/.test(el.getAttribute('type') ?? ''),
        );
        for (const input of inputs) {
            // One set of listeners per field, however often the module is
            // attached [G16]: a consumer that calls attachEffects twice —
            // a framework remount, an explicit re-scan — used to give
            // every field a second caret handler.
            if (carets.has(input)) continue;
            carets.add(input);
            const put = () => {
                if (!view) return;
                const cs = view.getComputedStyle(input);
                const probe = doc.createElement('span');
                probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;';
                probe.style.font = cs.font || `${cs.fontSize} ${cs.fontFamily}`;
                probe.textContent = '0'.repeat(20);
                doc.body?.append(probe);
                const ch = probe.getBoundingClientRect().width / 20 || 8;
                probe.remove();
                const room = input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
                const max = Math.max(0, Math.floor(room / ch) - 1);
                const col = Math.min(input.selectionStart ?? input.value.length, max);
                input.style.setProperty('--kp-col', String(col));
            };
            const clear = () => input.style.removeProperty('--kp-col');
            const events = ['input', 'keyup', 'click', 'focus', 'select'];
            for (const ev of events) input.addEventListener(ev, put);
            input.addEventListener('blur', clear);
            cleanups.push(() => {
                for (const ev of events) input.removeEventListener(ev, put);
                input.removeEventListener('blur', clear);
                clear();
            });
        }
    };
    caret();

    // ── The measurement lines [S48, LIFT_PLAN row 6]: blueprint's own ──
    // A theme answers `--kp-measure: live` on the root. The module wraps
    // its headline in a span it can measure and builds the two dimension
    // lines beside it: the vertical one is sized by CSS containment alone
    // (`top: 0; bottom: 0` inside the wrap the register gives a definite
    // height), the horizontal one by a live pixel read set as the line's
    // own `style.width` and printed into its label in the same breath —
    // one measurement, two readouts, so the line is never a fixed width.
    // Runs once, after scan() has already put the headline at its rest
    // text, so nothing here fights the decipher/type/word routines for
    // the same child nodes.
    const measure = () => {
        const routine = rootStyle ? rootStyle.getPropertyValue(MEASURE_KNOB).trim() : '';
        if (routine !== 'live' || !view) return;
        const words = getStrings();
        const headlines = [...root.querySelectorAll(`[${HOOKS.reveal}='headline']`)].filter((h) => !h.closest('[data-kp-measured]'));
        for (const h1 of headlines) {
            const wrap = doc.createElement('span');
            wrap.setAttribute('data-kp-measured', '');
            h1.replaceWith(wrap);

            const elevLine = doc.createElement('span');
            elevLine.setAttribute('data-kp-elev-line', '');
            elevLine.setAttribute('aria-hidden', 'true');
            const elevStart = doc.createElement('span');
            elevStart.setAttribute('data-kp-elev-tick', '');
            const elevEnd = doc.createElement('span');
            elevEnd.setAttribute('data-kp-elev-tick', '');
            const elevLabel = doc.createElement('span');
            elevLabel.setAttribute('data-kp-elev-measure', '');
            elevLabel.textContent = words.measureLoading;
            elevLine.append(elevStart, elevEnd, elevLabel);
            wrap.append(elevLine, h1);

            const dim = doc.createElement('span');
            dim.setAttribute('data-kp-dim', '');
            dim.setAttribute('aria-hidden', 'true');
            const dimLine = doc.createElement('span');
            dimLine.setAttribute('data-kp-dim-line', '');
            const dimStart = doc.createElement('span');
            dimStart.setAttribute('data-kp-dim-tick', '');
            const dimEnd = doc.createElement('span');
            dimEnd.setAttribute('data-kp-dim-tick', '');
            dimLine.append(dimStart, dimEnd);
            const dimLabel = doc.createElement('span');
            dimLabel.setAttribute('data-kp-measure', '');
            dimLabel.textContent = words.measureLoading;
            dim.append(dimLine, dimLabel);
            wrap.after(dim);

            /** @type {ReturnType<typeof setTimeout>} */
            let timer;
            const update = () => {
                const w = Math.round(h1.getBoundingClientRect().width);
                dimLine.style.width = `${w}px`;
                dimLabel.textContent = words.measureWidth(w);
                const h = Math.round(wrap.getBoundingClientRect().height);
                elevLabel.textContent = words.measureHeight(h);
            };
            update();
            const schedule = () => {
                clearTimeout(timer);
                timer = setTimeout(update, 100);
            };
            view.addEventListener('resize', schedule);
            cleanups.push(() => {
                clearTimeout(timer);
                view?.removeEventListener('resize', schedule);
            });
            try {
                if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(update);
            } catch {
                // no font-loading API: the load-time measurement stands
            }
        }
    };
    measure();

    // ── The marquee [M1, M2]: a row that runs ──────────────────────────
    // The consumer writes the items once; a seamless loop needs the row
    // twice, so the module builds the track, moves the items into the
    // first run and clones it into a second the screen reader skips. The
    // attributes it writes are what the base layer keys on, so a page
    // without this module shows the items standing still rather than a
    // half-built band [T17, AR34].
    const marquee = () => {
        for (const band of root.querySelectorAll(`[${HOOKS.marquee}]`)) {
            if (band.hasAttribute('data-kp-marquee-ready')) continue;
            const items = [...band.childNodes];
            if (items.length === 0) continue;
            const track = doc.createElement('div');
            track.setAttribute('data-kp-marquee-track', '');
            const run = doc.createElement('div');
            run.setAttribute('data-kp-marquee-run', '');
            run.append(...items);
            const copy = /** @type {HTMLElement} */ (run.cloneNode(true));
            copy.setAttribute('aria-hidden', 'true');
            track.append(run, copy);
            band.append(track);
            band.setAttribute('data-kp-marquee-ready', '');
            // Two runs, so the -50% pass lands exactly where it started.
            band.setAttribute('data-kp-marquee-runs', '2');

            const pause = (rootStyle ? rootStyle.getPropertyValue(MARQUEE_PAUSE_KNOB).trim() : '') || 'offscreen';
            if (pause !== 'offscreen' || !view || !('IntersectionObserver' in view)) continue;
            // Paused, not stopped: the animation keeps its position and
            // carries on from it when the band comes back into view.
            const observer = new view.IntersectionObserver(
                (entries) => {
                    for (const entry of entries) entry.target.toggleAttribute('data-kp-paused', !entry.isIntersecting);
                },
                { threshold: 0 },
            );
            observer.observe(band);
            cleanups.push(() => observer.disconnect());
        }
    };
    marquee();

    // ── The arrival [SW2]: how the page comes on ───────────────────────
    // A theme answers `--kp-arrival` on the root; `boot` is synthwave's:
    // a diegetic line counting up in the overlay the register paints, a
    // Skip button, and the CRT switching the overlay off. `card` is
    // phantom's [PH2]: the theme's own name as the line, a bar the register
    // runs under it, and the overlay shoved off to the left. Once per
    // session, never under reduced motion, and every word from the
    // dictionary [KT5] — a theme's name is data, not copy.
    const arrival = () => {
        const asked = rootStyle ? rootStyle.getPropertyValue(ROUTINES.arrival).trim() : '';
        const routine = asked === '' || ARRIVALS.includes(asked) ? asked : reportUnknownRoutine(html, ROUTINES.arrival, asked, ARRIVALS);
        if ((routine !== 'boot' && routine !== 'card') || !doc.body) return;
        const card = routine === 'card';
        if (reduced() || seen(html, 'arrival')) {
            announce(html, 'arrival', routine, true);
            return;
        }
        const words = getStrings();
        const overlay = doc.createElement('div');
        overlay.className = ARRIVAL.root;
        const line = doc.createElement('pre');
        line.className = ARRIVAL.line;
        line.setAttribute('aria-live', 'polite');
        const skip = doc.createElement('button');
        skip.type = 'button';
        skip.className = ARRIVAL.skip;
        skip.textContent = words.arrivalSkip;
        // The segmented bar retro's POST counts along [S49, A11]: built
        // only when the theme asks for one, and painted by its register.
        const bar = rootStyle?.getPropertyValue(KNOBS.arrivalBar).trim() === 'block' ? doc.createElement('div') : null;
        if (bar) {
            bar.className = ARRIVAL.bar;
            bar.setAttribute('aria-hidden', 'true');
            bar.style.setProperty(BOOT_PROGRESS, '0');
        }
        overlay.append(line, ...(bar ? [bar] : []), skip);
        doc.body.append(overlay);
        pending++;
        let ended = false;
        let pct = 0;
        const remove = () => {
            overlay.remove();
            announce(html, 'arrival', routine, false);
            pending--;
            done();
        };
        const end = () => {
            if (ended) return;
            ended = true;
            if (reduced()) {
                remove();
                return;
            }
            overlay.classList.add(STATE.off);
            overlay.addEventListener('animationend', remove, { once: true });
            later(remove, TIMINGS[card ? 'kp-load-out' : 'kp-crt-off'].durationMs + 50);
        };
        const step = () => {
            if (ended) return;
            pct = Math.min(100, pct + 7 + Math.floor(Math.random() * 9));
            line.textContent = [words.arrivalLine, words.arrivalProgress + ' ' + pct + '%', pct === 100 ? words.arrivalReady : '']
                .filter(Boolean)
                .join('\n');
            bar?.style.setProperty(BOOT_PROGRESS, String(pct / 100));
            if (pct === 100) later(end, 220);
            else later(step, 110);
        };

        // The lines mode [S49, A11]: a theme whose own boot is a POST
        // shows its lines one after another, cumulatively, rather than a
        // percentage — retro's BIOS banner and memory test, terminal's
        // five lines. The words are the dictionary's (KT5), the cadence
        // the demos' own 190ms, and a `{count}` counts up to the theme's
        // declared total the way a memory test does.
        const lines = words.arrivalLinesByTheme?.[html.getAttribute('data-theme') ?? ''] ?? null;
        let shown = 0;
        const total = Number(rootStyle?.getPropertyValue(KNOBS.arrivalCount)) || 640;
        const lineStep = () => {
            if (ended || !lines) return;
            shown++;
            const upto = lines.slice(0, shown);
            line.textContent = upto
                .map((/** @type {string} */ text, /** @type {number} */ index) =>
                    text.replace('{count}', String(index === shown - 1 ? Math.round((total * shown) / lines.length) : total)),
                )
                .join('\n');
            bar?.style.setProperty(BOOT_PROGRESS, String(shown / lines.length));
            if (shown === lines.length) later(end, 320);
            else later(lineStep, 190);
        };
        skip.addEventListener('click', end);
        finishers.push(end);
        cleanups.push(() => overlay.remove());
        if (card) {
            line.textContent = html.getAttribute('data-theme') ?? '';
            later(end, TIMINGS['kp-bar-run'].durationMs + cfg.cardHold);
        } else if (lines && lines.length > 0) lineStep();
        else step();
    };
    arrival();

    return {
        detach() {
            if (detached) return;
            detached = true;
            for (const id of timers) clearTimeout(id);
            timers.clear();
            for (const id of frames) view?.cancelAnimationFrame(id);
            frames.clear();
            io?.disconnect();
            io = null;
            ioHeadline?.disconnect();
            ioHeadline = null;
            for (const cleanup of cleanups.splice(0)) cleanup();
            query?.removeEventListener('change', onPreference);
            // Every reveal that was still running ends at its rest state
            // [G7, 2026-09-08]. Without this a page that navigated away
            // mid-decipher left the headline as a row of glyphs — and
            // because `started` remembered it, re-attaching never fixed
            // it. A consumer's route change is not a reason to leave
            // somebody's words scrambled.
            for (const finish of finishers.splice(0)) finish();
            pending = 0;
            if (manageRoot) html.removeAttribute(ROOT_ATTRIBUTE);
        },
        observe(element) {
            if (detached) return;
            scan(element);
        },
    };
}
