// Putting a theme on the root and telling everyone: applyTheme() and initializeTheme() [AR6, scope-50, TH26].

import { DEFAULT_THEME } from '../theme-registry.js';
import { BEFORE_THEME_EVENT, DARK, PENDING_THEME_ATTRIBUTE, PREVIEW_THEME_ATTRIBUTE, THEME_EVENT, asTheme, config, rootOf } from './values.js';
import { endPreview } from './preview.js';
import { reportUnknown } from './report.js';
import { storedTheme } from './store.js';

/** @typedef {import('./values.js').ThemeName} ThemeName */

/**
 * Put a theme on the root and tell everyone.
 *
 * Validation lives here rather than in each caller: this is the exported
 * entry point and was the only one that did not validate, which is how an
 * unknown value used to reach the DOM through `applyTheme` while the same
 * value was rejected by the hook (AR6, adopted from the critic).
 *
 * @param {unknown} theme
 * @param {{ root?: Element, darkClass?: string | null, strict?: boolean, announce?: boolean }} [options]
 *   strict: throw on an unknown name instead of substituting the default; announce: dispatch the events (default true)
 * @returns {ThemeName} the theme actually applied — DEFAULT_THEME for anything unknown.
 *   When a listener refused or HELD the change, the theme the root still wears: with
 *   js/lazy-register.js attached that is the previous theme until the new register has
 *   loaded, and `pendingTheme()` names the one on its way [scope-50].
 */
export function applyTheme(theme, { root, darkClass, strict = false, announce = true } = {}) {
    const known = asTheme(theme);
    if (known === null && strict) throw new RangeError(`kp-themes: "${String(theme)}" is not a theme`);
    const next = known ?? DEFAULT_THEME;
    const element = rootOf(root);
    // Site 3 of 4 [AR25]. Only where the name is actually dropped: the
    // strict branch above threw, and a thrown RangeError is as loud as
    // this package gets. `undefined` is the caller passing nothing, not a
    // name that failed.
    if (known === null && theme !== null && theme !== undefined && theme !== '') reportUnknown(theme, next, 'apply', element);
    const previous = asTheme(element.getAttribute(PREVIEW_THEME_ATTRIBUTE) ?? element.getAttribute('data-theme'));
    if (announce && previous !== next) {
        const ask = new CustomEvent(BEFORE_THEME_EVENT, { bubbles: true, cancelable: true, detail: { theme: next, previous } });
        if (!element.dispatchEvent(ask)) {
            // Refused or held: the root goes back to the theme it really wears, not the one it was showing for a look.
            endPreview({ root: element, darkClass });
            return previous ?? DEFAULT_THEME;
        }
    }
    element.removeAttribute(PREVIEW_THEME_ATTRIBUTE);
    element.setAttribute('data-theme', next);
    // Whatever was held is superseded by what was just put on the root —
    // including a choice of the theme already worn, which announces
    // nothing and would otherwise let a held theme land after it.
    element.removeAttribute(PENDING_THEME_ATTRIBUTE);
    // The `dark` class is what a consumer's existing `dark:` variants key
    // on. Kept as a contract value [TH26], derived from the token source
    // rather than from a hand-kept list: kyu believed in four dark themes
    // where there are three.
    const cls = darkClass === undefined ? config.darkClass : darkClass;
    if (cls) element.classList.toggle(cls, DARK.has(next));
    if (announce && previous !== next) {
        element.dispatchEvent(new CustomEvent(THEME_EVENT, { bubbles: true, detail: { theme: next, previous, root: element } }));
    }
    return next;
}

/**
 * Before anything renders: wear the last known choice. Six lines in a
 * consumer's <head>, deliberately ignorant of which themes are dark —
 * that knowledge lives in the generated registry [TH23].
 *
 * @param {string} [fallback]
 * @param {{ root?: Element, key?: string }} [options]
 * @returns {ThemeName}
 */
export function initializeTheme(fallback = DEFAULT_THEME, { root, key } = {}) {
    return applyTheme(storedTheme({ key }) ?? fallback, { root });
}
