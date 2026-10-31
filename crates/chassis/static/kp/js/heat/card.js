// The busy card over a loading grid and the redraw that waits for it.
import { openBusyCard } from '../busy-card.js';

/* ------------------------------------------------------------- the busy card */

/** The busy card over a loading grid's cells (js/busy-card.js). @type {WeakMap<Element, import('../busy-card.js').BusyCard>} */
const CARDS = new WeakMap();
/** A card on its way out and the spec that waits for it: the latest one asked for. @type {WeakMap<Element, { card: import('../busy-card.js').BusyCard, spec: any }>} */
const WAITING = new WeakMap();
/** The grids drawn before: a card on a grid's first render is the page, not news, and does not arrive. @type {WeakSet<Element>} */
const DRAWN = new WeakSet();

/**
 * Before a grid is written: a grid that leaves its loading state lets its card leave first, and the data is drawn once
 * the card has gone (nothing under a card on its way out; a later spec replaces the waiting one). A grid that loads
 * again while its card is leaving takes the leaving card out at once: one card at a time.
 * @param {HTMLElement} el @param {any} spec @param {boolean} loading @param {(el: HTMLElement, spec: any) => void} draw
 * @returns {boolean} true when the spec waits for the card
 */
export function waitForCard(el, spec, loading, draw) {
    const waiting = WAITING.get(el);
    if (loading) {
        if (waiting) {
            WAITING.delete(el);
            waiting.card.remove();
        }
        return false;
    }
    if (waiting) {
        waiting.spec = spec;
        return true;
    }
    const card = CARDS.get(el);
    if (!card) return false;
    CARDS.delete(el);
    const entry = { card, spec };
    WAITING.set(el, entry);
    void card.close().then(() => {
        if (WAITING.get(el) !== entry) return;
        WAITING.delete(el);
        draw(el, entry.spec);
    });
    return true;
}

/**
 * After a grid is written: a loading grid holds the data table's busy card, centred over its cells (the axis, the
 * headers and the labels stay beside it), and keeps the one it had; a grid that is not loading holds none.
 * @param {HTMLElement} el the box the card is placed in @param {boolean} loading @param {string} words
 * @param {import('../busy-card.js').BusyCardOptions['area']} area @param {string} className
 */
export function syncCard(el, loading, words, area, className) {
    const first = !DRAWN.has(el);
    markDrawn(el);
    const card = CARDS.get(el);
    if (!loading) {
        if (card) {
            CARDS.delete(el);
            card.remove();
        }
        return;
    }
    if (card) {
        if (card.layer.parentElement !== el) el.append(card.layer);
        card.place();
        return;
    }
    CARDS.set(el, openBusyCard(el, { words, area, className, arrive: !first }));
}

/** The plate a heat grid shows for an empty or failed state, and what it was drawn from. @type {WeakMap<Element, { note: HTMLElement, state: string, title: string, text: string | undefined, art: unknown }>} */
export const PLATES = new WeakMap();

/** A grid is drawn once its first render has been painted. @param {Element} el */
export function markDrawn(el) {
    if (DRAWN.has(el)) return;
    const view = el.ownerDocument.defaultView;
    if (view) view.requestAnimationFrame(() => DRAWN.add(el));
    else DRAWN.add(el);
}

/** Take every child of `el` out but its busy card, and put `nodes` in before it. @param {HTMLElement} el @param {Node[]} nodes */
export function replaceKeepingCard(el, nodes) {
    const keep = CARDS.get(el)?.layer;
    for (const child of [...el.childNodes]) if (child !== keep) child.remove();
    if (keep && keep.parentElement === el) keep.before(...nodes);
    else el.append(...nodes);
}
