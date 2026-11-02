// Drawing one task row from the package's parts: the reorder handle, the field's check box, the title as a button, the facts line,
// and the action columns (icon buttons and a menu button with its rich menu).

import { attachMenuButtons, setMenu } from '../menu-button.js';
import { resolveStrings } from '../strings.js';
import { factNode } from './facts.js';

/** Fired on the row, bubbling, when its box is ticked or unticked: `{ key, done }`. */
export const TASK_TOGGLE_EVENT = 'kp-task-toggle';
/** Fired on the row, bubbling, when its title is pressed: `{ key, source }`. */
export const TASK_OPEN_EVENT = 'kp-task-open';

/** @typedef {import('./facts.js').TaskFact} TaskFact */
/** @typedef {import('../menu-button.js').MenuGroup} MenuGroup */

/**
 * One task as a row.
 * @typedef {object} TaskRowSpec
 * @property {string} key the task's id: `data-kp-row-key` (row picking) and `data-kp-item` (a reorder list)
 * @property {string} title
 * @property {boolean} [done]
 * @property {'high' | 'medium' | 'low' | 'none'} [priority] high and medium draw an edge in the warning or destructive colour
 * @property {(TaskFact | string | Node)[]} [facts] the line under the title
 * @property {HTMLElement[]} [actions] the page's icon buttons, each in a fixed column (a timer), before the menu
 * @property {MenuGroup[]} [menu] the ⋯ menu's entries; the row's context menu (right click, long press) shows the same
 * @property {boolean} [handle] a drag handle in the first column (the row is then an item of a reorder list); default true
 */

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {Document} doc @param {K} tag @param {string} className @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
const make = (doc, tag, className, text) => {
    const el = doc.createElement(tag);
    el.className = className;
    if (text != null) el.textContent = text;
    return el;
};

/** The first column: the reorder handle, or its empty place so every row keeps its columns. @param {Document} doc @param {TaskRowSpec} spec @param {import('../strings.js').Strings} s */
function handleCell(doc, spec, s) {
    if (spec.handle === false) {
        const place = make(doc, 'span', 'kp-task-row__handle');
        place.setAttribute('aria-hidden', 'true');
        return place;
    }
    const handle = make(doc, 'button', 'kp-icon-button kp-task-row__handle', '⠿');
    handle.type = 'button';
    handle.dataset.kpHandle = '';
    handle.setAttribute('aria-label', s.taskRowMove(spec.title));
    return handle;
}

/** The check: the field's box inside a label as large as the row's icon buttons (the touch target). @param {Document} doc @param {TaskRowSpec} spec @param {import('../strings.js').Strings} s */
function checkCell(doc, spec, s) {
    const hit = make(doc, 'label', 'kp-task-row__hit');
    const box = make(doc, 'input', 'kp-field__check kp-task-row__check');
    box.type = 'checkbox';
    box.checked = spec.done === true;
    box.setAttribute('aria-label', spec.done ? s.taskRowReopen(spec.title) : s.taskRowDone(spec.title));
    hit.append(box);
    return hit;
}

/** The actions: the page's buttons, then the ⋯ menu, each in a column of its own. @param {Document} doc @param {TaskRowSpec} spec @param {import('../strings.js').Strings} s */
function actionsCell(doc, spec, s) {
    const cell = make(doc, 'div', 'kp-task-row__actions');
    for (const action of spec.actions ?? []) {
        action.classList.add('kp-task-row__action');
        cell.append(action);
    }
    if (spec.menu?.length) {
        const wrapper = make(doc, 'div', 'kp-menu-button kp-task-row__more');
        wrapper.dataset.kpMenuButton = '';
        const button = make(doc, 'button', 'kp-icon-button', '⋯');
        button.type = 'button';
        button.setAttribute('aria-label', s.taskRowMore(spec.title));
        const menu = make(doc, 'div', 'kp-menu kp-menu--rich');
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', s.taskRowMore(spec.title));
        wrapper.append(button, menu);
        setMenu(wrapper, spec.menu);
        cell.append(wrapper);
    }
    return cell;
}

/**
 * Draw a task row. Its events bubble from the row: `kp-task-toggle` `{ key, done }` when the box is ticked or unticked,
 * `kp-task-open` `{ key, source }` when the title is pressed; a pick in its ⋯ menu or its context menu is the menu button's
 * `kp-menu-select` `{ item, value }`.
 * @param {Document} doc
 * @param {TaskRowSpec} spec
 * @param {{ tag?: 'li' | 'div', strings?: Partial<import('../strings.js').Strings> }} [options]
 * @returns {HTMLElement}
 */
export function buildTaskRow(doc, spec, { tag = 'li', strings } = {}) {
    const s = resolveStrings(strings);
    const row = make(doc, tag, 'kp-task-row');
    row.dataset.kpRowKey = spec.key;
    row.dataset.kpLabel = spec.title;
    if (spec.handle !== false) row.dataset.kpItem = spec.key;
    if (spec.done) row.dataset.kpDone = '';
    if (spec.priority && spec.priority !== 'none') row.dataset.kpPriority = spec.priority;
    row.tabIndex = -1;
    const title = make(doc, 'button', 'kp-task-row__title', spec.title);
    title.type = 'button';
    const facts = make(doc, 'div', 'kp-task-row__facts');
    for (const fact of spec.facts ?? []) facts.append(factNode(doc, fact));
    row.append(handleCell(doc, spec, s), checkCell(doc, spec, s), title, facts, actionsCell(doc, spec, s));
    if (spec.menu?.length) row.setAttribute('data-kp-context-menu', 'inner');
    wireRow(row, spec, s);
    attachMenuButtons(row);
    return row;
}

/** The row's own events: the tick and the open. @param {HTMLElement} row @param {TaskRowSpec} spec @param {import('../strings.js').Strings} s */
function wireRow(row, spec, s) {
    const box = /** @type {HTMLInputElement} */ (row.querySelector('.kp-task-row__check'));
    box.addEventListener('change', () => {
        row.toggleAttribute('data-kp-done', box.checked);
        box.setAttribute('aria-label', box.checked ? s.taskRowReopen(spec.title) : s.taskRowDone(spec.title));
        row.dispatchEvent(new CustomEvent(TASK_TOGGLE_EVENT, { bubbles: true, detail: { key: spec.key, done: box.checked } }));
    });
    row.querySelector('.kp-task-row__title')?.addEventListener('click', (event) => {
        const source = /** @type {MouseEvent} */ (event).detail === 0 ? 'keyboard' : 'pointer';
        row.dispatchEvent(new CustomEvent(TASK_OPEN_EVENT, { bubbles: true, detail: { key: spec.key, source } }));
    });
}
