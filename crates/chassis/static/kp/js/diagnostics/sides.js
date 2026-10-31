// What each half says about itself: the stylesheet's version and theme names, and the script's.

import { THEMES, VERSION } from '../theme-registry.js';
import { unknownEffects } from '../effects.js';

/** @typedef {import('../diagnostics.js').Side} Side */

/** The custom property carrying the stylesheet's version [AR25]. */
export const VERSION_PROPERTY = '--kp-themes-version';
/** The custom property carrying the stylesheet's theme names [AR25]. */
export const NAMES_PROPERTY = '--kp-themes-names';

/**
 * What getComputedStyle hands back for a custom property: the raw token,
 * leading whitespace and all, quotes included.
 *
 * @param {string | null | undefined} raw
 * @returns {string}
 */
function unquote(raw) {
    const trimmed = (raw ?? '').trim();
    return trimmed.replace(/^['"]/, '').replace(/['"]$/, '').trim();
}

/**
 * What the stylesheet on this page says about itself.
 *
 * A stylesheet older than 3.2.0 declares neither property, and that is
 * information rather than an error: it is older than any JavaScript that
 * can ask the question.
 *
 * @param {{ root?: Element }} [options]
 * @returns {Side}
 */
export function stylesheetSide({ root } = {}) {
    if (typeof document === 'undefined') return { version: null, themes: [] };
    const style = getComputedStyle(root ?? document.documentElement);
    const version = unquote(style.getPropertyValue(VERSION_PROPERTY));
    const names = unquote(style.getPropertyValue(NAMES_PROPERTY));
    return { version: version === '' ? null : version, themes: names === '' ? [] : names.split(/\s+/) };
}

/**
 * What the JavaScript on this page says about itself.
 *
 * @returns {Side}
 */
export function scriptSide() {
    return { version: VERSION, themes: THEMES.map((t) => t.name), unknownEffects: unknownEffects() };
}
