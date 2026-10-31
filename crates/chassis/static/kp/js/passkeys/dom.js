// Small DOM builders shared by the parts of the list: an element with a class, the way-in glyph and the row finders.

import { GLYPHS, GLYPH_BOX, SVG_NS } from './constants.js';

/** @param {Document} doc @param {string} className @param {string} [tag] */
export const make = (doc, className, tag = 'span') => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    return node;
};

/** A button of the list: its type, the action it fires, its look and its words. @param {Document} doc @param {string} look @param {string} act @param {string} text */
export const actionButton = (doc, look, act, text) => {
    const button = make(doc, `kp-button ${look} kp-passkeys__action`, 'button');
    button.setAttribute('type', 'button');
    button.setAttribute('data-kp-passkeys-act', act);
    button.textContent = text;
    return button;
};

/** @param {Document} doc @param {import('./constants.js').PasskeyKind} kind */
export function glyph(doc, kind) {
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', GLYPH_BOX);
    svg.setAttribute('class', 'kp-passkeys__glyph');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', GLYPHS[kind] ?? GLYPHS.passkey);
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('fill-rule', 'evenodd');
    svg.append(path);
    return svg;
}

/** The row of `key` under `el`. @param {HTMLElement} el @param {string | null | undefined} key */
export const rowOf = (el, key) => [...el.querySelectorAll('[data-kp-passkey]')].find((li) => li.getAttribute('data-kp-passkey') === key);

/** The control of row `key` that fires `act`. @param {HTMLElement} el @param {string} key @param {string} act */
export const actionOf = (el, key, act) => /** @type {HTMLElement | null | undefined} */ (rowOf(el, key)?.querySelector(`[data-kp-passkeys-act="${act}"]`));
