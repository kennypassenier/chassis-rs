// A checklist: tick items off, the ticked ones sink [kpadopt4; the AuDHD recipe app's shopping list].
//
// A list a person works down: a shopping list by shop, a packing list, the
// steps of a chore. What is still to do stays on top; what is done sinks to
// the end of its group, struck through, so the eye only ever looks at the top.
//
//   <div class="kp-checklist" data-kp-checklist aria-label="Shopping list"></div>
//
//   setChecklistItems(list, [{ id: 'milk', label: 'Milk', detail: '2 l', group: 'Colruyt' }, …]);
//   list.addEventListener('kp-checklist-change', (e) => save(e.detail.items));
//
// Parts, made by the module: a bar (`__bar`) with the count of what is done
// and Check all, Uncheck all and Clear checked; a body (`__body`) of groups (`__group`,
// with a heading `__head` holding `__title` and `__count`, "4 of 9") and
// rows (`__item` > `label.__row` > a real checkbox `__check`, `__label`,
// `__detail`); an empty line (`__empty`) and a status region (`__live`).
//
// What it does:
//   - The whole row is the checkbox's label, so a tap anywhere on it ticks it.
//   - A ticked item sinks to the end of its group (`data-kp-checklist-sink`
//     "false" keeps it where it stands, struck through). The move glides in
//     the theme's own size time and curve (js/motion.js), so the eye sees
//     where it went; under reduced motion it moves at once. Ticking it again
//     brings it back to its own place among the open ones.
//   - Ticked with the keyboard, the focus goes to the open item that took its
//     place, so a person can tick down the list with Space and the arrows
//     never jump; ticked with a pointer, the focus stays on the item.
//   - Clear checked takes the ticked items away and, for a while
//     (`data-kp-checklist-undo-ms`, 6000), offers Undo in the bar's own line,
//     in place of the count, so nothing moves.
//   - Nothing is stored: every change is an event with the whole list, so the
//     page saves it (offline first, synchronised later) as it likes.
//
// States: `setChecklistState(list, 'loading' | 'error' | 'ready', message)`:
// loading lays the data table's busy card over the body (js/busy-card.js),
// error says the message on the failed plate with a Retry in the empty line's place; an empty list says
// `data-kp-checklist-empty` (or the dictionary's sentence) on the empty plate. Both are js/state-plate.js.
//
// Events (bubbling, on the list):
//   kp-checklist-change   { id, checked, items }   a tick, Check all or Uncheck all (id null)
//   kp-checklist-clear    { removed, items }       Clear checked
//   kp-checklist-undo     { restored, items }      Undo after a clear
//   kp-checklist-retry    {}                       the Retry of the failed state
//
// Every word it adds is in js/strings.js. Nothing runs on import.

import { getStrings } from './strings.js';
import { openBusyCard } from './busy-card.js';
import { hostStatePlate } from './state-plate.js';
import { motionAllowed } from './calm.js';

/** The lists this module looks after. */
export const CHECKLIST = '[data-kp-checklist]';
/** Fired on a tick: `{ id, checked, items }`. */
export const CHECKLIST_EVENT = 'kp-checklist-change';
/** Fired on Clear checked: `{ removed, items }`. */
export const CHECKLIST_CLEAR_EVENT = 'kp-checklist-clear';
/** Fired on Undo: `{ restored, items }`. */
export const CHECKLIST_UNDO_EVENT = 'kp-checklist-undo';
/** Fired on the list, bubbling, when the Retry of its failed state is pressed [r6r8-1019]. */
export const CHECKLIST_RETRY_EVENT = 'kp-checklist-retry';
/** Fired on the list (not bubbling) after every draw, so a part that adds to the rows can draw its cells [kpadopt6]. */
export const CHECKLIST_RENDER_EVENT = 'kp-checklist-render';
/** How long Undo is offered after a clear, unless the list says otherwise [ms]. */
export const CHECKLIST_UNDO_MS = 6000;

/**
 * @typedef {object} ChecklistItem
 * @property {string} id
 * @property {string} label
 * @property {string} [detail]  the amount or a note, after the label ("3 pieces")
 * @property {string} [group]  a shop or a section; items without one share a group without a heading
 * @property {boolean} [checked]
 * @property {import('./claim.js').ClaimInfo} [claim]  who brings it (js/claim.js, `data-kp-checklist-claim`) [kpadopt6]
 */

/** @typedef {{ removed: ChecklistItem[], at: Map<string, number>, timer: ReturnType<typeof setTimeout> }} Undo */

