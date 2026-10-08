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
import { asOf, presentUnder } from './as-of.js';

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
    /**
     * A number that counts up to what it already says [feat-count-1].
     *
     * The element's authored text is the truth and the module never
     * invents one: it reads the number out of that text, counts to it,
     * and puts the text back exactly as written. A page that never
     * attaches this module, or a reader who asked for less movement,
     * sees the final number and nothing else — which is the frozen bar.
     */
    count: 'data-kp-count',
    /** `armed` | `running` | `done`, readable at any moment [KT16]. */
    countState: 'data-kp-count-state',
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
    // than the shared `focus` word-stagger group the removed Shade (dark) theme owned.
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
    // The Lapis headline (theme removed 2026-10-06) [S48, LIFT_PLAN row 6]: a single wipe over the
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
    /**
     * Whether a click anywhere on the arrival overlay ends it [CP1].
     *
     * `anywhere` (the default since 6.0.0) or `skip-only` for what it did
     * before. The overlay is `position: fixed; inset: 0`, so until now it
     * ate every click for up to 1100ms and only the Skip button ended it —
     * a click elsewhere did nothing and gave no sign it had been lost.
     * JobTracker reported that as "the theme picker does not work on
     * phantom"; the picker was fine.
     */
    arrivalDismiss: '--kp-arrival-dismiss',
    /**
     * How fast the arrival plays, as a factor [scope-84]. Default 1.
     *
     * Every wait of the arrival — a boot line's step, a percentage's step,
     * the card's hold, the pause before it switches off — is divided by
     * it, and every CSS animation on the overlay (the CRT switching off,
     * the card's bar and its shove) plays at it as its playback rate. So
     * `0.5` takes twice as long and `2` half as long, and the sequence
     * stays the same sequence. A value that is not a number above zero
     * reads as 1. The catalogue's intro inspector (catalogue/intros.html)
     * sets it on the root of a frame; no register declares it, and a page
     * that never sets it plays exactly as before.
     */
    arrivalRate: '--kp-arrival-rate',
});
/**
 * How long a counting number takes, in milliseconds [feat-count-1].
 * A theme sets `--kp-count: 1200`; the default is 900. `0` — or the
 * reduced-motion setting, which always wins — puts the number there at
 * once without ever having counted.
 */
export const COUNT_KNOB = '--kp-count';
/** Where a counting number starts. Default 0; a theme or a page may set another. */
export const COUNT_FROM_KNOB = '--kp-count-from';

/** The custom property the arrival bar's fill reads, 0 to 1. */
export const BOOT_PROGRESS = '--kp-boot-progress';

/** How long one full pass of a marquee takes [M1, 2026-09-08]. */
export const MARQUEE_KNOB = '--kp-marquee';
/** Whether a marquee rests while it is off screen: `offscreen` (default) or `never` [M2]. */
export const MARQUEE_PAUSE_KNOB = '--kp-marquee-pause';

/** The knob blueprint sets to run its own live dimension lines [S48, LIFT_PLAN row 6]: `--kp-measure: live`. */
export const MEASURE_KNOB = '--kp-measure';

/**
 * The knob a theme sets to have the pointer's position written to the page
 * [scope-16]: `--kp-pointer: track`.
 *
 * The spectral instrument's approved demo paints its oxide film as a conic
 * gradient whose start angle follows the pointer — anodising does not add
 * pigment, it grows a film whose thickness decides which wavelength
 * survives, so the colour really does shift with the angle you look from.
 * A gradient cannot read a pointer; something has to write the number down.
 *
 * Off by default, and off under reduced motion: someone asking for less
 * movement is not asking for a colour that follows their hand. The two
 * properties keep whatever the stylesheet declared, so the gradient is
 * valid before the pointer has ever moved and stays valid afterwards.
 */
export const POINTER_KNOB = '--kp-pointer';

/** The properties `POINTER_KNOB` drives, each 0 to 1 across the viewport. */
export const POINTER = Object.freeze({ x: '--kp-px', y: '--kp-py' });

/**
 * The knob a theme sets on the surfaces the pointer LIGHTS [scope-101,
 * from scope-25]: `--kp-light: pointer`.
 *
 * Kenny's sentence for the shade pair, verbatim: "the pointer is the
 * light, and the light half throws its shade away from it while the dark
 * half is lifted out of shade by it". A shadow's direction depends on
 * where its element is, which the two root numbers `POINTER_KNOB` writes
 * cannot say — so this is written per element instead of per page. It
 * rides on that same bus: the same `--kp-pointer: track` arms it, the
 * same `pointermove` listener feeds it, the same animation frame writes
 * both. Off wherever the bus is off, which includes reduced motion.
 */
export const LIGHT_KNOB = '--kp-light';

/**
 * The six properties `LIGHT_KNOB` drives on each lit element: the
 * direction away from the pointer (`x`, `y`), how near it is (`near`,
 * `lift`) and where the pointer sits inside the element's own box
 * (`atX`, `atY`). A register declares its fallback for every one of them,
 * so a page with no pointer paints the fixed light it painted before.
 */
export const LIGHT = Object.freeze({
    x: '--kp-light-x',
    y: '--kp-light-y',
    near: '--kp-light-near',
    lift: '--kp-light-lift',
    atX: '--kp-light-at-x',
    atY: '--kp-light-at-y',
});

/** What the light can fall on, the approved demo's own list. */
export const LIGHT_SELECTOR = ".kp-card, .kp-button:not([class*='kp-button--']), [data-kp-surface='hero']";

/** Past this many pixels the shade is at full length; under it, shorter. */
export const LIGHT_REACH = 240;

/** Past this many pixels the light no longer reaches the surface at all. */
export const LIGHT_FAR = 560;

/**
 * The knob a theme sets to have the point a press started at written to the
 * button it started on [scope-25, built at scope-101]: `--kp-press: point`.
 *
 * Sepia's approved gesture is the ink spreading into the paper on a press,
 * and ink spreads from where the nib touched down, not from the middle of
 * the plate. CSS knows a button is being pressed; it cannot know WHERE, so
 * something has to write the two numbers down. That is all this does — the
 * whole gesture is the register's, and this is the coordinate it reads.
 *
 * Unlike `POINTER_KNOB` it stays armed under reduced motion: someone asking
 * for less movement is not asking for the stain to appear in the wrong
 * place, and the register gives them the same stain with no transition.
 *
 * Without the module, on a key press, or after `detach()`, the two
 * properties are whatever the stylesheet declared — sepia's own default is
 * the middle of the button, so the gesture is whole before a pointer has
 * ever touched it [KT6].
 */
export const PRESS_KNOB = '--kp-press';

/** The properties `PRESS_KNOB` drives: the press point inside the button's box. */
export const PRESS = Object.freeze({ x: '--kp-press-x', y: '--kp-press-y' });

/**
 * The second thing a theme can ask a press for: `--kp-press: size`. The
 * button's measured width, in whole pixels, is written to the element a press
 * started on as this attribute, for a theme that letters the size of what is
 * held (blueprint's dimension below the part prints it with
 * `content: attr(data-kp-press-size)`). CSS cannot print a measured length.
 * Written on a pointer press and on Space or Enter; left on the element after
 * the press so a dimension that fades out keeps its numerals.
 */
