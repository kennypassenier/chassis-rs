// The list of one row's days [heatstates-1102]: what a heat grid's row holds, read back from the drawn row, and the panel that
// shows it. It reads the drawn grid, not the spec, so a grid whose markup the page wrote by hand gets the same list.
import { getStrings } from '../strings.js';
import { HEAT_CELL } from './constants.js';
import { make } from './dom.js';

/**
 * One day of the row, as the list shows it.
 * @typedef {object} HeatDay
 * @property {HTMLElement} cell  the cell it stands for
 * @property {string} key  the column key
 * @property {string} name  the column's name: its `full` name, else the axis name, else the header's accessible name, else the key
 * @property {string} value  what the cell says: its own words (`data-kp-said`), else its whole accessible name
 * @property {string} tone
 * @property {string} level  `--kp-heat-level`, for a `level` cell
 * @property {boolean} disabled
 * @property {boolean} picked
 */

/** The names of the grid's columns by key: the `full` name a column was given, else its axis name. @param {HTMLElement} el */
function columnNames(el) {
    /** @type {Map<string, string>} */
    const names = new Map();
    for (const head of /** @type {NodeListOf<HTMLElement>} */ (el.querySelectorAll('.kp-heat__axis .kp-heat__col[data-col-key]'))) {
        const key = head.dataset.colKey ?? '';
        names.set(key, head.dataset.kpFull || head.textContent?.trim() || head.getAttribute('aria-label') || key);
    }
    return names;
}

/**
 * The days of `row`, in the grid's column order.
 * @param {HTMLElement} el the grid @param {HTMLElement} row
 * @returns {HeatDay[]}
 */
export function rowDays(el, row) {
    const names = columnNames(el);
    const picked = el.getAttribute('data-kp-heat-picked');
    return [.../** @type {NodeListOf<HTMLElement>} */ (row.querySelectorAll(HEAT_CELL))].map((cell) => {
        const key = cell.dataset.colKey ?? '';
        return {
            cell,
            key,
            name: names.get(key) ?? key,
            value: cell.dataset.kpSaid ?? cell.getAttribute('aria-label') ?? '',
            tone: cell.getAttribute('data-kp-tone') ?? 'muted',
            level: cell.style.getPropertyValue('--kp-heat-level'),
            disabled: cell.getAttribute('aria-disabled') === 'true',
            picked: picked !== null && key === picked,
        };
    });
}

/** The row's name: its label's words, else its key. @param {HTMLElement} row */
export function rowName(row) {
    return row.querySelector('.kp-heat__label-text')?.textContent?.trim() || row.dataset.rowKey || '';
}

/**
 * One day as a button of the list: the tone's swatch, the day's name and what it says, in three columns every day shares.
 * @param {Document} doc @param {HeatDay} day
 */
function dayButton(doc, day) {
    const button = make(doc, 'button', 'kp-menu__item kp-heat__day', { type: 'button', 'data-col-key': day.key, 'aria-pressed': String(day.picked) });
    const swatch = make(doc, 'i', 'kp-heat__swatch kp-heat__day-swatch', { 'aria-hidden': 'true', 'data-kp-tone': day.tone });
    if (day.level) swatch.style.setProperty('--kp-heat-level', day.level);
    const name = make(doc, 'span', 'kp-heat__day-name');
    name.textContent = day.name;
    const value = make(doc, 'span', 'kp-heat__day-value');
    value.textContent = day.value;
    button.append(swatch, name, value);
    if (day.disabled) button.setAttribute('aria-disabled', 'true');
    return button;
}

/**
 * The panel: the row's name, one line on what a choice does, and the list of its days. It stands on the menu's raised plate
 * (`.kp-menu`, which every register paints opaque) and is a non-modal dialog.
 * @param {Document} doc @param {string} name the row's name @param {HeatDay[]} days @param {string} id
 */
export function daysPanel(doc, name, days, id) {
    const s = getStrings();
    const panel = make(doc, 'div', 'kp-menu kp-heat__days', { id, role: 'dialog', 'aria-label': s.heatDaysLabel(name, days.length) });
    const title = make(doc, 'p', 'kp-heat__days-title');
    title.textContent = name;
    const hint = make(doc, 'p', 'kp-heat__days-hint');
    hint.textContent = s.heatDaysHint;
    const list = make(doc, 'ul', 'kp-heat__days-list', { role: 'list' });
    for (const day of days) {
        const item = make(doc, 'li', 'kp-heat__days-item');
        item.append(dayButton(doc, day));
        list.append(item);
    }
    panel.append(title, hint, list);
    return panel;
}