/** Per list: the items in their own order (the order they were given in). @type {WeakMap<Element, ChecklistItem[]>} */
const ITEMS = new WeakMap();
/** Per list: the Undo on offer. @type {WeakMap<Element, Undo>} */
const UNDO = new WeakMap();
/** Per empty line: the plate drawn in it (its kind and words), so a draw that changes nothing leaves it alone. @type {WeakMap<Element, string>} */
const PLATE = new WeakMap();
/** Per list: the busy card while loading. @type {WeakMap<Element, import('./busy-card.js').BusyCard>} */
const BUSY = new WeakMap();
/** Lists already wired. @type {WeakSet<Element>} */
const WIRED = new WeakSet();

let serial = 0;

/** @param {string} className @param {string} [tag] */
const el = (className, tag = 'div') => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};

/** @param {Element} list */
const sinks = (list) => list.getAttribute('data-kp-checklist-sink') !== 'false';

/** @param {Element} list @returns {ChecklistItem[]} */
export function getChecklistItems(list) {
    return (ITEMS.get(list) ?? []).map((item) => ({ ...item }));
}

/** @param {Element} list @param {string} name @returns {HTMLElement} */
function part(list, name) {
    let node = /** @type {HTMLElement | null} */ (
        list.querySelector(`:scope > .kp-checklist__${name}, :scope > .kp-checklist__body > .kp-checklist__${name}`)
    );
    if (node) return node;
    if (name === 'bar') {
        node = el('kp-checklist__bar');
        const status = el('kp-checklist__status');
        const said = el('kp-checklist__said', 'span');
        const undo = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--sm kp-checklist__undo', 'button'));
        undo.type = 'button';
        undo.hidden = true;
        status.append(said, undo);
        const actions = el('kp-checklist__actions');
        const all = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--ghost kp-button--sm kp-checklist__all', 'button'));
        all.type = 'button';
        const none = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--ghost kp-button--sm kp-checklist__none', 'button'));
        none.type = 'button';
        const clear = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--ghost kp-button--sm kp-checklist__clear', 'button'));
        clear.type = 'button';
        actions.append(all, none, clear);
        node.append(status, actions);
        list.prepend(node);
    } else if (name === 'body') {
        node = el('kp-checklist__body');
        part(list, 'bar').after(node);
    } else if (name === 'live') {
        node = el('kp-sr-only kp-checklist__live', 'span');
        node.setAttribute('role', 'status');
        list.append(node);
    } else {
        // The empty line is a plate (it holds a heading and a Retry), so a div, not a paragraph [r6r8-1019].
        node = el(`kp-checklist__${name}`, 'div');
        part(list, 'body').append(node);
    }
    return node;
}

/** @param {Element} list @param {string} message */
function say(list, message) {
    const region = part(list, 'live');
    region.textContent = '';
    setTimeout(() => (region.textContent = message), 60);
}

/** The groups in the order their first item comes. @param {ChecklistItem[]} items */
function groupsOf(items) {
    /** @type {Map<string, ChecklistItem[]>} */
    const groups = new Map();
    for (const item of items) {
        const key = item.group ?? '';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)?.push(item);
    }
    return groups;
}

/**
 * The order a group shows its items in: the open ones in their own order, then
 * the ticked ones in their own order (when the list sinks).
 * @param {Element} list @param {ChecklistItem[]} items
 */
const shownOrder = (list, items) => (sinks(list) ? [...items.filter((i) => !i.checked), ...items.filter((i) => i.checked)] : items);

/**
 * Build or update one row in place.
 * @param {HTMLElement | null} row @param {ChecklistItem} item
 * @returns {HTMLElement}
 */
function rowFor(row, item) {
    if (!row) {
        row = el('kp-checklist__item', 'li');
        const label = el('kp-checklist__row', 'label');
        const check = /** @type {HTMLInputElement} */ (el('kp-field__check kp-checklist__check', 'input'));
        check.type = 'checkbox';
        serial += 1;
        const text = el('kp-checklist__label', 'span');
        text.id = `kp-checklist-${serial}-label`;
        const detail = el('kp-checklist__detail', 'span');
        detail.id = `kp-checklist-${serial}-detail`;
        check.setAttribute('aria-labelledby', text.id);
        label.append(check, text, detail);
        row.append(label);
    }
    row.setAttribute('data-id', item.id);
    row.toggleAttribute('data-kp-checklist-checked', Boolean(item.checked));
    const check = /** @type {HTMLInputElement} */ (row.querySelector('.kp-checklist__check'));
    check.checked = Boolean(item.checked);
    const text = /** @type {HTMLElement} */ (row.querySelector('.kp-checklist__label'));
    if (text.textContent !== item.label) text.textContent = item.label;
    const detail = /** @type {HTMLElement} */ (row.querySelector('.kp-checklist__detail'));
    detail.textContent = item.detail ?? '';
    detail.hidden = !item.detail;
    if (item.detail) check.setAttribute('aria-describedby', detail.id);
    else check.removeAttribute('aria-describedby');
    return row;
}