export const PRESS_SIZE = 'data-kp-press-size';
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
    // The side navigation's backdrop [feat-nav-3]: one fade in, at the
    // theme's own duration, on a layer that is already a dimming. It runs
    // once because the element is created when the panel opens and removed
    // when it closes.
    'kp-sidenav-backdrop': { durationMs: 220, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    // Solstice's raking light [scope-12]: one pass of a warm band across a
    // control, on hover. The band is a gradient that fades to transparent at
    // both ends, so no edge of it is an opposing luminance change.
    'kp-rake': { durationMs: 620, cycles: 1, property: 'translate', luminanceSteps: [] },
    // Titanium's headline [scope-17]: one short linear pass as the word
    // slides square. No blur and no chromatic split — those belong to the
    // spectral instrument. Opacity 0 to 1 once, so no opposing change.
    'kp-mill': { durationMs: 340, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-tracking': { durationMs: 700, cycles: 1, property: 'opacity', luminanceSteps: [0, 1, 0.35, 1, 1, 0] },
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
    // The character the cursor stands on (the ghost button's `]`), reversed in step with kp-caret.
    'kp-caret-reverse': { durationMs: 1000, cycles: Infinity, property: 'color', luminanceSteps: [1, 1, 0, 0] },
    // The alarm [scope-94]: the plate fading in, the frame's glow breathing
    // (one half-cycle per 1.4 s), the panel flickering in once (cyberpunk's
    // own keyframe since scope-100, below), each letter cell's two noise glyphs and its letter (once per
    // cell), the split copies slicing through once and then every 5 s, the
    // headline's short dip every 5 s, the detail line fading in, the caret,
    // the hazard stripes marching and the faint band sweeping down. Measured
    // from rendered frames in tests/alarm.spec.mjs as well.
    // Since scope-98 the flicker, the decode, the split, the dip, the caret,
    // the march and the sweep are cyberpunk's alone; the package's default
    // arrives whole: the panel settling and the headline arriving, once each.
    // The plate's row keeps cyberpunk's 180 ms, the shorter of the two.
    'kp-alarm-ground-in': { durationMs: 180, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-alarm-settle': { durationMs: 520, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-alarm-arrive': { durationMs: 480, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-alarm-pulse': { durationMs: 1400, cycles: Infinity, property: 'opacity', luminanceSteps: [0.4, 1] },
    // Cyberpunk's panel striking like a failing tube [scope-100], in its
    // register: 0, 0.6, a sag to 0.52 under the 10% step, 1 — one direction,
    // where the package's kp-alarm-flicker-in (0, 1, 0.3, 1) read 3.00/s.
    'kp-alarm-cyberpunk-flicker': { durationMs: 600, cycles: 1, property: 'opacity', luminanceSteps: [0, 0.6, 0.52, 1, 1] },
    'kp-alarm-jitter': { durationMs: 5000, cycles: Infinity, property: 'opacity', luminanceSteps: [1, 1, 0.6, 1] },
    'kp-alarm-slice-in': { durationMs: 600, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-alarm-slice': { durationMs: 5000, cycles: Infinity, property: 'clip-path', luminanceSteps: [] },
    'kp-alarm-decode-letter': { durationMs: 180, cycles: 1, property: 'color', luminanceSteps: [] },
    'kp-alarm-decode-noise': { durationMs: 90, cycles: 1, property: 'opacity', luminanceSteps: [1, 0] },
    'kp-alarm-detail-in': { durationMs: 300, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-alarm-caret': { durationMs: 1000, cycles: Infinity, property: 'opacity', luminanceSteps: [1, 1, 0, 0] },
    'kp-alarm-march': { durationMs: 1600, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-alarm-sweep': { durationMs: 6000, cycles: Infinity, property: 'translate', luminanceSteps: [] },
    // The Shade (dark) register (theme removed 2026-10-06) [S48, LIFT_PLAN row 24]: the headline's words
    // arriving out of a blur, the hero button and the dossier card settling
    // out of the same blur once on load, and the confirmation dialog's
    // native open/close — the last two shared with academia's, which mounts
    // its dialog the same way.
    // One keyframe for both grains since scope-100 (the two were identical):
    // the words at 600ms, the hero button and dossier card at 500ms.
    'kp-focus': { durationMs: 600, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
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
    'kp-resolve': { durationMs: 640, cycles: 1, property: 'opacity', luminanceSteps: [0, 1, 1] },
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
    'kp-cal-redact': { durationMs: 320, cycles: 1, property: 'background-size', luminanceSteps: [] },
    // The mono register [S48, LIFT_PLAN row 11]: a hard-edge mask sweeping
    // once across a headline (the whole line, unsplit) or a redaction bar.
    // No luminance step: the mask moves, the content under it does not
    // change colour.
    'kp-wipe': { durationMs: 600, cycles: 1, property: 'mask-position', luminanceSteps: [] },
    // The Lapis register (theme removed 2026-10-06) [S48, LIFT_PLAN row 6]: the burnish, a single
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
    // The base layer's shared rule draw. One keyframe, seven registers, each
    // with its own duration: nostromo 280ms, blueprint 420ms, light and retro
    // 480ms, deco 600ms, brutalism 620ms, terminal 900ms.
    // The row carries the shortest, the worst case a rate is read at; it
    // used to say 420ms, blueprint's alone [scope-100].
    'kp-rule-in': { durationMs: 280, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-settle': { durationMs: 140, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-blink': { durationMs: 1000, cycles: Infinity, property: 'opacity', luminanceSteps: [1, 1, 0, 0] },
    'kp-drift': { durationMs: 40000, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-ember': { durationMs: 840, cycles: 1, property: 'box-shadow', luminanceSteps: [] },
    'kp-spin': { durationMs: 900, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-pulse': { durationMs: 1600, cycles: Infinity, property: 'opacity', luminanceSteps: [1, 0.6, 1] },
    // The drawer and the tour card [scope-143]: each arrives once, a fade
    // (the drawer also slides 2rem); opacity 0 to 1, no opposing change.
    'kp-drawer-in': { durationMs: 200, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-tour-in': { durationMs: 160, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    // The busy progress bar's sweep [scope-140]: a band a third of the
    // track wide translating across it, no luminance change of its own.
    'kp-progressbar-sweep': { durationMs: 1400, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    // Cyberpunk's data stream [scope-96]: two dash tiles drifting by one
    // tile width per loop (144px and 216px in 8000ms), no luminance change.
    'kp-stream-144': { durationMs: 8000, cycles: Infinity, property: 'mask-position', luminanceSteps: [] },
    'kp-stream-216': { durationMs: 8000, cycles: Infinity, property: 'mask-position', luminanceSteps: [] },
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
    // The Shade (light) register (theme removed 2026-10-06) [SL2]: the headline's words resolving out
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
    // unsplit line (`kp-sharpen-in` — not `kp-focus`/`focus`, which the
    // dark and the removed Shade (dark) registers owned for their own, different
    // mechanics). The confirmation dialog's one-shot open reuses the
    // `kp-dialog-in` row above, which nostromo (and the removed academia and Shade (dark))
    // already share.
    'kp-sharpen-in': { durationMs: 640, cycles: 1, property: 'filter', luminanceSteps: [] },
    // The blueprint register [S48, LIFT_PLAN row 6]: the headline settling
    // in, and the two dimension lines extending like a tape measure (a
    // transform each, no luminance change) with their labels fading in.
    // The lede's marks and the dossier's redactions are plain transitions
    // on a later class toggle, not keyframes, so they carry no row here —
    // the same choice terminal's own redaction made [TM1].
    'kp-headline-fade': { durationMs: 300, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    // One fade, used twice: the brackets, then the readout behind them.
    // The two dimension lines this replaced needed four rows [scope-18].
    'kp-dim-label': { durationMs: 300, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    // Information that updates in place [Kenny's picks on research/update-motion,
    // 2026-10-05; js/update.js]: once per update, at the theme's
    // max(size, close) × 1.25 from themeMotion() (formal 300 ms, cyberpunk
    // 750 ms, titanium 240 ms; the CSS reads it from --kp-update-duration).
    // The steps are the opacity stops this gate parses (from/to included since
    // 2026-10-08).
    // formal's stamp: a frame that lands round the value and soaks in.
    'kp-sig-formal-update-stamp': { durationMs: 300, cycles: 1, property: 'opacity', luminanceSteps: [0, 0.9, 0.6, 0] },
    // cyberpunk's count-down stutter [Kenny, research/cyberpunk-live,
    // 2026-10-07 02:49]: two unblurred text-shadow copies (yellow up, cyan
    // down) ticking home 6, 4, 2, 1 px in four hard steps, 0.64 of the
    // update time (480 ms); under reduced motion the copies stand still 2 px
    // out for 1.2 s and go.
    'kp-sig-cyberpunk-update-stutter': { durationMs: 480, cycles: 1, property: 'text-shadow', luminanceSteps: [] },
    'kp-sig-cyberpunk-update-still': { durationMs: 1200, cycles: 1, property: 'text-shadow', luminanceSteps: [] },
    // titanium's heat tint: a colour-blended band in, across and out.
    'kp-sig-titanium-update-anodise': { durationMs: 240, cycles: 1, property: 'opacity', luminanceSteps: [0, 1, 1, 0] },
    // The meter with a mark, each theme's way [Kenny's round-3 picks on
    // research/character-meter, 2026-10-05]: the loading picture (loops while
    // loading), the share arriving, its re-ink or a single move when the tone
    // changes. Only terminal's caret blinks in opacity, once a second.
    'kp-sig-formal-meter-pos': { durationMs: 2600, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sig-formal-meter-wipe-d': { durationMs: 900, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-formal-meter-wipe-o': { durationMs: 900, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-formal-meter-wipe-w': { durationMs: 900, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-light-meter-day': { durationMs: 3000, cycles: Infinity, property: 'translate', luminanceSteps: [] },
    'kp-sig-light-meter-bump-d': { durationMs: 260, cycles: 1, property: 'scale', luminanceSteps: [] },
    'kp-sig-light-meter-bump-o': { durationMs: 260, cycles: 1, property: 'scale', luminanceSteps: [] },
    'kp-sig-light-meter-bump-w': { durationMs: 260, cycles: 1, property: 'scale', luminanceSteps: [] },
    'kp-sig-light-meter-grow-o': { durationMs: 700, cycles: 1, property: 'scale', luminanceSteps: [] },
    'kp-sig-synthwave-meter-grow-o': { durationMs: 600, cycles: 1, property: 'scale', luminanceSteps: [] },
    'kp-sig-synthwave-meter-pos': { durationMs: 1800, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sig-pastel-meter-drift': { durationMs: 1600, cycles: Infinity, property: 'translate', luminanceSteps: [] },
    'kp-sig-pastel-meter-drop-d': { durationMs: 600, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-pastel-meter-drop-o': { durationMs: 600, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-pastel-meter-drop-w': { durationMs: 600, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-terminal-meter-tone-w': { durationMs: 900, cycles: 1, property: 'filter', luminanceSteps: [] },
    'kp-sig-terminal-meter-tone-d': { durationMs: 900, cycles: 1, property: 'filter', luminanceSteps: [] },
    'kp-sig-terminal-tm-fill': { durationMs: 1000, cycles: Infinity, property: '--kp-sig-tm-k', luminanceSteps: [] },
    'kp-sig-terminal-tm-head': { durationMs: 1000, cycles: Infinity, property: '--kp-sig-tm-head', luminanceSteps: [] },
    'kp-sig-terminal-tm-k': { durationMs: 1088, cycles: 1, property: '--kp-sig-tm-k', luminanceSteps: [] },
    'kp-sig-terminal-tm-feed': { durationMs: 816, cycles: 1, property: 'inset-block-start', luminanceSteps: [] },
    'kp-sig-terminal-update-blink': { durationMs: 900, cycles: 1, property: 'color', luminanceSteps: [] },
    'kp-sig-terminal-update-blink-line': { durationMs: 900, cycles: 1, property: 'color', luminanceSteps: [] },
    'kp-sig-forest-meter-wipe-o': { durationMs: 1200, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-sepia-meter-knock-d': { durationMs: 280, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-sepia-meter-knock-o': { durationMs: 280, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-sepia-meter-knock-w': { durationMs: 280, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-sepia-meter-slant-o': { durationMs: 1100, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-sepia-meter-width': { durationMs: 2200, cycles: Infinity, property: 'inline-size', luminanceSteps: [] },
    'kp-sig-solstice-meter-bump-d': { durationMs: 500, cycles: 1, property: 'scale', luminanceSteps: [] },
    'kp-sig-solstice-meter-bump-o': { durationMs: 500, cycles: 1, property: 'scale', luminanceSteps: [] },
    'kp-sig-solstice-meter-bump-w': { durationMs: 500, cycles: 1, property: 'scale', luminanceSteps: [] },
    'kp-sig-solstice-meter-grow-o': { durationMs: 1400, cycles: 1, property: 'scale', luminanceSteps: [] },
    'kp-sig-solstice-meter-pos': { durationMs: 4000, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sig-deco-meter-knock-d': { durationMs: 300, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-deco-meter-knock-o': { durationMs: 300, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-deco-meter-knock-w': { durationMs: 300, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-deco-meter-pos': { durationMs: 2400, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sig-deco-meter-wipe-o': { durationMs: 900, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-phantom-meter-screen1': { durationMs: 700, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sig-phantom-meter-jolt-d': { durationMs: 200, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-phantom-meter-jolt-o': { durationMs: 200, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-phantom-meter-jolt-w': { durationMs: 200, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-phantom-meter-slant-o': { durationMs: 220, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-nostromo-meter-scan': { durationMs: 2000, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sig-nostromo-meter-wipe-o': { durationMs: 1600, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    // titanium's loading is the anodising bath on every carrier (themes/titanium/CHARACTER.md G10).
    'kp-sig-titanium-bath': { durationMs: 2200, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sig-titanium-meter-grow-o': { durationMs: 300, cycles: 1, property: 'scale', luminanceSteps: [] },
    'kp-sig-titanium-meter-jolt-d': { durationMs: 160, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-titanium-meter-jolt-o': { durationMs: 160, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-titanium-meter-jolt-w': { durationMs: 160, cycles: 1, property: 'translate', luminanceSteps: [] },
    // The meter, round 4 [Kenny's picks on research/character-meter, 2026-10-05]:
    // dark (loading and arrival redrawn), cyberpunk, high-contrast, retro and
    // grotesk. Every loading picture loops while loading.
    'kp-sig-dark-meter-bump-d': { durationMs: 200, cycles: 1, property: 'scale', luminanceSteps: [] },
    'kp-sig-dark-meter-bump-o': { durationMs: 200, cycles: 1, property: 'scale', luminanceSteps: [] },
    'kp-sig-dark-meter-bump-w': { durationMs: 200, cycles: 1, property: 'scale', luminanceSteps: [] },
    'kp-sig-dark-meter-pos': { durationMs: 900, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sig-dark-meter-press-o': { durationMs: 220, cycles: 1, property: 'scale', luminanceSteps: [] },
    'kp-sig-cyberpunk-meter-slip-o': { durationMs: 320, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-high-contrast-meter-march': { durationMs: 800, cycles: Infinity, property: 'translate', luminanceSteps: [] },
    'kp-sig-high-contrast-meter-wipe-d': { durationMs: 120, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-high-contrast-meter-wipe-o': { durationMs: 120, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-high-contrast-meter-wipe-w': { durationMs: 120, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-retro-meter-knock-d': { durationMs: 160, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-retro-meter-knock-o': { durationMs: 160, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-retro-meter-knock-w': { durationMs: 160, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-retro-meter-shake': { durationMs: 1400, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sig-retro-meter-wipe-o': { durationMs: 600, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-grotesk-meter-grow-o': { durationMs: 400, cycles: 1, property: 'scale', luminanceSteps: [] },
    // ── Rows added by the port session [scope-143, 2026-10-08]: every keyframe the
    // character rounds declared without a row. Generated from the stylesheets,
    // not measured in a browser: the duration is the literal, else the shortest
    // value the stylesheet gives the custom property it names (durationBound in
    // gates/check-motion.mjs, the bound the gate rates with); the cycles come
    // from the shorthand; the property is what the keyframe animates.
    // cyberpunk-register
    'kp-sig-cyberpunk-bars-1': { durationMs: 3000, cycles: Infinity, property: '--kp-cp-h1', luminanceSteps: [] },
    'kp-sig-cyberpunk-bars-2': { durationMs: 3000, cycles: 1, property: '--kp-cp-h2', luminanceSteps: [] },
    'kp-sig-cyberpunk-bars-3': { durationMs: 3000, cycles: 1, property: '--kp-cp-h3', luminanceSteps: [] },
    'kp-sig-cyberpunk-bars-4': { durationMs: 3000, cycles: 1, property: '--kp-cp-h4', luminanceSteps: [] },
    'kp-sig-cyberpunk-tear': { durationMs: 3000, cycles: 1, property: 'filter', luminanceSteps: [] },
    'kp-sig-cyberpunk-word': { durationMs: 1800, cycles: Infinity, property: 'content', luminanceSteps: [] },
    'kp-sig-cyberpunk-word-tear': { durationMs: 1800, cycles: 1, property: 'translate, clip-path, text-shadow', luminanceSteps: [] },
    'kp-sig-cyberpunk-lock': { durationMs: 360, cycles: 1, property: '--kp-cp-lk', luminanceSteps: [] },
    'kp-sig-cyberpunk-pen': { durationMs: 180, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-cyberpunk-dot': { durationMs: 180, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-sig-cyberpunk-split': { durationMs: 480, cycles: 1, property: 'clip-path, box-shadow, text-shadow', luminanceSteps: [] },
    'kp-sig-cyberpunk-split-out': { durationMs: 480, cycles: 1, property: 'clip-path, box-shadow, text-shadow', luminanceSteps: [] },
    'kp-cp-charge': { durationMs: 520, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-cp-stream-144': { durationMs: 1800, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-cp-stream-216': { durationMs: 1200, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    // retro-register
    'kp-sig-retro-turn': { durationMs: 2600, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-retro-sand': { durationMs: 2600, cycles: Infinity, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-retro-dither': { durationMs: 1600, cycles: Infinity, property: 'opacity', luminanceSteps: [0.15, 0.6] },
    'kp-sig-retro-drop': { durationMs: 240, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-sig-retro-zoom': { durationMs: 280, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-sig-retro-hold': { durationMs: 500, cycles: 1, property: 'opacity', luminanceSteps: [0, 0] },
    'kp-sig-retro-leave': { durationMs: 280, cycles: 1, property: 'opacity', luminanceSteps: [0] },
    // synthwave-register
    'kp-sw-flow': { durationMs: 225, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sw-floor-drive': { durationMs: 225, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sw-tile-flow': { durationMs: 225, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sw-tile-floor-drive': { durationMs: 225, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sw-bar-fill': { durationMs: 225, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sw-bar-head': { durationMs: 225, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-sig-synthwave-sw-set': { durationMs: 2600, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-synthwave-sw-sheen': { durationMs: 2600, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-synthwave-sw-tube': { durationMs: 2600, cycles: 1, property: 'opacity', luminanceSteps: [0.3, 1, 0.55, 1, 1] },
    'kp-sig-synthwave-climb': { durationMs: 2600, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-synthwave-beam': { durationMs: 2600, cycles: 1, property: 'inset-block-start', luminanceSteps: [] },
    'kp-sig-synthwave-glow': { durationMs: 2600, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 1, 0] },
    'kp-sig-synthwave-sw-horizon': { durationMs: 225, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-sw-road': { durationMs: 600, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-synthwave-size-rise': { durationMs: 225, cycles: 1, property: 'translate, clip-path', luminanceSteps: [] },
    'kp-sig-synthwave-sink': { durationMs: 225, cycles: 1, property: 'translate, clip-path', luminanceSteps: [] },
    'kp-sig-synthwave-sun': { durationMs: 225, cycles: 1, property: 'translate, visibility', luminanceSteps: [] },
    'kp-sig-synthwave-update-laser': { durationMs: 225, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 0] },
    // phantom-register
    'kp-sig-phantom-phantom-snap': { durationMs: 260, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-phantom-phantom-slash': { durationMs: 1400, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-phantom-phantom-slam': { durationMs: 260, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-phantom-phantom-stick': { durationMs: 260, cycles: 1, property: 'opacity', luminanceSteps: [0, 1, 1] },
    'kp-sig-phantom-phantom-card': { durationMs: 380, cycles: 1, property: 'opacity', luminanceSteps: [0, 1, 1] },
    'kp-sig-phantom-phantom-card-big': { durationMs: 420, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-phantom-phantom-pop': { durationMs: 260, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-progressbar-phantom-shove': { durationMs: 1500, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-phantom-leave': { durationMs: 650, cycles: 1, property: 'opacity', luminanceSteps: [1, 0.55, 0.3, 0] },
    // terminal-register
    'kp-sig-terminal-tm-dot': { durationMs: 800, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-terminal-tm-trail': { durationMs: 800, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-terminal-tm-decay': { durationMs: 800, cycles: Infinity, property: 'opacity', luminanceSteps: [0.6, 0.15] },
    'kp-sig-terminal-tm-type': { durationMs: 800, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-terminal-tm-rows': { durationMs: 800, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-terminal-tm-menu': { durationMs: 136, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-terminal-tm-menu-feed': { durationMs: 136, cycles: 1, property: 'inset-block-start, visibility', luminanceSteps: [] },
    'kp-sig-terminal-tm-wash': { durationMs: 800, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-terminal-tm-blink': { durationMs: 1000, cycles: 5, property: 'opacity', luminanceSteps: [0] },
    'kp-tp-caret': { durationMs: 1000, cycles: Infinity, property: 'opacity', luminanceSteps: [0] },
    'kp-tp-walk': { durationMs: 2400, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-terminal-leave': { durationMs: 480, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-terminal-leave-rtl': { durationMs: 480, cycles: 1, property: 'clip-path', luminanceSteps: [] }, // swapped in by animation-name on the rule that runs its sibling
    'kp-sig-terminal-leave-2': { durationMs: 480, cycles: 1, property: 'inset-inline-end', luminanceSteps: [] },
    // brutalism-register
    'kp-progressbar-brutalism-hop': { durationMs: 2400, cycles: Infinity, property: 'translate', luminanceSteps: [] },
    'kp-sig-brutalism-hoist': { durationMs: 1200, cycles: Infinity, property: 'background-position-y', luminanceSteps: [] },
    'kp-sig-brutalism-tip': { durationMs: 34, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-brutalism-set': { durationMs: 34, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-brutalism-drop': { durationMs: 34, cycles: 1, property: 'translate, box-shadow', luminanceSteps: [] },
    'kp-sig-brutalism-hold': { durationMs: 1500, cycles: 1, property: 'visibility', luminanceSteps: [] },
    'kp-sig-brutalism-leave': { durationMs: 300, cycles: 1, property: 'translate, visibility', luminanceSteps: [] },
    'kp-sig-brutalism-leave-slab': { durationMs: 300, cycles: 1, property: 'translate, box-shadow, visibility', luminanceSteps: [] }, // swapped in by animation-name on the rule that runs its sibling
    'kp-sig-brutalism-update-slam': { durationMs: 300, cycles: 12, property: 'translate, filter', luminanceSteps: [] },
    'kp-sig-brutalism-meter-throw': { durationMs: 300, cycles: 1, property: 'translate', luminanceSteps: [] },
    // titanium-register
    'kp-sig-titanium-ti-facing': { durationMs: 120, cycles: Infinity, property: 'rotate', luminanceSteps: [] },
    'kp-sig-titanium-ti-stamp': { durationMs: 120, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-titanium-ti-rail': { durationMs: 120, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-titanium-ti-scribe': { durationMs: 160, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-sig-titanium-ti-cut': { durationMs: 120, cycles: 1, property: '--kp-sig-ti-cut', luminanceSteps: [] },
    'kp-sig-titanium-ti-cutter': { durationMs: 240, cycles: 1, property: 'opacity', luminanceSteps: [1, 1] },
    'kp-sig-titanium-ti-appear': { durationMs: 120, cycles: 1, property: 'opacity', luminanceSteps: [0] },
    'kp-sig-titanium-size-drawer': { durationMs: 260, cycles: 1, property: 'opacity', luminanceSteps: [0] },
    'kp-sig-titanium-leave': { durationMs: 400, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 0] },
    'kp-sig-titanium-leave-2': { durationMs: 400, cycles: 1, property: 'opacity', luminanceSteps: [0, 1, 1] },
    // pastel-register
    'kp-sig-pastel-pastel-hop': { durationMs: 420, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-pastel-pastel-flow': { durationMs: 4000, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-pastel-pastel-register-sm': { durationMs: 420, cycles: 1, property: 'opacity', luminanceSteps: [0, 0, 1] },
    'kp-sig-pastel-pastel-pop': { durationMs: 420, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-pastel-pastel-slap': { durationMs: 560, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-pastel-pastel-sheet': { durationMs: 640, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-pastel-pastel-bubble': { durationMs: 420, cycles: 1, property: 'opacity', luminanceSteps: [0, 1, 1] },
    'kp-progressbar-pastel-busy': { durationMs: 1600, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-pastel-leave': { durationMs: 520, cycles: 1, property: 'opacity', luminanceSteps: [0] },
    // forest-register
    'kp-sig-forest-sprout': { durationMs: 1000, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-forest-plant': { durationMs: 3200, cycles: Infinity, property: 'opacity', luminanceSteps: [0.7, 0.85, 1, 1] },
    'kp-sig-forest-draw': { durationMs: 34, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-forest-radio': { durationMs: 34, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-forest-grow': { durationMs: 34, cycles: 7, property: 'translate, clip-path', luminanceSteps: [] },
    'kp-sig-forest-root': { durationMs: 34, cycles: 1, property: 'translate, clip-path', luminanceSteps: [] },
    'kp-progressbar-forest-breath': { durationMs: 6600, cycles: Infinity, property: '--kp-fo-breath', luminanceSteps: [] },
    'kp-sig-forest-leave': { durationMs: 34, cycles: 1, property: 'translate, clip-path, filter', luminanceSteps: [] },
    'kp-sig-forest-meter-ring-d': { durationMs: 1000, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 0] },
    'kp-sig-forest-meter-ring-w': { durationMs: 1000, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 0] },
    'kp-skeleton-forest-treeline': { durationMs: 3200, cycles: Infinity, property: '--kp-fo-grow', luminanceSteps: [] },
    'kp-sig-forest-update-ring': { durationMs: 34, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 0] },
    'kp-sig-forest-edge': { durationMs: 1000, cycles: 1, property: 'translate, clip-path', luminanceSteps: [] }, // the drawer's --kp-sig-dur, the theme's growth time
    'kp-sig-forest-edge-rtl': { durationMs: 1000, cycles: 1, property: 'translate, clip-path', luminanceSteps: [] }, // swapped in by animation-name on the rule that runs its sibling
    // deco-register
    'kp-sig-deco-deco-turn': { durationMs: 3600, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-deco-deco-open': { durationMs: 2800, cycles: Infinity, property: 'opacity', luminanceSteps: [1, 1, 1, 0] },
    'kp-sig-deco-deco-unfold': { durationMs: 340, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-deco-deco-grow': { durationMs: 340, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-sig-deco-deco-centre': { durationMs: 340, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-deco-deco-sunrise': { durationMs: 340, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-deco-deco-fan': { durationMs: 1120, cycles: 1, property: 'opacity', luminanceSteps: [0, 0] },
    'kp-progressbar-deco-ascent': { durationMs: 900, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-deco-leave': { durationMs: 480, cycles: 1, property: 'opacity', luminanceSteps: [0] },
    // light-register
    'kp-sig-light-light-orbit': { durationMs: 1200, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-light-light-open-x': { durationMs: 900, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-light-light-tick': { durationMs: 280, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-light-light-bead': { durationMs: 280, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-sig-light-light-window': { durationMs: 520, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-light-light-float': { durationMs: 280, cycles: 1, property: 'opacity', luminanceSteps: [0] },
    'kp-sig-light-size-bloom': { durationMs: 420, cycles: 1, property: 'opacity', luminanceSteps: [0] },
    'kp-sig-light-leave': { durationMs: 420, cycles: 1, property: 'opacity', luminanceSteps: [0] },
    // grotesk-register
    'kp-sig-grotesk-fall': { durationMs: 34, cycles: 1, property: 'filter', luminanceSteps: [] },
    'kp-sig-grotesk-fall-again': { durationMs: 960, cycles: 1, property: 'filter', luminanceSteps: [] },
    'kp-sig-grotesk-update-plate': { durationMs: 34, cycles: 1, property: 'filter', luminanceSteps: [] },
    'kp-sig-grotesk-loop': { durationMs: 2640, cycles: Infinity, property: '--kp-sig-gr-a, --kp-sig-gr-q', luminanceSteps: [] },
    'kp-sig-grotesk-turn': { durationMs: 2640, cycles: Infinity, property: 'rotate', luminanceSteps: [] },
    'kp-sig-grotesk-gr-cut': { durationMs: 34, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-grotesk-gr-disc': { durationMs: 34, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-sig-grotesk-gr-rule': { durationMs: 34, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-sig-grotesk-leave': { durationMs: 960, cycles: 1, property: '--kp-sig-gr-a, --kp-sig-gr-q, visibility', luminanceSteps: [] },
    // blueprint-register
    'kp-sig-blueprint-callout': { durationMs: 300, cycles: 1, property: 'color, border-color, background-color, --kp-bp-r', luminanceSteps: [] },
    'kp-sig-blueprint-leader': { durationMs: 360, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-sig-blueprint-node': { durationMs: 360, cycles: 1, property: 'opacity', luminanceSteps: [0, 0, 1, 1] },
    'kp-sig-blueprint-blueprint-compass': { durationMs: 1600, cycles: Infinity, property: 'opacity', luminanceSteps: [1, 1, 1, 0] },
    'kp-sig-blueprint-blueprint-draw': { durationMs: 300, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-blueprint-blueprint-mark': { durationMs: 300, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-blueprint-read': {
        durationMs: 34,
        cycles: 1,
        property: 'visibility, --kp-bp-rp, --kp-bp-nib, --kp-bp-pv, --kp-bp-rv',
        luminanceSteps: [],
    },
    'kp-sig-blueprint-trace': {
        durationMs: 300,
        cycles: 1,
        property: 'visibility, overflow, --kp-bp-r, --kp-bp-nib, --kp-bp-pv, --kp-bp-tv',
        luminanceSteps: [],
    },
    'kp-sig-blueprint-trace-out': {
        durationMs: 300,
        cycles: 1,
        property: 'visibility, overflow, --kp-bp-r, --kp-bp-nib, --kp-bp-pv, --kp-bp-tv',
        luminanceSteps: [],
    },
    'kp-sig-blueprint-update-read': { durationMs: 34, cycles: 1, property: '--kp-bp-p, --kp-bp-rv', luminanceSteps: [] },
    'kp-sig-blueprint-stroke': { durationMs: 34, cycles: Infinity, property: '--kp-bp-p, --kp-bp-nib, --kp-bp-pv, --kp-bp-tv', luminanceSteps: [] },
    'kp-sig-blueprint-place': { durationMs: 34, cycles: Infinity, property: '--kp-bp-p, --kp-bp-nib, --kp-bp-pv, --kp-bp-tv', luminanceSteps: [] },
    'kp-sig-blueprint-frame': { durationMs: 34, cycles: Infinity, property: '--kp-bp-r, --kp-bp-nib, --kp-bp-pv, --kp-bp-tv', luminanceSteps: [] },
    'kp-sig-blueprint-ring': { durationMs: 34, cycles: Infinity, property: '--kp-bp-p, --kp-bp-nib, --kp-bp-pv, --kp-bp-tv', luminanceSteps: [] },
    // nostromo-register
    'kp-sig-nostromo-compute': { durationMs: 1600, cycles: Infinity, property: 'background-position-x', luminanceSteps: [] },
    'kp-sig-nostromo-raster': { durationMs: 160, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-nostromo-beam': { durationMs: 160, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 0] },
    'kp-sig-nostromo-beam-layer': {
        durationMs: 160,
        cycles: 1,
        property: 'background-image, background-repeat, background-origin, background-size, background-position',
        luminanceSteps: [],
    },
    'kp-sig-nostromo-beam-layer-erase': {
        durationMs: 320,
        cycles: 1,
        property: 'background-image, background-repeat, background-origin, background-size, background-position',
        luminanceSteps: [],
    },
    'kp-sig-nostromo-lamp-on': { durationMs: 80, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-nostromo-no-reel': { durationMs: 260, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-nostromo-no-punch': { durationMs: 160, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-nostromo-hum': { durationMs: 160, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sig-nostromo-redraw': { durationMs: 160, cycles: Infinity, property: 'clip-path, background-position', luminanceSteps: [] },
    'kp-sig-nostromo-redraw-row-1': { durationMs: 160, cycles: Infinity, property: 'clip-path, background-position', luminanceSteps: [] },
    'kp-sig-nostromo-redraw-row-2': { durationMs: 160, cycles: Infinity, property: 'clip-path, background-position', luminanceSteps: [] }, // swapped in by animation-name on the rule that runs its sibling
    'kp-sig-nostromo-redraw-row-3': { durationMs: 160, cycles: Infinity, property: 'clip-path, background-position', luminanceSteps: [] }, // swapped in by animation-name on the rule that runs its sibling
    'kp-sig-nostromo-update-redraw': { durationMs: 640, cycles: 1, property: '-webkit-mask-position, mask-position', luminanceSteps: [] },
    'kp-sig-nostromo-update-beam': { durationMs: 320, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 0] },
    'kp-sig-nostromo-update-lamp': { durationMs: 640, cycles: 1, property: 'opacity', luminanceSteps: [1, 1] },
    'kp-sig-nostromo-size-scan': { durationMs: 320, cycles: 1, property: 'clip-path, filter', luminanceSteps: [] },
    'kp-sig-nostromo-erase': { durationMs: 320, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    // dark-register
    'kp-sig-dark-dark-turn': { durationMs: 1400, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-dark-dark-ghost-l': { durationMs: 1800, cycles: Infinity, property: 'opacity', luminanceSteps: [0, 0.5, 0] },
    'kp-sig-dark-dark-ghost-r': { durationMs: 1800, cycles: Infinity, property: 'opacity', luminanceSteps: [0, 0.5, 0] },
    'kp-sig-dark-dark-resolve': { durationMs: 260, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-dark-dark-resolve-ghost': { durationMs: 260, cycles: 1, property: 'opacity', luminanceSteps: [0.9, 0] },
    'kp-sig-dark-dark-dot': { durationMs: 260, cycles: 1, property: 'opacity', luminanceSteps: [0] }, // swapped in by animation-name on the rule that runs its sibling
    'kp-sig-dark-dark-dot-ghost': { durationMs: 260, cycles: 1, property: 'opacity', luminanceSteps: [0.9, 0] }, // swapped in by animation-name on the rule that runs its sibling
    'kp-sig-dark-dark-settle': { durationMs: 520, cycles: 1, property: 'opacity', luminanceSteps: [0] },
    'kp-sig-dark-dark-settle-in': { durationMs: 2400, cycles: 1, property: 'opacity', luminanceSteps: [0] },
    'kp-sig-dark-dark-develop': { durationMs: 260, cycles: 1, property: 'opacity', luminanceSteps: [0.55, 0] },
    'kp-sig-dark-dark-brackets-open': { durationMs: 260, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-dark-size-develop': { durationMs: 480, cycles: 1, property: 'opacity', luminanceSteps: [0.2] },
    'kp-sig-dark-leave': { durationMs: 460, cycles: 1, property: 'opacity', luminanceSteps: [0] },
    // formal-register
    'kp-sig-formal-orbit': { durationMs: 1600, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-formal-ink': { durationMs: 3000, cycles: Infinity, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-formal-pen': { durationMs: 200, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-formal-dot': { durationMs: 200, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-sig-formal-rise': { durationMs: 280, cycles: 1, property: 'opacity', luminanceSteps: [0] },
    'kp-sig-formal-rule': { durationMs: 560, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-sig-formal-sheet': { durationMs: 300, cycles: 1, property: 'opacity', luminanceSteps: [0] },
    'kp-sig-formal-tip-drop': { durationMs: 200, cycles: 1, property: 'opacity', luminanceSteps: [0] },
    'kp-sig-formal-size-ink': { durationMs: 320, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-formal-leave': { durationMs: 400, cycles: 1, property: 'opacity', luminanceSteps: [0.2] },
    // sepia-register
    'kp-sig-sepia-sepia-leaf': { durationMs: 1600, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-sepia-sepia-soak': { durationMs: 3200, cycles: Infinity, property: 'opacity', luminanceSteps: [0, 1, 0] },
    'kp-sig-sepia-sepia-tick': { durationMs: 320, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-sepia-sepia-seal': { durationMs: 320, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-sepia-sepia-slip': { durationMs: 520, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-sepia-sepia-page': { durationMs: 440, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-sepia-sepia-gloss': { durationMs: 320, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-progressbar-sepia-dinkus': { durationMs: 2600, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-sepia-size-turn': { durationMs: 440, cycles: 1, property: 'opacity', luminanceSteps: [0] },
    'kp-sig-sepia-leave': { durationMs: 700, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 0] },
    'kp-sig-sepia-leave-2': { durationMs: 700, cycles: 1, property: 'box-shadow', luminanceSteps: [] },
    // solstice-register
    'kp-sig-solstice-solstice-arc': { durationMs: 2400, cycles: Infinity, property: 'opacity', luminanceSteps: [0, 1, 1, 0, 0] },
    'kp-sig-solstice-solstice-light': { durationMs: 3600, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-solstice-solstice-warm': { durationMs: 360, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-solstice-solstice-rise': { durationMs: 640, cycles: 1, property: 'transform, clip-path', luminanceSteps: [] },
    'kp-sig-solstice-solstice-dawn': { durationMs: 560, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-solstice-solstice-ember': { durationMs: 360, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-progressbar-solstice-arc': { durationMs: 2400, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-solstice-size-rise': { durationMs: 480, cycles: 1, property: 'opacity', luminanceSteps: [0] },
    'kp-sig-solstice-leave': { durationMs: 540, cycles: 1, property: 'opacity', luminanceSteps: [0] },
    // high-contrast-register
    'kp-sig-high-contrast-hc-walk': { durationMs: 1400, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-high-contrast-hc-march': { durationMs: 520, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-high-contrast-hc-wipe-x': { durationMs: 300, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-high-contrast-hc-wipe-y': { durationMs: 360, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-high-contrast-hc-hold': { durationMs: 140, cycles: 1, property: 'opacity', luminanceSteps: [0, 0] },
    'kp-sig-high-contrast-size-mark': { durationMs: 600, cycles: 1, property: 'outline, outline-offset', luminanceSteps: [] },
    'kp-sig-high-contrast-leave': { durationMs: 700, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 0, 0] },
    'kp-sig-high-contrast-leave-2': { durationMs: 700, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    // ── end of the port session's rows
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

/** Elements this module has started, so a second attach does not start them again [AR34]. */
const started = new WeakSet();
/** Fields whose caret listeners are already bound, so a second attach adds none [G16]. */
const carets = new WeakSet();
/**
 * The documents whose arrival overlay is on screen, each with the headline
 * reveals held until it has gone [scope-86]. Kept per document rather than
 * per attach: a second attach on the same page (js/auto.js over React, the
 * `DecipherText` wrapper) sees the arrival as already seen, but its
 * headline must still wait for the overlay the first attach put up.
 *
 * @type {WeakMap<Document, Set<() => void>>}
 */
const arrivalsOnScreen = new WeakMap();

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

    /** @type {Set<ReturnType<typeof setTimeout>>} */
    const timers = new Set();
    /** @type {Set<number>} */
    const frames = new Set();
    /** @type {Array<() => void>} */
    const cleanups = [];
    /** @type {Array<() => void>} */
    const finishers = [];

    /**
     * The closure's four mutable variables as one object [scope-117]: the
     * hooks live in modules of their own now, and every one of them must
     * write the same binding. `ioHeadline` is the headline's own on-view
     * watcher [S48], kept apart from `io` (the rule hook's) so a page whose
     * rule reveal is quiet still gets a working headline draw.
     * @type {EffectsState}
     */
    const state = { detached: false, io: null, ioHeadline: null, pending: 0 };

    const done = () => {
        if (state.detached || state.pending > 0) return;
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
            if (!state.detached) fn();
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

    // ── The hooks, fetched when asked for [scope-117] ──────────────────
    // Each hook lives in js/effects/<hook>.js. A page that carries no
    // headline never downloads the decipher; a theme that declares no
    // pointer never downloads the light. A hook's module is fetched the
    // first time something asks for it and installed once; `state.pending`
    // is held while it is on its way, so the done attribute still waits for
    // every reveal that has not started yet.
    /** @type {Record<string, () => Promise<{ install: (ctx: EffectsContext) => Record<string, any> }>>} */
    const loaders = {
        headline: () => import('./effects/headline.js'),
        emphasis: () => import('./effects/emphasis.js'),
        rule: () => import('./effects/rule.js'),
        count: () => import('./effects/count.js'),
        caret: () => import('./effects/caret.js'),
        pointer: () => import('./effects/pointer.js'),
        measure: () => import('./effects/measure.js'),
        marquee: () => import('./effects/marquee.js'),
        arrival: () => import('./effects/arrival.js'),
    };
    /** @type {Record<string, Promise<Record<string, any>>>} */
    const installed = {};
    /** @type {EffectsContext} */
    let ctx;
    /** @param {string} name */
    const use = (name) => (installed[name] ??= loaders[name]().then((module) => module.install(ctx)));
    /** @type {Promise<void>[]} */
    const arriving = [];
    /**
     * The page as attach found it, for the hooks asked for during attach: a
     * hook that arrives after a React component has mounted must not wire it
     * [js/as-of.js]. Taken once scan has run; a hook asked for later, by
     * observe(), reads the page as it is then.
     * @type {WeakSet<Element> | null}
     */
    let present = null;
    /** @param {string} name @param {(hook: Record<string, any>) => void} fn */
    const run = (name, fn) => {
        state.pending++;
        const asked = present;
        const arrived = use(name)
            .then((hook) => {
                if (state.detached) return;
                if (asked) asOf(root, asked, () => fn(hook));
                else fn(hook);
            })
            .catch((error) => console.error(error))
            .finally(() => {
                state.pending = Math.max(0, state.pending - 1);
                done();
            });
        arriving.push(arrived);
    };

    // ── Dispatch ──────────────────────────────────────────────────────
    /** @param {Element} el */
    const startOne = (el) => {
        if (started.has(el)) return;
        checkValues(el);
        const reveal = el.getAttribute(HOOKS.reveal);
        if (reveal === null || !REVEALS.includes(reveal)) return;
        started.add(el);
        if (reveal === 'headline') {
            // The headline waits for the arrival [scope-86]: started under
            // the overlay it was over before the overlay went, so a first
            // visit never saw it. It starts when the overlay is removed,
            // whether the arrival ran its course, was skipped or clicked
            // away; with no arrival on screen it starts now, as before.
            const held = arrivalsOnScreen.get(doc);
            if (!held) {
                run('headline', (hook) => hook.headline(el));
                return;
            }
            state.pending++;
            let waiting = true;
            const go = () => {
                if (!waiting) return;
                waiting = false;
                held.delete(go);
                state.pending--;
                // Detached while held: the text was never touched, so the
                // element only needs its rest record.
                if (state.detached) use('headline').then((hook) => hook.headline(el, true));
                else run('headline', (hook) => hook.headline(el));
            };
            held.add(go);
            finishers.push(go);
        } else if (reveal === 'emphasis') run('emphasis', (hook) => hook.emphasis(el));
        else run('rule', (hook) => hook.rule(el));
    };

    /** @param {ParentNode | Element} scope */
    const scan = (scope) => {
        if (scope instanceof Element && scope.hasAttribute(HOOKS.reveal)) startOne(scope);
        if (scope instanceof Element && scope.hasAttribute(HOOKS.surface)) checkValues(scope);
        for (const el of scope.querySelectorAll(`[${HOOKS.surface}], [${HOOKS.reveal}]`)) startOne(el);
        // Counting numbers [feat-count-1]. Armed once each: an element
        // already counted keeps its number when the module is attached a
        // second time, which js/auto.js does over React.
        if (scope instanceof Element && scope.hasAttribute(HOOKS.count) && !started.has(scope)) {
            started.add(scope);
            run('count', (hook) => hook.countUp(scope));
        }
        for (const el of scope.querySelectorAll(`[${HOOKS.count}]`)) {
            if (started.has(el)) continue;
            started.add(el);
            run('count', (hook) => hook.countUp(el));
        }
        if ((scope instanceof Element && scope.matches('mark')) || scope.querySelector('mark')) run('emphasis', (hook) => hook.looseMarks(scope));
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
        state.io?.disconnect();
        state.io = null;
        // Everything the module started, not only the rule's observer
        // [G8, 2026-09-08]. The draw routine keeps its own observer, the
        // marquee keeps one per band, and the caret and the measuring
        // lines hold listeners; leaving those running meant a reveal
        // still fired after somebody asked for the motion to stop, and
        // the count went negative when it did.
        state.ioHeadline?.disconnect();
        state.ioHeadline = null;
        for (const cleanup of cleanups.splice(0)) cleanup();
        for (const finish of finishers.splice(0)) finish();
        state.pending = 0;
        done();
    };
    // The subscription to the preference is deliberately not in
    // `cleanups`: onPreference empties that list to stop the observers and
    // listeners the routines made, and it must not unsubscribe itself
    // while doing so. detach() drops it explicitly [G8].
    if (query) query.addEventListener('change', onPreference);

    // Whether this attach puts up the arrival, decided before the scan so
    // the headline the scan finds already knows to wait for it [scope-86].
    // The arrival itself is built at the end of attach, as before.
    const arrivalAsked = rootStyle ? rootStyle.getPropertyValue(ROUTINES.arrival).trim() : '';
    const arrivalRoutine =
        arrivalAsked === '' || ARRIVALS.includes(arrivalAsked) ? arrivalAsked : reportUnknownRoutine(html, ROUTINES.arrival, arrivalAsked, ARRIVALS);
    const arrivalPerformed = (arrivalRoutine === 'boot' || arrivalRoutine === 'card') && Boolean(doc.body);
    const arrivalPlays = arrivalPerformed && !reduced() && !seen(html, 'arrival');
    if (arrivalPlays && !arrivalsOnScreen.has(doc)) arrivalsOnScreen.set(doc, new Set());

    ctx = {
        state,
        root,
        options,
        doc,
        html,
        manageRoot,
        view,
        query,
        reduced,
        rootStyle,
        knob,
        cfg,
        timers,
        frames,
        cleanups,
        finishers,
        done,
        announce,
        later,
        routineOf,
        memoKey,
        seen,
        reportUnknownRoutine,
        checkValues,
        startOne,
        scan,
        onPreference,
        arrivalRoutine,
        arrivalPerformed,
        arrivalPlays,
        started,
        carets,
        arrivalsOnScreen,
        unknownReported,
    };

    present = presentUnder(root);
    scan(root);

    // The hooks a theme or the page asks for once, in the order the closure
    // always ran them. Each module still decides for itself; the checks here
    // only save the download when the answer is certainly no.
    /** @param {string} name */
    const asked = (name) => (rootStyle ? rootStyle.getPropertyValue(name).trim() : '');
    // The pointer and press buses depend on the theme, and a theme can
    // arrive after attach: the reader switches, a lazily loaded register
    // lands, a framework renders its own switcher. They used to be armed
    // only if the theme active at attach asked, so dark's oxide film stood
    // still in every app that attached before dark was on [fix-81]. Each is
    // armed once, the first time a theme asks for it.
    let pointerArmed = false;
    let pressArmed = false;
    const armThemeBuses = () => {
        const wantPointer = !pointerArmed && asked(POINTER_KNOB) === 'track';
        const wantPress = !pressArmed && ['point', 'size'].includes(asked(PRESS_KNOB));
        if (!wantPointer && !wantPress) return;
        pointerArmed ||= wantPointer;
        pressArmed ||= wantPress;
        run('pointer', (hook) => {
            if (wantPointer) hook.pointerBus();
            if (wantPress) hook.pressBus();
        });
    };
    if (asked(CARET_KNOB) === 'block' && root.querySelector('input.kp-field__input')) run('caret', (hook) => hook.caret());
    armThemeBuses();
    if (rootStyle && typeof MutationObserver === 'function') {
        const watch = new MutationObserver(() => armThemeBuses());
        watch.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
        const onRegister = () => armThemeBuses();
        html.addEventListener('kp-register-load', onRegister);
        cleanups.push(() => {
            watch.disconnect();
            html.removeEventListener('kp-register-load', onRegister);
        });
    }
    if (asked(MEASURE_KNOB) === 'live' && root.querySelector(`[${HOOKS.reveal}='headline']`)) run('measure', (hook) => hook.measure());
    if (root.querySelector(`[${HOOKS.marquee}]`)) run('marquee', (hook) => hook.marquee());
    if (arrivalPerformed) run('arrival', (hook) => hook.arrival());

    // What observe() asks for later reads the page as it is then.
    present = null;

    return {
        // Every hook asked for so far has arrived and run [scope-117]. A
        // reveal still plays over its own time after that; this is only the
        // moment the code is in, which a caller that reads straight after
        // attach — a test, a wrapper counting listeners — waits for.
        get ready() {
            return Promise.all(arriving).then(() => undefined);
        },
        detach() {
            if (state.detached) return;
            state.detached = true;
            for (const id of timers) clearTimeout(id);
            timers.clear();
            for (const id of frames) view?.cancelAnimationFrame(id);
            frames.clear();
            state.io?.disconnect();
            state.io = null;
            state.ioHeadline?.disconnect();
            state.ioHeadline = null;
            for (const cleanup of cleanups.splice(0)) cleanup();
            query?.removeEventListener('change', onPreference);
            // Every reveal that was still running ends at its rest state
            // [G7, 2026-09-08]. Without this a page that navigated away
            // mid-decipher left the headline as a row of glyphs — and
            // because `started` remembered it, re-attaching never fixed
            // it. A consumer's route change is not a reason to leave
            // somebody's words scrambled.
            for (const finish of finishers.splice(0)) finish();
            state.pending = 0;
            if (manageRoot) html.removeAttribute(ROOT_ATTRIBUTE);
        },
        observe(element) {
            if (state.detached) return;
            scan(element);
        },
    };
}
