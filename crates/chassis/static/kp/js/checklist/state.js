// The checklist's model, kept per list element: its items, the Undo on offer, the plate in its empty line and its busy
// card. It is a registry and not controller state on purpose: a page may give a list its items (setChecklistItems) before
// or without wiring it, and the items outlive a detach.

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


/** @typedef {import('../checklist.js').ChecklistItem} ChecklistItem */
/** @typedef {{ removed: ChecklistItem[], at: Map<string, number>, timer: ReturnType<typeof setTimeout> }} Undo */

/** Per list: the items in their own order (the order they were given in). @type {WeakMap<Element, ChecklistItem[]>} */
export const ITEMS = new WeakMap();
/** Per list: the Undo on offer. @type {WeakMap<Element, Undo>} */
export const UNDO = new WeakMap();
/** Per empty line: the plate drawn in it (its kind and words), so a draw that changes nothing leaves it alone. @type {WeakMap<Element, string>} */
export const PLATE = new WeakMap();
/** Per list: the busy card while loading. @type {WeakMap<Element, import('../busy-card.js').BusyCard>} */
export const BUSY = new WeakMap();
/** Numbers the ids of rows and group headings, page-wide. */
let serial = 0;
/** The next id number. */
export const nextSerial = () => (serial += 1);

/** Whether ticked items sink to the end of their group (`data-kp-checklist-sink`, on by default). @param {Element} list */
export const sinks = (list) => list.getAttribute('data-kp-checklist-sink') !== 'false';

/** @param {Element} list @returns {ChecklistItem[]} */
export function getChecklistItems(list) {
    return (ITEMS.get(list) ?? []).map((item) => ({ ...item }));
}
