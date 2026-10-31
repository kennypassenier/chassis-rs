// A band's items: sorted worst first, and set by key so an unchanged item stays the same element.

import { leave } from '../motion.js';
import { paintItem } from './item.js';
import { rank } from './values.js';

/** @typedef {import('../attention.js').AttentionItem} AttentionItem */

/** The items of a band, in the DOM's order. @param {Element} band @returns {HTMLElement[]} */
const itemsOf = (band) => /** @type {HTMLElement[]} */ ([...band.children]).filter((el) => el.classList.contains('kp-attention__item'));

/**
 * Put a band's items in severity order in the DOM (a stable sort: two
 * problems of one severity keep the order the page gave them).
 * @param {Element} band
 */
export function sortAttention(band) {
    const items = itemsOf(band);
    const sorted = [...items].sort((a, b) => rank(a) - rank(b));
    if (sorted.every((el, at) => el === items[at])) return;
    for (const el of sorted) band.append(el);
}

/** The items on the band by key, those leaving skipped. @param {Element} band @returns {Map<string, HTMLElement>} */
function shownByKey(band) {
    /** @type {Map<string, HTMLElement>} */
    const shown = new Map();
    for (const el of itemsOf(band)) {
        if (el.hasAttribute('data-kp-leaving')) continue;
        const key = el.getAttribute('data-kp-key');
        if (key !== null && !shown.has(key)) shown.set(key, el);
    }
    return shown;
}

/**
 * Write every given item into its element (kept, or made for a new key).
 * @param {Document} doc @param {AttentionItem[]} items @param {Map<string, HTMLElement>} shown
 * @returns {{ wanted: HTMLElement[], seen: Set<string> }}
 */
function paintWanted(doc, items, shown) {
    /** @type {HTMLElement[]} */
    const wanted = [];
    /** @type {Set<string>} */
    const seen = new Set();
    for (const item of items) {
        if (seen.has(item.key)) continue;
        seen.add(item.key);
        let el = shown.get(item.key);
        if (!el) {
            el = doc.createElement('div');
            el.className = 'kp-alert kp-attention__item';
            el.setAttribute('data-kp-key', item.key);
        }
        paintItem(el, item);
        wanted.push(el);
    }
    return { wanted, seen };
}

/**
 * Worst first, stable within a severity, then moved only where out of place.
 * @param {Element} band @param {HTMLElement[]} wanted @param {Set<Element>} going the items told to leave
 */
function placeItems(band, wanted, going) {
    const order = wanted.map((el, at) => ({ el, at })).sort((a, b) => rank(a.el) - rank(b.el) || a.at - b.at);
    /** @type {HTMLElement | null} */
    let before = null;
    for (const { el } of order) {
        /** @type {Element | null} */
        let prev = el.isConnected && el.parentElement === band ? el.previousElementSibling : null;
        while (prev && (!prev.classList.contains('kp-attention__item') || prev.hasAttribute('data-kp-leaving') || going.has(prev)))
            prev = prev.previousElementSibling;
        const inPlace = el.parentElement === band && prev === before;
        if (!inPlace) {
            if (before) before.after(el);
            else {
                const first = [...band.children].find((c) => c.classList.contains('kp-attention__item'));
                if (first && first !== el) first.before(el);
                else if (!first) band.append(el);
            }
        }
        before = el;
    }
}

/**
 * Set a band's problems, by key [port spec F]. An item whose key is on the
 * band already stays the same element and only what changed in it is
 * rewritten (an alert is not inserted again, so it is not announced again,
 * and focus on its fix stays); a new key makes a new item (`role="alert"`
 * for a critical one, `role="status"` otherwise); a key no longer given
 * leaves the theme's way (`leave()` from js/motion.js, at once under
 * reduced motion). The band ends worst first, in the given order within a
 * severity, and only items out of place are moved.
 *
 * @param {Element} band a `.kp-attention`
 * @param {AttentionItem[]} items
 */
export function setAttention(band, items) {
    const shown = shownByKey(band);
    const { wanted, seen } = paintWanted(band.ownerDocument, items, shown);
    // An item told to leave is marked `data-kp-leaving` only a microtask
    // later (leave() batches); until then it is skipped by hand, or the
    // items under it read as out of place and were moved, which took the
    // focus off a fix button in them.
    /** @type {Set<Element>} */
    const going = new Set();
    for (const [key, el] of shown)
        if (!seen.has(key)) {
            going.add(el);
            void leave(el);
        }
    placeItems(band, wanted, going);
}
