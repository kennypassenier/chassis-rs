// Reading the theme a root wears and the theme a change is held for [AR25, scope-50].

import { DEFAULT_THEME } from '../theme-registry.js';
import { PENDING_THEME_ATTRIBUTE, PREVIEW_THEME_ATTRIBUTE, asTheme, isDropped, rootOf } from './values.js';
import { reportUnknown } from './report.js';

/** @typedef {import('./values.js').ThemeName} ThemeName */

/**
 * @param {{ root?: Element }} [options]
 * @returns {ThemeName} the theme the root is currently wearing
 */
export function currentTheme({ root } = {}) {
    if (typeof document === 'undefined') return DEFAULT_THEME;
    const element = rootOf(root);
    // A preview is not the theme: the real one is what the root went back to when it ends.
    const raw = element.getAttribute(PREVIEW_THEME_ATTRIBUTE) ?? element.getAttribute('data-theme');
    // Site 2 of 4 [AR25]. The name was already gone by the time
    // applyTheme could have seen it: `?? DEFAULT_THEME` below is the
    // silence this exists to break.
    if (isDropped(raw)) reportUnknown(raw, DEFAULT_THEME, 'current', element);
    return asTheme(raw) ?? DEFAULT_THEME;
}

/**
 * The theme a change is being held for, or null when none is [scope-50].
 * While it is set, `currentTheme()` is still the theme the root wears.
 *
 * @param {{ root?: Element }} [options]
 * @returns {ThemeName | null}
 */
export function pendingTheme({ root } = {}) {
    if (typeof document === 'undefined') return null;
    return asTheme(rootOf(root).getAttribute(PENDING_THEME_ATTRIBUTE));
}
