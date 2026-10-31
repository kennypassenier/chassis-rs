// The hook vocabulary of js/effects.js: the attributes, the values, the state classes and the custom properties a theme answers with.
// Contract values: a consumer may select on them, a register does.


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
    // The Sepia headline (theme removed 2026-10-08) [S48, LIFT_PLAN row 9]: the ghost look before the
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
