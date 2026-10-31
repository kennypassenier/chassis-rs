// The selector, the event, the levels and the attributes the version chip redraws on.

/** The chips this module draws. */
export const VERSION_DELTA = '[data-kp-version-to], [data-kp-version-from], .kp-badge--version[data-kp-state]';
/** Fired on the chip after Shift+click copied it: `{ text }`. */
export const VERSION_COPY_EVENT = 'kp-version-copy';
/** The levels a jump has, loudest last in a sort. */
export const VERSION_LEVELS = /** @type {const} */ (['same', 'other', 'patch', 'minor', 'major', 'downgrade', 'unknown']);
/** The sort value of each level: the risky first when sorted down. */
export const VERSION_SORT = Object.freeze({ downgrade: 4, major: 3, minor: 2, patch: 1, other: 0, same: 0, unknown: 0 });

/** How many numbers a `semver` version reads. */
export const SEMVER_NUMBERS = 3;
/** How many characters of a `sha256:` digest the short form keeps. */
export const DIGEST_SHORT_CHARS = 12;

/** The attributes that redraw a chip. */
export const VERSION_OBSERVED = [
    'data-kp-version-from',
    'data-kp-version-to',
    'data-kp-version-app',
    'data-kp-version-href',
    'data-kp-version-scheme',
    'data-kp-version-level',
    'data-kp-version-tones',
    'data-kp-version-show',
    'data-kp-version-arrow',
    'data-kp-version-digest',
    'data-kp-version-big-at',
    'data-kp-version-error',
    'data-kp-state',
];