/**
 * Draw the list from its items, changing what is there in place: a row keeps
 * its element (and its focus) whatever moves around it. Returns the rows'
 * places before the change, for the glide.
 * @param {HTMLElement} list
 * @returns {Map<string, DOMRect>}
 */
function render(list) {
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
    /** @type {Map<string, HTMLElement>} */
    const sections = new Map();
    for (const section of /** @type {NodeListOf<HTMLElement>} */ (body.querySelectorAll(':scope > .kp-checklist__group'))) {
        sections.set(section.getAttribute('data-group') ?? '', section);
    }
    const level = Math.min(6, Math.max(2, Number(list.getAttribute('data-kp-checklist-heading')) || 3));
    /** @type {HTMLElement | null} */
    let previous = null;
    for (const [key, members] of groupsOf(items)) {
        let section = sections.get(key) ?? null;
        sections.delete(key);
        if (!section) {
            section = el('kp-checklist__group', 'section');
            section.setAttribute('data-group', key);
            if (key) {
                const head = el('kp-checklist__head', `h${level}`);
                serial += 1;
                head.id = `kp-checklist-${serial}-head`;
                head.append(el('kp-checklist__title', 'span'), el('kp-checklist__count', 'span'));
                section.append(head);
                section.setAttribute('aria-labelledby', head.id);
            }
            section.append(el('kp-checklist__list', 'ul'));
        }
        const done = members.filter((i) => i.checked).length;
        const title = section.querySelector('.kp-checklist__title');
        if (title) title.textContent = key;
        const count = section.querySelector('.kp-checklist__count');
        if (count) count.textContent = strings.checklistCount(done, members.length);
        section.toggleAttribute('data-kp-checklist-done', done === members.length);
        const ul = /** @type {HTMLElement} */ (section.querySelector('.kp-checklist__list'));
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
        const placeAfter = /** @type {Element | null} */ (previous ? previous.nextElementSibling : body.firstElementChild);
        if (section !== placeAfter) {
            if (previous) previous.after(section);
            else body.prepend(section);
        }
        previous = section;
    }
    for (const gone of rows.values()) gone.remove();
    for (const gone of sections.values()) gone.remove();
    // The bar.
    const total = items.length;
    const done = items.filter((i) => i.checked).length;
    // The rows are hidden while the list has failed (css/components.css); the buttons that act on them rest too.
    const rest = list.hasAttribute('aria-busy') || list.hasAttribute('data-kp-checklist-error');
    const bar = part(list, 'bar');
    const said = /** @type {HTMLElement} */ (bar.querySelector('.kp-checklist__said'));
    if (!UNDO.has(list)) said.textContent = total ? strings.checklistSummary(done, total) : '';
    const all = /** @type {HTMLButtonElement} */ (bar.querySelector('.kp-checklist__all'));
    all.textContent = strings.checklistCheckAll;
    all.disabled = total === 0 || done === total || rest;
    const none = /** @type {HTMLButtonElement} */ (bar.querySelector('.kp-checklist__none'));
    none.textContent = strings.checklistUncheckAll;
    none.disabled = done === 0 || rest;
    const clear = /** @type {HTMLButtonElement} */ (bar.querySelector('.kp-checklist__clear'));
    clear.textContent = strings.checklistClear;
    clear.disabled = done === 0 || rest;
    const undo = /** @type {HTMLButtonElement} */ (bar.querySelector('.kp-checklist__undo'));
    undo.textContent = strings.checklistUndo;
    // The empty line: an error's message, else the empty sentence when there is nothing.
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
    // A part that adds to the rows (js/claim.js) draws its own cells once the rows stand [kpadopt6].
    list.dispatchEvent(new CustomEvent(CHECKLIST_RENDER_EVENT));
    return before;
}

/**
 * Let the rows that moved glide from where they stood to where they stand,
 * in the theme's size time and on its curve; nothing under reduced motion.
 * @param {HTMLElement} list @param {Map<string, DOMRect>} before
 */
