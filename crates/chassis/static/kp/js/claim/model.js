// What a claim list remembers and reads: its state, people, attributes and the item of a row.
import { getChecklistItems, setChecklistItems } from '../checklist.js';
/** @typedef {import('./types.js').ClaimInfo} ClaimInfo */
/** @typedef {import('./types.js').ClaimPerson} ClaimPerson */
/** @typedef {import('./types.js').ClaimState} ClaimState */

/** @type {WeakMap<Element, ClaimState>} */
const STATE = new WeakMap();

/** @param {string} className @param {string} [tag] */
export const el = (className, tag = 'div') => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};

/** @param {ClaimPerson | ClaimPerson[] | null | undefined} by @returns {ClaimPerson[]} */
export function claimPeople(by) {
    if (!by) return [];
    return (Array.isArray(by) ? by : [by]).filter((p) => p && p.id !== undefined).map((p) => ({ id: String(p.id), name: String(p.name ?? p.id) }));
}

/** @param {Element} list @param {string} name @param {string} fallback */
export const attr = (list, name, fallback) => list.getAttribute(`data-kp-claim-${name}`) ?? fallback;

/** @param {Element} list */
export const stateOf = (list) => {
    let s = STATE.get(list);
    if (!s) {
        s = { viewer: null, people: [], busy: new Set(), refused: new Map(), filter: 'all', said: '' };
        STATE.set(list, s);
    }
    return s;
};

/** @param {HTMLElement} list @param {string} message */
export function say(list, message) {
    let region = /** @type {HTMLElement | null} */ (list.querySelector(':scope > .kp-claim__live'));
    if (!region) {
        region = el('kp-sr-only kp-claim__live', 'span');
        region.setAttribute('role', 'status');
        list.append(region);
    }
    const target = region;
    target.textContent = '';
    setTimeout(() => (target.textContent = message), 60);
}

/** The claim of an item as a normalised list. @param {{ claim?: ClaimInfo }} item */
export const byOf = (item) => claimPeople(item.claim?.by);

/** @param {HTMLElement} list @param {string} id */
export const itemOf = (list, id) => getChecklistItems(list).find((i) => i.id === id);

/**
 * Write a new claim onto one item, through the checklist so the rows are changed in place.
 * @param {HTMLElement} list @param {string} id @param {ClaimPerson[]} by
 */
export function write(list, id, by) {
    setChecklistItems(
        list,
        getChecklistItems(list).map((i) => (i.id === id ? { ...i, claim: { ...i.claim, by } } : i)),
    );
}
