// Pure pill layout: how many pills a day holds and how an overflow stacks.
import { GAP } from './constants.js';
import { keyOf, make } from './helpers.js';
/** @typedef {import('./types.js').WeekEvent} WeekEvent */
/** @typedef {import('./types.js').WeekModel} WeekModel */

/**
 * Where the pills of one column stand: each at its time of day, pushed down
 * until it clears the one above, and pulled back up where the stack would run
 * out of the bottom. Pure; every number is px of the column's height.
 *
 * @param {number[]} wants each pill's wanted top, as a share of the column (0 to 1), in time order
 * @param {number} height the column's height
 * @param {number} pill one pill's height
 * @param {number} [gap] the space kept between two pills
 * @returns {number[]} each pill's top
 */
export function stackPills(wants, height, pill, gap = GAP) {
    const step = pill + gap;
    const max = Math.max(0, height - pill);
    const tops = wants.map((want) => Math.min(Math.max(0, want * height), max));
    for (let i = 1; i < tops.length; i += 1) tops[i] = Math.max(tops[i] ?? 0, (tops[i - 1] ?? 0) + step);
    const last = tops.length - 1;
    if (last >= 0 && (tops[last] ?? 0) > max) {
        tops[last] = max;
        for (let i = last - 1; i >= 0; i -= 1) tops[i] = Math.min(tops[i] ?? 0, (tops[i + 1] ?? 0) - step);
    }
    return tops;
}

/**
 * How many pills a column of `height` holds at one pill's height.
 * @param {number} height
 * @param {number} pill
 * @param {number} [gap]
 * @returns {number}
 */
export function pillCapacity(height, pill, gap = GAP) {
    return Math.max(1, Math.floor((height - pill) / (pill + gap)) + 1);
}

/** A pill for an item, kept by id. @param {WeekModel} c @param {WeekEvent} e */
export function pillFor(c, e) {
    let button = c.pills.get(e.id);
    const doc = c.el.ownerDocument;
    const reference = e.state === 'reference';
    if (button && (button.tagName === 'BUTTON') === reference) {
        button.remove();
        button = undefined;
    }
    if (!button) {
        button = /** @type {HTMLButtonElement} */ (make(doc, reference ? 'span' : 'button', 'kp-week__pill'));
        if (!reference) button.type = 'button';
        button.append(make(doc, 'b', 'kp-week__time'), make(doc, 'span', 'kp-week__label'));
        c.pills.set(e.id, button);
        c.decorate?.(button, { kind: 'pill', host: c.el, key: keyOf(c.el), id: e.id });
    }
    button.dataset.kpId = e.id;
    return button;
}
