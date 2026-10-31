// Small helpers: options, star keys, the name, the slots, the kind of a tile, the frame and the columns.
import { ENTITY_GRID } from './constants.js';
/** @typedef {import('./types.js').EntityData} EntityData */

/** What each card was last drawn from, so a refill changes only what changed; `star` is the star as it stands now. @type {WeakMap<Element, { data: EntityData, drawn: Record<string, string>, star: boolean }>} */
export const DRAWN = new WeakMap();

/** @param {Element} el @param {string} name @returns {string | null} */
export const opt = (el, name) => el.getAttribute(name) ?? el.closest(ENTITY_GRID)?.getAttribute(name) ?? null;

/**
 * The key that stars a card: its own or its grid's `data-kp-entity-star-key`; with none, `s` - and `.` under a board whose tiles
 * jump by their first letter (`data-kp-tiles-keys="letters"`, js/tiles.js), so the star never takes a letter away from the search [wish-1120].
 * @param {Element} card
 */
export const starKeyOf = (card) =>
    (opt(card, 'data-kp-entity-star-key') ?? (card.closest('[data-kp-tiles-keys="letters"]') ? '.' : 's')).toLowerCase();

/**
 * Write a name into an element, the part that matches `match` (first occurrence, any case) wrapped in a `<mark>`. Text nodes and an
 * element only: nothing is parsed as HTML [wish-1120, homelab 121].
 * @param {HTMLElement} el @param {string} name @param {string | undefined} match
 */
export function writeName(el, name, match) {
    const at = match ? name.toLowerCase().indexOf(match.toLowerCase()) : -1;
    if (!match || at < 0) {
        el.textContent = name;
        return;
    }
    const mark = el.ownerDocument.createElement('mark');
    mark.className = 'kp-entity__match';
    mark.textContent = name.slice(at, at + match.length);
    el.replaceChildren(name.slice(0, at), mark, name.slice(at + match.length));
}

/** @param {Document} doc @param {string} tag @param {string} className */
export const made = (doc, tag, className) => {
    const el = doc.createElement(tag);
    el.className = className;
    return el;
};

/** @param {unknown} value */
export const sig = (value) => JSON.stringify(value);

/** The slots of a card, in order, for each kind. */
export const SLOTS = {
    stack: ['id', 'figures', 'flags', 'meters', 'actions'],
    tile: ['id', 'state', 'description', 'lines'],
};

/** @param {HTMLElement} card @returns {'stack' | 'tile'} */
const kindOf = (card) => (opt(card, 'data-kp-entity-kind') === 'tile' ? 'tile' : 'stack');

/** @param {HTMLElement} card @param {string} slot */
export const slotOf = (card, slot) => /** @type {HTMLElement} */ (card.querySelector(`:scope > .kp-entity__${slot}`));

/**
 * Make sure a card holds all the slots of its kind, once (again when the kind changes).
 * @param {HTMLElement} card
 * @returns {'stack' | 'tile'}
 */
export function frame(card) {
    const kind = kindOf(card);
    if (card.dataset.kpEntityFramed === kind) return kind;
    card.dataset.kpEntityFramed = kind;
    const doc = card.ownerDocument;
    card.classList.add('kp-card', 'kp-card--entity');
    card.setAttribute('data-kp-entity', '');
    card.toggleAttribute('data-kp-entity-tile', kind === 'tile');
    card.replaceChildren(...SLOTS[kind].map((slot) => made(doc, 'div', `kp-entity__${slot}`)));
    const was = DRAWN.get(card);
    if (was) was.drawn = {};
    return kind;
}

/**
 * How many columns the actions stand in: the most buttons any card of the grid shows (at most `inline`), and one more for
 * a "More" when some card has actions left over. Never fewer than one.
 * @param {HTMLElement} host the grid, or the card when it stands alone
 * @param {number} inline
 */
export function columnsFor(host, inline) {
    const cards = host.matches(ENTITY_GRID) ? [...host.querySelectorAll(':scope > .kp-card--entity')] : [host];
    let most = 0;
    let more = false;
    for (const card of cards) {
        const data = DRAWN.get(card)?.data;
        if (!data || data.status === 'loading') continue;
        const n = (data.actions ?? []).length;
        most = Math.max(most, Math.min(n, inline));
        if (n > inline) more = true;
    }
    return Math.max(1, most + (more ? 1 : 0));
}
