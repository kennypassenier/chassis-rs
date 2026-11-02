// Reorder lists that share their items [habits-1101]: `data-kp-reorder-group="<name>"` on two or more `[data-kp-reorder]` lists lets
// an item go from one to the other, by pointer (dragged over the other list) and by keyboard (← → on its handle: the list before or
// after, in document order). These are the pure helpers: which lists share a group, where a point falls, a list's key and name.

/** The mark a list carries once it is wired (js/structure/reorder.js stamps it). */
const ATTACHED = 'kpReorderAttached';
/** How close to a scroller's side edge a dragged item must come before the scroller moves [px]. */
export const EDGE_PX = 40;
/** How far a scroller moves per pointer move near its edge [px]. */
export const EDGE_STEP_PX = 16;

/** The group a list belongs to, or null when it shares nothing. @param {HTMLElement} list */
export const groupOf = (list) => list.dataset.kpReorderGroup || null;

/** Whether a list can be seen: a list in a closed tab or a hidden lane takes no drop. @param {HTMLElement} list */
const shownList = (list) => (list.checkVisibility ? list.checkVisibility() : list.offsetParent !== null);

/**
 * The wired lists of a group, in document order (the order ← and → walk).
 * @param {HTMLElement} list one list of the group
 * @returns {HTMLElement[]}
 */
export function groupLists(list) {
    const name = groupOf(list);
    if (name === null) return [list];
    const all = /** @type {HTMLElement[]} */ ([...list.ownerDocument.querySelectorAll(`[data-kp-reorder-group="${CSS.escape(name)}"]`)]);
    return all.filter((other) => other.dataset[ATTACHED] !== undefined);
}

/** The key a list is reported by in `fromList` / `toList`: `data-kp-reorder-list`, else its id, else ''. @param {HTMLElement} list */
export const listKey = (list) => list.dataset.kpReorderList ?? list.id ?? '';

/**
 * A list's name for what is said: its `aria-label`, the words of its `aria-labelledby`, `data-kp-reorder-label`, else its key.
 * @param {HTMLElement} list
 */
export function listName(list) {
    const label = list.getAttribute('aria-label');
    if (label) return label;
    const ids = (list.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
    const words = ids.map((id) => list.ownerDocument.getElementById(id)?.textContent?.trim() ?? '').filter(Boolean);
    if (words.length) return words.join(' ');
    return list.dataset.kpReorderLabel ?? listKey(list);
}

/**
 * The list of the group under a point, if any: the shown list whose box holds it.
 * @param {HTMLElement[]} lists @param {number} x @param {number} y
 * @returns {HTMLElement | null}
 */
export function listAt(lists, x, y) {
    for (const list of lists) {
        if (!shownList(list)) continue;
        const box = list.getBoundingClientRect();
        if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return list;
    }
    return null;
}

/**
 * Where an item dropped at height `y` goes in a list: before the first other child whose middle is below `y`, else at the end.
 * @param {HTMLElement} list @param {HTMLElement} item the item being moved (not counted) @param {number} y
 */
export function indexAt(list, item, y) {
    const others = [...list.children].filter((child) => child !== item);
    const at = others.findIndex((child) => {
        const box = child.getBoundingClientRect();
        return y < box.top + box.height / 2;
    });
    return at === -1 ? others.length : at;
}

/**
 * The neighbouring list in the group, `step` lists away in document order, or null at the end.
 * @param {HTMLElement} list @param {number} step 1 or -1
 */
export function neighbour(list, step) {
    const lists = groupLists(list);
    return lists[lists.indexOf(list) + step] ?? null;
}

/**
 * While an item is dragged near the side edge of a scroller that holds it (a board's lanes on a phone), move the scroller so the
 * next list comes into reach.
 * @param {HTMLElement} item @param {number} x
 */
export function nudgeScroll(item, x) {
    for (let el = item.parentElement; el; el = el.parentElement) {
        if (el.scrollWidth <= el.clientWidth) continue;
        const style = getComputedStyle(el);
        if (style.overflowX !== 'auto' && style.overflowX !== 'scroll') continue;
        const box = el.getBoundingClientRect();
        if (x < box.left + EDGE_PX) el.scrollLeft -= EDGE_STEP_PX;
        else if (x > box.right - EDGE_PX) el.scrollLeft += EDGE_STEP_PX;
        return;
    }
}