async function glide(list, before) {
    if (!motionAllowed()) return;
    const { themeMotion } = await import('./motion.js');
    const { size, ease } = themeMotion(list);
    if (size <= 0) return;
    for (const row of /** @type {NodeListOf<HTMLElement>} */ (list.querySelectorAll('.kp-checklist__item'))) {
        const was = before.get(row.getAttribute('data-id') ?? '');
        if (!was) continue;
        const now = row.getBoundingClientRect();
        const dy = was.top - now.top;
        if (Math.abs(dy) < 1) continue;
        // Longer rides take a little longer, up to twice the theme's time, so a far sink is still followed by the eye.
        const duration = Math.min(size * 2, size + Math.abs(dy) * 0.6);
        row.animate([{ translate: `0 ${dy}px` }, { translate: '0 0' }], { duration, easing: ease });
    }
}

/**
 * Give a list its items, changing the rows in place (by id).
 * @param {Element} list
 * @param {ChecklistItem[]} items
 */
export function setChecklistItems(list, items) {
    if (!(list instanceof HTMLElement)) return;
    ITEMS.set(
        list,
        items.map((item) => ({ ...item, checked: Boolean(item.checked) })),
    );
    render(list);
}

/**
 * Tick or untick one item as the page (no event).
 * @param {Element} list @param {string} id @param {boolean} checked
 */
export function setChecklistChecked(list, id, checked) {
    if (!(list instanceof HTMLElement)) return;
    const item = (ITEMS.get(list) ?? []).find((i) => i.id === id);
    if (!item) return;
    item.checked = checked;
    void glide(list, render(list));
}

/**
 * The list's state: `loading` lays the busy card over the body (and keeps it
 * at its height), `error` says `message` where the rows were, `ready` is
 * neither.
 * @param {Element} list @param {'loading' | 'error' | 'ready'} state @param {string} [message]
 */
export function setChecklistState(list, state, message) {
    if (!(list instanceof HTMLElement)) return;
    list.setAttribute('data-kp-state', state);
    if (state === 'error') list.setAttribute('data-kp-checklist-error', message ?? getStrings().checklistFailed);
    else list.removeAttribute('data-kp-checklist-error');
    const body = part(list, 'body');
    const card = BUSY.get(list);
    if (state === 'loading') {
        list.setAttribute('aria-busy', 'true');
        if (!card) {
            BUSY.set(
                list,
                openBusyCard(body, { words: message ?? getStrings().checklistLoading, area: () => [body], className: 'kp-checklist__busy' }),
            );
        }
    } else {
        list.removeAttribute('aria-busy');
        if (card) {
            BUSY.delete(list);
            void card.close();
        }
    }
    render(list);
}

/** @param {HTMLElement} list @param {string} type @param {object} detail */
const emit = (list, type, detail) =>
    list.dispatchEvent(new CustomEvent(type, { bubbles: true, detail: { ...detail, items: getChecklistItems(list) } }));

/** End the Undo on offer, if any. @param {HTMLElement} list */
function endUndo(list) {
    const undo = UNDO.get(list);
    if (!undo) return;
    clearTimeout(undo.timer);
    UNDO.delete(list);
    const button = /** @type {HTMLButtonElement} */ (part(list, 'bar').querySelector('.kp-checklist__undo'));
    const hadFocus = button === document.activeElement;
    button.hidden = true;
    render(list);
    if (hadFocus)
        /** @type {HTMLElement | null} */ (
            part(list, 'bar').querySelector('.kp-checklist__clear:not(:disabled), .kp-checklist__none:not(:disabled), .kp-checklist__all:not(:disabled)')
        )?.focus();
}

