// Previewing a theme on the root for a look, without choosing it [anchors-picker-1019].

import { DEFAULT_THEME } from '../theme-registry.js';
import { DARK, PREVIEW_THEME_ATTRIBUTE, asTheme, config, rootOf } from './values.js';

/** @typedef {import('./values.js').ThemeName} ThemeName */

/**
 * Show a theme on the root for a look, without choosing it [anchors-picker-1019].
 *
 * Nothing is announced (no `kp-theme-before-change`, no `kp-theme-change`), nothing is stored, and `currentTheme()` goes on
 * answering the theme the root really wears; only `data-theme` and the dark class change, so the page, its charts that read the
 * theme from the root and the tokens all show the previewed theme. A theme that does not exist is ignored (no fallback to the
 * default: a preview of nothing is no preview). Previewing the theme already worn ends a preview. `endPreview()` goes back;
 * `applyTheme()` makes a choice and ends it. A theme whose register is loaded on demand needs it loaded first:
 * js/theme-picker.js does that before it calls this.
 *
 * @param {unknown} theme
 * @param {{ root?: Element, darkClass?: string | null }} [options]
 * @returns {ThemeName | null} the theme now shown, or null when the name is not a theme
 */
export function previewTheme(theme, { root, darkClass } = {}) {
    const known = asTheme(theme);
    if (known === null || typeof document === 'undefined') return null;
    const element = rootOf(root);
    const real = asTheme(element.getAttribute(PREVIEW_THEME_ATTRIBUTE)) ?? asTheme(element.getAttribute('data-theme')) ?? DEFAULT_THEME;
    if (known === real) {
        endPreview({ root: element, darkClass });
        return known;
    }
    element.setAttribute(PREVIEW_THEME_ATTRIBUTE, real);
    element.setAttribute('data-theme', known);
    const cls = darkClass === undefined ? config.darkClass : darkClass;
    if (cls) element.classList.toggle(cls, DARK.has(known));
    return known;
}

/**
 * Go back from a preview to the theme the root really wears.
 *
 * @param {{ root?: Element, darkClass?: string | null }} [options]
 * @returns {boolean} whether there was a preview to end
 */
export function endPreview({ root, darkClass } = {}) {
    if (typeof document === 'undefined') return false;
    const element = rootOf(root);
    const real = asTheme(element.getAttribute(PREVIEW_THEME_ATTRIBUTE));
    if (!element.hasAttribute(PREVIEW_THEME_ATTRIBUTE)) return false;
    element.removeAttribute(PREVIEW_THEME_ATTRIBUTE);
    if (real) {
        element.setAttribute('data-theme', real);
        const cls = darkClass === undefined ? config.darkClass : darkClass;
        if (cls) element.classList.toggle(cls, DARK.has(real));
    }
    return true;
}

/**
 * The theme being previewed on the root, or null when none is.
 *
 * @param {{ root?: Element }} [options]
 * @returns {ThemeName | null}
 */
export function previewedTheme({ root } = {}) {
    if (typeof document === 'undefined') return null;
    const element = rootOf(root);
    return element.hasAttribute(PREVIEW_THEME_ATTRIBUTE) ? asTheme(element.getAttribute('data-theme')) : null;
}
