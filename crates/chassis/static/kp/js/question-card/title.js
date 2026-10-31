// The tab title: it says how many questions wait, for every card of the page together.

import { getStrings } from '../strings.js';
import { QUESTIONS } from './values.js';

/** The cards that count. @type {Set<HTMLElement>} */
const open = new Set();
let baseTitle = '';
let titleOn = false;

/** A card starts to count. @param {HTMLElement} card */
export function trackOpen(card) {
    open.add(card);
}

/** A card stops counting. @param {HTMLElement} card */
export function untrackOpen(card) {
    open.delete(card);
}

/** The tab title says how many questions wait. */
export function paintTitle() {
    if (typeof document === 'undefined') return;
    const count = [...open].filter(
        (c) =>
            c.isConnected &&
            (c.getAttribute('data-kp-state') === 'waiting' || c.getAttribute('data-kp-state') === 'urgent') &&
            c.closest(QUESTIONS)?.getAttribute('data-kp-title') !== 'off',
    ).length;
    const on = count > 0;
    if (!titleOn && on) baseTitle = document.title;
    if (on) document.title = `${getStrings().questionWaiting(count)} ${baseTitle}`;
    else if (titleOn) document.title = baseTitle;
    titleOn = on;
}
