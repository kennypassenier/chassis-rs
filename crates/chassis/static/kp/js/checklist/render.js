// Drawing a checklist from its items, changing what is there in place, and the glide of the rows that moved.

import { motionAllowed } from '../calm.js';
import { hostStatePlate } from '../state-plate.js';
import { getStrings } from '../strings.js';
import { el, part } from './parts.js';
import { groupsOf, rowFor, shownOrder } from './rows.js';
import { CHECKLIST_RENDER_EVENT, CHECKLIST_RETRY_EVENT, ITEMS, PLATE, UNDO, nextSerial } from './state.js';

/** @typedef {import('../checklist.js').ChecklistItem} ChecklistItem */
/** @typedef {ReturnType<typeof getStrings>} Strings */

/** The heading level of a group, unless `data-kp-checklist-heading` says, and its bounds. */
const HEADING_LEVEL = 3;
const HEADING_MIN = 2;
const HEADING_MAX = 6;
/** A ride shorter than this is not animated [px]. */
const GLIDE_MIN_PX = 1;
/** How much longer a ride takes per pixel it travels [ms/px], up to twice the theme's size time. */
const GLIDE_MS_PER_PX = 0.6;

/**
 * Draw the list from its items, changing what is there in place: a row keeps its element (and its focus) whatever moves
 * around it. Returns the rows' places before the change, for the glide.
 * @param {HTMLElement} list
 * @returns {Map<string, DOMRect>}
 */
export function render(list) {
    const strings = getStrings();
    const items = ITEMS.get(list) ?? [];
    const body = part(list, 'body');
    /** @type {Map<string, DOMRect>} */
    const before = new Map();
    /** @type {Map<string, HTMLElement>} */
    const rows = new Map();
    for (const row of /** @type {NodeListOf<HTMLElement>} */ (body.querySelectorAll('.kp-checklist__item'))) {
        const id = row.getAttribute('data-id') ?? '';
        rows.set(id, row);
        before.set(id, row.getBoundingClientRect());
    }
    renderGroups(list, body, items, rows, strings);
    renderBar(list, items, strings);
    renderEmpty(list, body, items.length, strings);
    // A part that adds to the rows (js/claim.js) draws its own cells once the rows stand [kpadopt6].
    list.dispatchEvent(new CustomEvent(CHECKLIST_RENDER_EVENT));
    return before;
}

/**
 * Every group in the order its first item comes, each with its rows; rows and groups that are gone are removed.
 * @param {HTMLElement} list @param {HTMLElement} body @param {ChecklistItem[]} items @param {Map<string, HTMLElement>} rows @param {Strings} strings
 */
function renderGroups(list, body, items, rows, strings) {
    /** @type {Map<string, HTMLElement>} */
    const sections = new Map();
    for (const section of /** @type {NodeListOf<HTMLElement>} */ (body.querySelectorAll(':scope > .kp-checklist__group'))) {
        sections.set(section.getAttribute('data-group') ?? '', section);
    }
    const level = Math.min(HEADING_MAX, Math.max(HEADING_MIN, Number(list.getAttribute('data-kp-checklist-heading')) || HEADING_LEVEL));
    /** @type {HTMLElement | null} */
    let previous = null;
    for (const [key, members] of groupsOf(items)) {
        const section = sections.get(key) ?? newSection(key, level);
        sections.delete(key);
        const done = members.filter((i) => i.checked).length;
        const title = section.querySelector('.kp-checklist__title');
        if (title) title.textContent = key;
        const count = section.querySelector('.kp-checklist__count');
        if (count) count.textContent = strings.checklistCount(done, members.length);
        section.toggleAttribute('data-kp-checklist-done', done === members.length);
        placeRows(list, /** @type {HTMLElement} */ (section.querySelector('.kp-checklist__list')), members, rows);
        const placeAfter = /** @type {Element | null} */ (previous ? previous.nextElementSibling : body.firstElementChild);
        if (section !== placeAfter) {
            if (previous) previous.after(section);
            else body.prepend(section);
        }
        previous = section;
    }
    for (const gone of rows.values()) gone.remove();
    for (const gone of sections.values()) gone.remove();
}

/** A group's section: a heading with its title and count when the group has a name, and its list. @param {string} key @param {number} level */
function newSection(key, level) {
    const section = el('kp-checklist__group', 'section');
    section.setAttribute('data-group', key);
    if (key) {
        const head = el('kp-checklist__head', `h${level}`);
        head.id = `kp-checklist-${nextSerial()}-head`;
        head.append(el('kp-checklist__title', 'span'), el('kp-checklist__count', 'span'));
        section.append(head);
        section.setAttribute('aria-labelledby', head.id);
    }
    section.append(el('kp-checklist__list', 'ul'));
    return section;
}

/**
 * A group's rows in their shown order, each built or updated in place and moved only when it is out of place.
 * @param {HTMLElement} list @param {HTMLElement} ul @param {ChecklistItem[]} members @param {Map<string, HTMLElement>} rows
 */
