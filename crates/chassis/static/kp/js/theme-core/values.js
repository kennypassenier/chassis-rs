// The theme runtime's fixed names and its settable defaults: the event and attribute names, configureTheme(), the theme-name guards [AR5, KT6, TH26].

import { THEMES, STORAGE_KEY } from '../theme-registry.js';

/**
 * A theme name, as a union of the eleven that exist [KT4].
 *
 * Only the OUTPUTS of this module narrowed to it. What a function accepts
 * stays lenient — `storeTheme` and `initializeTheme` still take a plain
 * string — because narrowing an input breaks a consumer that reads a theme
 * out of config or a database, which is exactly what JobTracker and
 * kp-soft do. Narrowing a return value cannot break anyone.
 *
 * @typedef {import('../theme-registry.js').ThemeName} ThemeName
 */

/**
 * The event both channels listen to. A contract value: a consumer may
 * listen for it too, so it does not get renamed casually [TH26]. It
 * bubbles from the root, so `document.addEventListener` sees it as it
 * always did, and so does a listener on the root itself.
 */
export const THEME_EVENT = 'kp-theme-change';
/** Fired before a change, cancelable: `{ theme, previous }`. preventDefault() keeps the current theme. */
export const BEFORE_THEME_EVENT = 'kp-theme-before-change';
/**
 * Fired when a name was dropped: `{ requested, applied, source }` [TH97].
 *
 * `source` is one of `stored`, `current`, `apply` or `cross-tab` — the
 * four places a name can be dropped (AR25). A consumer listening to this
 * learns what its page asked for and what it got, which is the whole of
 * what the silence used to cost.
 */
export const UNKNOWN_THEME_EVENT = 'kp-theme-unknown';
/**
 * The theme a change is being HELD for, on the root [scope-50].
 *
 * A listener on BEFORE_THEME_EVENT can say no for two reasons, and a
 * caller needs to tell them apart: a refusal (the change will not happen)
 * and a hold (it will, once something has arrived — js/lazy-register.js
 * holds a change until the new theme's register has loaded, because
 * tokens without their register are a theme that is not that theme).
 * A holding listener writes the requested name here before it cancels;
 * `applyTheme()` removes it whenever a theme is actually put on the root,
 * so a later choice supersedes a held one. `pendingTheme()` reads it.
 */
export const PENDING_THEME_ATTRIBUTE = 'data-theme-pending';

/**
 * The theme a root is really wearing while it shows a PREVIEW of another, on the root [anchors-picker-1019].
 *
 * `previewTheme()` puts a theme on the root to look at it, without a change: nothing is announced, nothing is stored, no
 * listener is asked. While it is set, `data-theme` is the previewed theme and this attribute names the real one;
 * `currentTheme()` still answers the real one, so a picker's mark, a stored choice and every `kp-theme-change` listener keep
 * seeing the theme the person chose. `endPreview()` removes it, and so does `applyTheme()` whenever it puts a theme on the root.
 */
export const PREVIEW_THEME_ATTRIBUTE = 'data-theme-preview-from';

/** @typedef {{ root?: Element, darkClass?: string | null, storageKey?: string }} ThemeConfig */

/** The document-wide defaults, settable once by a consumer. */
export const config = { root: /** @type {Element | null} */ (null), darkClass: /** @type {string | null} */ ('dark'), storageKey: STORAGE_KEY };

/**
 * Set the defaults once: which element wears the theme (default: the
 * document element), which class marks a dark theme (default `dark`; null
 * for none), and the storage key.
 *
 * @param {ThemeConfig} next
 */
export function configureTheme(next) {
    if (next.root !== undefined) config.root = next.root;
    if (next.darkClass !== undefined) config.darkClass = next.darkClass;
    if (next.storageKey !== undefined) config.storageKey = next.storageKey;
}

/** @param {Element | undefined} root */
export const rootOf = (root) => root ?? config.root ?? document.documentElement;

// Widened back to string on purpose: this array is what the runtime check
// searches, and `includes` on a ThemeName[] refuses the unknown string we
// are asking about. The narrowing happens in the guard's return type,
// where it is earned rather than assumed.
const NAMES = /** @type {readonly string[]} */ (THEMES.map((t) => t.name));
export const DARK = new Set(THEMES.filter((t) => t.dark).map((t) => t.name));

/** @param {unknown} value @returns {value is ThemeName} */
export const isTheme = (value) => typeof value === 'string' && NAMES.includes(value);

/** @param {unknown} value @returns {ThemeName | null} */
export const asTheme = (value) => (isTheme(value) ? value : null);

/**
 * A value that was actually there and is not a theme.
 *
 * An absent attribute and an empty one are not faults: `data-theme=""` is
 * what a server writes when it has no preference to write.
 *
 * @param {string | null} raw
 * @returns {raw is string}
 */
export const isDropped = (raw) => raw !== null && raw !== '' && !isTheme(raw);
