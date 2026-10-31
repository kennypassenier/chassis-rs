// The star: listening for its key, appending it and syncing it.
import { setIdmark } from '../idmark.js';
import { attachToggles } from '../toggle.js';
import { getStrings } from '../strings.js';
import { ENTITY_STAR_EVENT, ENTITY_TICK_EVENT } from './constants.js';
import { DRAWN, made, starKeyOf } from './helpers.js';
/** @typedef {import('./types.js').EntityData} EntityData */

/**
 * The tick of a selectable card and the mark made from its name, at the start of the identity row.
 * @param {HTMLElement} card
 * @param {HTMLElement} el the identity row
 * @param {EntityData} data
 * @param {boolean} selectable
 * @param {string} markKind
 */
export function tickAndMark(card, el, data, selectable, markKind) {
    const doc = card.ownerDocument;
    const s = getStrings();
    if (selectable) {
        const box = /** @type {HTMLInputElement} */ (made(doc, 'input', 'kp-field__check kp-entity__tick'));
        box.type = 'checkbox';
        box.setAttribute('data-kp-select-row', '');
        box.setAttribute('aria-label', s.entitySelect(data.name));
        box.addEventListener('change', () => {
            card.classList.toggle('is-ticked', box.checked);
            card.dispatchEvent(new CustomEvent(ENTITY_TICK_EVENT, { bubbles: true, detail: { key: data.key, ticked: box.checked } }));
        });
        el.append(box);
    }
    if (markKind !== 'none') {
        const mark = made(doc, 'span', 'kp-idmark kp-idmark--sm');
        if (markKind === 'idmark') setIdmark(mark, data.name);
        else mark.textContent = '◆';
        el.append(mark);
    }
}

/** Cards whose star key is already listened for. @type {WeakSet<HTMLElement>} */
const KEYED = new WeakSet();

/**
 * The star key: while the focus is inside the card, the key (`s`) presses its star. A menu, a field and a chord stay theirs.
 * @param {HTMLElement} card
 */
function listenForStarKey(card) {
    if (KEYED.has(card)) return;
    KEYED.add(card);
    card.addEventListener('keydown', (event) => {
        const wanted = starKeyOf(card);
        if (wanted === 'off' || event.key.toLowerCase() !== wanted || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
        const target = /** @type {Element} */ (event.target);
        if (target.closest('input, textarea, select, [contenteditable], .kp-menu')) return;
        const button = /** @type {HTMLButtonElement | null} */ (card.querySelector(':scope > .kp-entity__id .kp-entity__star'));
        if (!button) return;
        event.preventDefault();
        button.click();
    });
}

/**
 * The favourite star: a real toggle button (js/toggle.js) in the identity row, above the card's link, so pressing it never follows
 * the link. Its name is hidden text ("Favourite jellyfin"), the star is a drawing that fills while it is pressed.
 * @param {HTMLElement} card
 * @param {HTMLElement} el the identity row
 * @param {EntityData} data
 * @param {boolean} pressed
 * @param {string} starKey
 */
export function appendStar(card, el, data, pressed, starKey) {
    const doc = card.ownerDocument;
    const ns = 'http://www.w3.org/2000/svg';
    const button = /** @type {HTMLButtonElement} */ (made(doc, 'button', 'kp-button kp-button--ghost kp-entity__star'));
    button.type = 'button';
    button.setAttribute('data-kp-toggle', '');
    button.setAttribute('data-kp-look', 'icon');
    button.setAttribute('aria-pressed', String(pressed));
    if (starKey !== 'off') button.setAttribute('aria-keyshortcuts', starKey);
    const glyph = doc.createElementNS(ns, 'svg');
    glyph.setAttribute('class', 'kp-entity__star-glyph');
    glyph.setAttribute('viewBox', '0 0 24 24');
    glyph.setAttribute('aria-hidden', 'true');
    const outline = doc.createElementNS(ns, 'path');
    outline.setAttribute('d', 'M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z');
    glyph.append(outline);
    const name = made(doc, 'span', 'kp-sr-only');
    name.textContent = getStrings().entityStar(data.name);
    button.append(glyph, name);
    el.append(button);
    attachToggles(button);
    button.addEventListener('kp-toggle-changed', (event) => {
        const detail = /** @type {CustomEvent} */ (event).detail;
        if (detail.source !== 'press') return;
        const was = DRAWN.get(card);
        if (was) was.star = detail.pressed;
        card.dispatchEvent(
            new CustomEvent(ENTITY_STAR_EVENT, { bubbles: true, detail: { key: card.getAttribute('data-kp-entity-key'), starred: detail.pressed } }),
        );
    });
    listenForStarKey(card);
}

/**
 * Put the star as the data says without an event (a refill with `starred`).
 * @param {HTMLElement} card
 * @param {boolean} star
 */
export function syncStar(card, star) {
    const button = card.querySelector(':scope > .kp-entity__id .kp-entity__star');
    if (button && button.getAttribute('aria-pressed') !== String(star)) button.setAttribute('aria-pressed', String(star));
}