function placeRows(list, ul, members, rows) {
    /** @type {HTMLElement | null} */
    let last = null;
    for (const item of shownOrder(list, members)) {
        const row = rowFor(rows.get(item.id) ?? null, item);
        rows.delete(item.id);
        const expected = /** @type {Element | null} */ (last ? last.nextElementSibling : ul.firstElementChild);
        if (row !== expected) {
            // Moving a focused element blurs it; it is given the focus back.
            const focused = row.contains(document.activeElement) ? /** @type {HTMLElement} */ (document.activeElement) : null;
            if (last) last.after(row);
            else ul.prepend(row);
            focused?.focus({ preventScroll: true });
        }
        last = row;
    }
}

/** The bar: the summary (unless an Undo is on offer) and the buttons, resting when nothing can change. @param {HTMLElement} list @param {ChecklistItem[]} items @param {Strings} strings */
function renderBar(list, items, strings) {
    const total = items.length;
    const done = items.filter((i) => i.checked).length;
    // The rows are hidden while the list has failed (css/components.css); the buttons that act on them rest too.
    const rest = list.hasAttribute('aria-busy') || list.hasAttribute('data-kp-checklist-error');
    const bar = part(list, 'bar');
    const said = /** @type {HTMLElement} */ (bar.querySelector('.kp-checklist__said'));
    if (!UNDO.has(list)) said.textContent = total ? strings.checklistSummary(done, total) : '';
    const button = (/** @type {string} */ name) => /** @type {HTMLButtonElement} */ (bar.querySelector(`.kp-checklist__${name}`));
    const all = button('all');
    all.textContent = strings.checklistCheckAll;
    all.disabled = total === 0 || done === total || rest;
    const none = button('none');
    none.textContent = strings.checklistUncheckAll;
    none.disabled = done === 0 || rest;
    const clear = button('clear');
    clear.textContent = strings.checklistClear;
    clear.disabled = done === 0 || rest;
    button('undo').textContent = strings.checklistUndo;
}

/**
 * The empty line: an error's message, else the empty sentence when there is nothing.
 * @param {HTMLElement} list @param {HTMLElement} body @param {number} total @param {Strings} strings
 */
function renderEmpty(list, body, total, strings) {
    const empty = part(list, 'empty');
    const error = list.getAttribute('data-kp-checklist-error');
    // A list without items is the state `empty`, written like every other data component's, so the footprint (js/footprint.js)
    // holds the height the list had [t56-statefix-1018]; `loading` and `error` are the page's to set and stay as they are.
    const shown = list.getAttribute('data-kp-state');
    if (shown === null || shown === 'ready' || shown === 'empty') {
        if (total === 0) list.setAttribute('data-kp-state', 'empty');
        else if (shown === 'empty') list.setAttribute('data-kp-state', 'ready');
    }
    // Empty and failed are the package's state plate, the empty line itself being the plate (the themes dress it by that class),
    // with a Retry on a failure: the event `kp-checklist-retry` on the list [r6r8-1019; audhd-recepten gap 29].
    const title = error ?? list.getAttribute('data-kp-checklist-empty') ?? strings.checklistEmpty;
    const plateKey = `${error !== null ? 'error' : 'empty'}|${title}`;
    if (PLATE.get(empty) !== plateKey) {
        PLATE.set(empty, plateKey);
        hostStatePlate(list, { kind: error !== null ? 'error' : 'empty', title, retryEvent: CHECKLIST_RETRY_EVENT, into: empty });
    }
    empty.hidden = !(error !== null || (total === 0 && !list.hasAttribute('aria-busy')));
    empty.toggleAttribute('data-kp-checklist-failed', error !== null);
    body.append(empty);
}

/**
 * Let the rows that moved glide from where they stood to where they stand, in the theme's size time and on its curve;
 * nothing under reduced motion.
 * @param {HTMLElement} list @param {Map<string, DOMRect>} before
 */
export async function glide(list, before) {
    if (!motionAllowed()) return;
    const { themeMotion } = await import('../motion.js');
    const { size, ease } = themeMotion(list);
    if (size <= 0) return;
    for (const row of /** @type {NodeListOf<HTMLElement>} */ (list.querySelectorAll('.kp-checklist__item'))) {
        const was = before.get(row.getAttribute('data-id') ?? '');
        if (!was) continue;
        const dy = was.top - row.getBoundingClientRect().top;
        if (Math.abs(dy) < GLIDE_MIN_PX) continue;
        // Longer rides take a little longer, up to twice the theme's time, so a far sink is still followed by the eye.
        const duration = Math.min(size * 2, size + Math.abs(dy) * GLIDE_MS_PER_PX);
        row.animate([{ translate: `0 ${dy}px` }, { translate: '0 0' }], { duration, easing: ease });
    }
}
