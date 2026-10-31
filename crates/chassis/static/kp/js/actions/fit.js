// Laying one list's or table's button boxes on shared columns: naming each button's column, and measuring a table's widths.

import { mergeRoles, rowRoles } from './roles.js';
import { ACTION_LIST, ROW_ACTIONS } from './values.js';

/** The custom properties the fit writes on a list or table. */
const LIST_PROPERTIES = ['--kp-action-count', '--kp-action-widths', '--kp-action-stack'];

/**
 * The visible buttons of each row of the list, in row order.
 * @param {HTMLElement} list
 */
function buttonRows(list) {
    const boxes = /** @type {HTMLElement[]} */ ([...list.querySelectorAll(ROW_ACTIONS)]).filter((box) => box.closest(ACTION_LIST) === list);
    return boxes.map((box) => /** @type {HTMLElement[]} */ ([...box.children]).filter((child) => !child.hidden));
}

/** Every button at its own size first, then the widest per role; the widths go on the table. @param {HTMLElement} list @param {HTMLElement[][]} rows @param {string[][]} roles @param {string[]} order */
function writeTableWidths(list, rows, roles, order) {
    list.dataset.kpActionMeasuring = '';
    const widths = order.map(() => 0);
    rows.forEach((row, r) =>
        row.forEach((button, b) => {
            const k = order.indexOf(roles[r][b]);
            // Its margins count: a register that sets its buttons off
            // with one (the removed Sepia register's marginal bracket) would otherwise squeeze
            // the label into the button's padding [action-columns-narrow-M1].
            const style = getComputedStyle(button);
            const margins = (parseFloat(style.marginInlineStart) || 0) + (parseFloat(style.marginInlineEnd) || 0);
            widths[k] = Math.max(widths[k], button.getBoundingClientRect().width + margins);
        }),
    );
    delete list.dataset.kpActionMeasuring;
    list.style.setProperty('--kp-action-widths', widths.map((w) => `${Math.ceil(w)}px`).join(' '));
    list.style.setProperty('--kp-action-stack', `${Math.ceil(Math.max(...widths))}px`);
}

/**
 * Lay one list's or table's button boxes on shared columns.
 *
 * A list (`.kp-action-list`) is a CSS subgrid, so the browser sizes the
 * columns; this only names each button's column and the list's count, and
 * only when a button carries a role (by position the stylesheet needs no
 * help). A table cannot be a subgrid: there each role's widest button is
 * measured and the widths are written on the table.
 * @param {Element} list
 */
export function fitActionColumns(list) {
    if (!(list instanceof HTMLElement)) return;
    const isTable = list instanceof HTMLTableElement;
    const rows = buttonRows(list);
    const roles = rows.map((row) => rowRoles(row.map((button) => ({ role: button.dataset.kpAction ?? null }))));
    const order = mergeRoles(roles);
    const named = rows.some((row) => row.some((button) => button.dataset.kpAction !== undefined));

    for (const row of rows) for (const button of row) button.style.removeProperty('--kp-action-col');
    for (const name of LIST_PROPERTIES) list.style.removeProperty(name);
    if (order.length === 0 || (!isTable && !named)) return;

    if (isTable) writeTableWidths(list, rows, roles, order);
    else list.style.setProperty('--kp-action-count', String(order.length));
    rows.forEach((row, r) => row.forEach((button, b) => button.style.setProperty('--kp-action-col', String(order.indexOf(roles[r][b]) + 1))));
}
