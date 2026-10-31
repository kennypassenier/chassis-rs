// Element, tone and unit helpers every part of the heat grid uses.
import { TONES } from './constants.js';
/** @typedef {import('./types.js').GridTone} GridTone */

/**
 * @param {Document} doc @param {string} tag @param {string} [cls] @param {Record<string, string>} [attrs]
 * @returns {HTMLElement}
 */
export function make(doc, tag, cls = '', attrs = {}) {
    const node = doc.createElement(tag);
    if (cls) node.className = cls;
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    return node;
}

/** @param {string | undefined} tone @returns {GridTone} */
export const toneOf = (tone) => (TONES.includes(tone ?? '') ? /** @type {GridTone} */ (tone) : 'muted');

/** @param {number | undefined} v */
export const unit = (v) => String(Math.min(1, Math.max(0, Number.isFinite(v) ? /** @type {number} */ (v) : 0)));