/**
 * Wire every checklist under `root`: the ticks, Check all, Clear checked and
 * its Undo. Items come from setChecklistItems().
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachChecklists(root = document) {
    const lists = /** @type {HTMLElement[]} */ ([
        ...(root instanceof HTMLElement && root.matches(CHECKLIST) ? [root] : []),
        ...root.querySelectorAll(CHECKLIST),
    ]);
    /** @type {(() => void)[]} */
    const undo = [];
    for (const list of lists) {
        if (WIRED.has(list)) continue;
        WIRED.add(list);
        if (!ITEMS.has(list)) ITEMS.set(list, []);
        render(list);
        /** Whether the last press on a row came from a key. */
        let byKey = false;
        /** @param {KeyboardEvent} event */
        const key = (event) => {
            byKey = event.key === ' ' || event.key === 'Enter';
        };
        const pointer = () => {
            byKey = false;
        };
        /** @param {Event} event */
        const change = (event) => {
            const check = event.target instanceof HTMLInputElement && event.target.classList.contains('kp-checklist__check') ? event.target : null;
            const row = check?.closest('.kp-checklist__item');
            if (!check || !row || !list.contains(row)) return;
            const id = row.getAttribute('data-id') ?? '';
            const items = ITEMS.get(list) ?? [];
            const item = items.find((i) => i.id === id);
            if (!item) return;
            const group = items.filter((i) => (i.group ?? '') === (item.group ?? ''));
            const placeBefore = shownOrder(list, group).indexOf(item);
            item.checked = check.checked;
            const before = render(list);
            void glide(list, before);
            const strings = getStrings();
            if (byKey && check.checked && sinks(list)) {
                // The open item that took its place gets the focus, so Space can go on down the list.
                const next = shownOrder(list, group)[placeBefore];
                const target =
                    next && !next.checked ? list.querySelector(`.kp-checklist__item[data-id="${CSS.escape(next.id)}"] .kp-checklist__check`) : null;
                if (target instanceof HTMLElement) target.focus();
                say(list, strings.checklistDoneMoved(item.label));
            } else {
                say(list, check.checked ? strings.checklistDone(item.label) : strings.checklistOpen(item.label));
            }
            emit(list, CHECKLIST_EVENT, { id, checked: check.checked });
        };
        /** @param {MouseEvent} event */
        const click = (event) => {
            const target = event.target instanceof Element ? event.target : null;
            if (!target) return;
            const items = ITEMS.get(list) ?? [];
            const strings = getStrings();
            if (target.closest('.kp-checklist__all')) {
                for (const item of items) item.checked = true;
                void glide(list, render(list));
                // The pressed button is dimmed now (everything is ticked): the focus goes to its opposite, not to the page's top.
                if (document.activeElement === document.body || target.closest('.kp-checklist__all')?.matches(':disabled'))
                    /** @type {HTMLElement | null} */ (part(list, 'bar').querySelector('.kp-checklist__none:not(:disabled)'))?.focus();
                say(list, strings.checklistSummary(items.length, items.length));
                emit(list, CHECKLIST_EVENT, { id: null, checked: true });
            } else if (target.closest('.kp-checklist__none')) {
                if (!items.some((item) => item.checked)) return;
                for (const item of items) item.checked = false;
                void glide(list, render(list));
                if (document.activeElement === document.body || target.closest('.kp-checklist__none')?.matches(':disabled'))
                    /** @type {HTMLElement | null} */ (part(list, 'bar').querySelector('.kp-checklist__all:not(:disabled)'))?.focus();
                say(list, strings.checklistSummary(0, items.length));
                emit(list, CHECKLIST_EVENT, { id: null, checked: false });
            } else if (target.closest('.kp-checklist__clear')) {
                const removed = items.filter((i) => i.checked);
                if (!removed.length) return;
                endUndo(list);
                /** @type {Map<string, number>} */
                const at = new Map(removed.map((item) => [item.id, items.indexOf(item)]));
                ITEMS.set(
                    list,
                    items.filter((i) => !i.checked),
                );
                const ms = Number(list.getAttribute('data-kp-checklist-undo-ms')) || CHECKLIST_UNDO_MS;
                UNDO.set(list, { removed, at, timer: setTimeout(() => endUndo(list), ms) });
                const bar = part(list, 'bar');
                /** @type {HTMLElement} */ (bar.querySelector('.kp-checklist__said')).textContent = strings.checklistCleared(removed.length);
                const button = /** @type {HTMLButtonElement} */ (bar.querySelector('.kp-checklist__undo'));
                button.hidden = false;
                render(list);
                button.focus();
                say(list, strings.checklistCleared(removed.length));
                emit(list, CHECKLIST_CLEAR_EVENT, { removed: removed.map((i) => ({ ...i })) });
            } else if (target.closest('.kp-checklist__undo')) {
                const offer = UNDO.get(list);
                if (!offer) return;
                const restored = [...items];
                for (const item of offer.removed) restored.splice(Math.min(offer.at.get(item.id) ?? restored.length, restored.length), 0, item);
                ITEMS.set(list, restored);
                endUndo(list);
                say(list, strings.checklistRestored(offer.removed.length));
                emit(list, CHECKLIST_UNDO_EVENT, { restored: offer.removed.map((i) => ({ ...i })) });
            }
        };
        list.addEventListener('keydown', key, true);
        list.addEventListener('pointerdown', pointer, true);
        list.addEventListener('change', change);
        list.addEventListener('click', click);
        undo.push(() => {
            WIRED.delete(list);
            list.removeEventListener('keydown', key, true);
            list.removeEventListener('pointerdown', pointer, true);
            list.removeEventListener('change', change);
            list.removeEventListener('click', click);
        });
    }
    return () => undo.forEach((u) => u());
}
