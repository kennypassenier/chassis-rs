// The upcoming list under the week: what is next and how it reads.
import { dayKey } from '../calendar.js';
import { dayName, dm, make } from './helpers.js';
/** @typedef {import('./types.js').WeekItem} WeekItem */
/** @typedef {import('./types.js').WeekModel} WeekModel */

/** Grid or list, as the container query has it now. @param {WeekModel} c @returns {'grid' | 'list'} */
export const modeOf = (c) => (getComputedStyle(c.grid).getPropertyValue('--kp-week-mode').trim() === 'list' ? 'list' : 'grid');

/** Whether the agenda shows its upcoming list now: asked for, and in rows. @param {WeekModel} c */
export const upcomingOn = (c) => c.upcoming.n > 0 && c.upcoming.list !== null && modeOf(c) === 'list';

/** The states that are not a coming run. */
const NOT_UPCOMING = new Set(['off', 'skipped', 'reference']);

/**
 * The next `n` items from now, in time order, of every day of the range.
 * @param {WeekModel} c @param {number} now
 * @returns {WeekItem[]}
 */
export function upcomingItems(c, now) {
    return c.cols
        .flatMap((col) => col.items)
        .filter((item) => item.ms >= now && !NOT_UPCOMING.has(item.event.state ?? ''))
        .sort((a, b) => a.ms - b.ms)
        .slice(0, c.upcoming.n);
}

/**
 * Fill the upcoming list: a row per item, the day named on the first row of each day, the item's own pill. Rows are kept
 * by id and moved only when the order changed, so a focused pill keeps its focus.
 * @param {WeekModel} c @param {WeekItem[]} items
 */
export function paintUpcoming(c, items) {
    const list = c.upcoming.list;
    if (!list) return;
    const doc = c.el.ownerDocument;
    const today = dayKey(c.now(), c.zone);
    /** @type {HTMLLIElement[]} */
    const wanted = [];
    let lastDay = '';
    for (const item of items) {
        let row = c.upcoming.rows.get(item.event.id);
        if (!row) {
            row = /** @type {HTMLLIElement} */ (make(doc, 'li', 'kp-week__next'));
            const head = make(doc, 'div', 'kp-week__head');
            head.setAttribute('aria-hidden', 'true');
            row.append(head);
            c.upcoming.rows.set(item.event.id, row);
        }
        const head = /** @type {HTMLElement} */ (row.firstElementChild);
        const first = item.day !== lastDay;
        lastDay = item.day;
        const key = `${item.day}|${first}|${item.day === today}`;
        if (head.dataset.kpKey !== key) {
            head.dataset.kpKey = key;
            head.replaceChildren(
                // One line, as tall as a pill: the weekday (or Today) and the date.
                ...(first
                    ? [
                          make(doc, 'span', 'kp-week__dow', dayName(c, item.day)),
                          make(doc, 'span', 'kp-week__today', c.strings.weekToday),
                          make(doc, 'span', 'kp-week__date', dm(item.day)),
                      ]
                    : []),
            );
        }
        row.toggleAttribute('data-kp-today', item.day === today);
        row.toggleAttribute('data-kp-day-start', first);
        if (row.lastElementChild !== item.button) row.append(item.button);
        wanted.push(row);
    }
    const have = /** @type {HTMLElement[]} */ ([...list.children]);
    if (wanted.length !== have.length || wanted.some((row, i) => row !== have[i])) {
        const keep = new Set(/** @type {Element[]} */ (wanted));
        for (const row of have) if (!keep.has(row)) row.remove();
        list.append(...wanted);
    }
    for (const [id, row] of c.upcoming.rows) if (!row.isConnected) c.upcoming.rows.delete(id);
    c.upcoming.items = items;
    // A week with nothing still to come says so in the list's own row; loading and failing say it over the list.
    const none = c.upcoming.on && c.state === 'ready' && c.leaving === null && items.length === 0;
    let empty = /** @type {HTMLLIElement | null} */ (list.querySelector(':scope > .kp-week__next--empty'));
    if (none && !empty) {
        empty = /** @type {HTMLLIElement} */ (make(doc, 'li', 'kp-week__next kp-week__next--empty'));
        empty.append(make(doc, 'span', 'kp-week__head'), make(doc, 'span', 'kp-week__none'));
        list.append(empty);
    }
    if (empty && !none) empty.remove();
    const words = c.el.dataset.kpWeekUpcomingEmpty || c.strings.weekEmpty;
    const none2 = empty?.querySelector('.kp-week__none');
    if (none && none2 && none2.textContent !== words) none2.textContent = words;
}
