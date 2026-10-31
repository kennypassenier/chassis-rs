// Drawing one mark from a name: its colour, letters, pattern and glyph, and the record of what each mark was last drawn from.

import { getStrings } from '../strings.js';
import { AVATAR_ATTRIBUTES, decorateAvatar } from './avatar.js';
import { idmarkFor, idmarkLetters } from './mark.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** The pattern is a 5 by 5 grid inside a box with a one-cell margin. */
const PATTERN_BOX = 7;

/** What each mark was last drawn from, so a mark drawn by setIdmark() is not drawn a second time by attachIdmarks(). @type {WeakMap<Element, { base: string, slot: number }>} */
export const DRAWN = new WeakMap();

/** What a mark is drawn from, apart from its palette slot. @param {Element} el */
export const baseKey = (el) =>
    `${el.getAttribute('data-kp-idmark') ?? ''}|${AVATAR_ATTRIBUTES.map((attr) => el.getAttribute(attr) ?? '').join('|')}|${el.className}`;

/** @param {Document} doc @param {[number, number][]} cells */
function patternSvg(doc, cells) {
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'kp-idmark__pattern');
    svg.setAttribute('viewBox', `0 0 ${PATTERN_BOX} ${PATTERN_BOX}`);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('shape-rendering', 'crispEdges');
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', cells.map(([x, y]) => `M${x + 1} ${y + 1}h1v1h-1z`).join(''));
    svg.append(path);
    return svg;
}

/**
 * Fill a mark from a name: its colour, letters, pattern and glyph. Call it
 * again with a new name; an empty name gives the quiet plate.
 * @param {HTMLElement} el a `.kp-idmark`
 * @param {string} name
 * @param {{ slot?: number, hue?: 'palette' | 'free', title?: boolean }} [options]
 *   `slot` a palette slot from idmarkColours(); `hue` defaults to the element's
 *   `data-kp-idmark-hue` ('free') else 'palette'; `title` (default true) puts
 *   the name in the element's title for a pointer
 */
export function setIdmark(el, name, { slot, hue, title = true } = {}) {
    const mark = idmarkFor(name);
    const doc = el.ownerDocument;
    el.classList.add('kp-idmark');
    if (!el.hasAttribute('aria-hidden')) el.setAttribute('aria-hidden', 'true');
    el.setAttribute('data-kp-idmark', mark.name);
    el.toggleAttribute('data-kp-idmark-empty', mark.empty);
    el.setAttribute('data-kp-idmark-glyph', mark.glyph);
    const free = (hue ?? el.getAttribute('data-kp-idmark-hue')) === 'free';
    if (mark.empty) el.style.removeProperty('--kp-idmark-colour');
    else if (free) el.style.setProperty('--kp-idmark-colour', `oklch(from var(--chart-1) l c ${mark.hue})`);
    else el.style.setProperty('--kp-idmark-colour', `var(--chart-${slot ?? mark.slot})`);
    if (title && mark.name) el.title = mark.name;
    else el.removeAttribute('title');
    const xs = el.classList.contains('kp-idmark--xs');
    const letters = doc.createElement('span');
    letters.className = 'kp-idmark__letters';
    letters.textContent = mark.empty ? getStrings().idmarkUnknown : idmarkLetters(mark.name, xs ? 1 : 2);
    el.replaceChildren(letters, ...(mark.empty ? [] : [patternSvg(doc, mark.cells)]));
    decorateAvatar(el, mark.name);
    DRAWN.set(el, { base: baseKey(el), slot: slot ?? mark.slot });
}
