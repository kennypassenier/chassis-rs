// Giving a waiting part the pieces its theme names, measured now, and taking them away again.

import { PIECES_ATTRIBUTE, PIECES_PROPERTY, SHAPE } from './values.js';
import { DRAW, kindOf, px } from './draw.js';

/** What each dressed part was measured at, so a resize that changes nothing writes nothing. Shared by every watch: a part is dressed once. @type {WeakMap<Element, string>} */
const measured = new WeakMap();

/** @param {Element} el @returns {string} the pieces the theme `el` wears names */
const piecesOf = (el) => getComputedStyle(el).getPropertyValue(PIECES_PROPERTY).trim();

/**
 * Take a part's pieces away.
 * @param {Element} el
 */
export function undress(el) {
    for (const old of el.querySelectorAll(':scope > .kp-pieces')) old.remove();
    el.removeAttribute(PIECES_ATTRIBUTE);
    measured.delete(el);
    if (el instanceof HTMLElement) {
        el.style.removeProperty('--kp-pieces-q');
        el.style.removeProperty('--kp-pieces-d');
    }
}

/** The days start one after another in reading order, a week at a time. @param {HTMLElement} el */
function staggerDay(el) {
    const cell = el.closest('td, [role="gridcell"]');
    const index = cell && cell.parentElement ? [...cell.parentElement.children].indexOf(cell) : 0;
    el.style.setProperty('--kp-pieces-d', `${Math.max(0, index) * SHAPE.dayStagger}ms`);
}

/**
 * Give a part the pieces its theme names, measured now; a part whose theme
 * names none, or that no longer waits, loses any it had.
 * @param {HTMLElement} el
 * @returns {boolean} whether the part wears pieces now
 */
export function dress(el) {
    const kind = kindOf(el);
    const name = kind ? piecesOf(el) : '';
    const draw = DRAW[name];
    if (!kind || !draw || el.getClientRects().length === 0) {
        if (el.hasAttribute(PIECES_ATTRIBUTE)) undress(el);
        return false;
    }
    const size = `${name} ${kind} ${el.clientWidth}x${el.clientHeight}`;
    if (measured.get(el) === size && el.querySelector(':scope > .kp-pieces')) return true;
    for (const old of el.querySelectorAll(':scope > .kp-pieces')) old.remove();
    const { html, q } = draw(el, kind);
    const box = document.createElement('span');
    box.className = `kp-pieces kp-pieces--${kind}`;
    box.setAttribute('aria-hidden', 'true');
    box.innerHTML = html;
    el.append(box);
    if (q) el.style.setProperty('--kp-pieces-q', px(q));
    if (kind === 'day') staggerDay(el);
    el.setAttribute(PIECES_ATTRIBUTE, name);
    measured.set(el, size);
    return true;
}
