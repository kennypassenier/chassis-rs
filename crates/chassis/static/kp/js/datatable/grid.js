// The grid mode: fixed columns, the scrolled marker and the grid attachment (their controllers are in grid-control.js).
import { shown } from './filter.js';
import { DETAIL } from './selectors.js';
import { GRID_PAGE_ROWS } from './events.js';
import { GridControl, ScrollMark } from './grid-control.js';

/**
 * Keep the leading columns of a table in place while its box scrolls
 * sideways [Kenny, 2026-09-13, #sticky]. Measures the header cells and
 * writes, on every cell of the first `count` columns, `data-kp-fixed`
 * (`last` on the one that draws the hairline) and the offset it sticks at
 * as `--kp-datatable-fixed-start`; the stylesheet does the sticking. Call
 * it again after the columns change; both channels do.
 *
 * @param {HTMLTableElement} table
 * @param {number} count how many leading columns stay; 0 takes the marks away
 * @param {number} [endCount] how many trailing columns stay at the end edge (`data-kp-fixed-end`); 0 takes the marks away
 */
export function syncFixedColumns(table, count, endCount = 0) {
    const head = table.tHead?.rows[0];
    /** @type {Map<number, number>} */
    const starts = new Map();
    let last = -1;
    if (head !== undefined && count > 0) {
        let offset = 0;
        for (const cell of head.cells) {
            if (cell.cellIndex >= count) break;
            if (!shown(cell)) continue;
            starts.set(cell.cellIndex, offset);
            offset += cell.getBoundingClientRect().width;
            last = cell.cellIndex;
        }
    }
    // The end columns count from the last cell of the header, and stick at the end edge [datatable-r5-1019, O22].
    /** @type {Map<number, number>} */
    const ends = new Map();
    let first = -1;
    if (head !== undefined && endCount > 0) {
        let offset = 0;
        let taken = 0;
        for (let at = head.cells.length - 1; at >= 0 && taken < endCount; at--) {
            const cell = head.cells[at];
            if (!shown(cell)) continue;
            if (starts.has(cell.cellIndex)) break;
            ends.set(cell.cellIndex, offset);
            offset += cell.getBoundingClientRect().width;
            first = cell.cellIndex;
            taken += 1;
        }
    }
    for (const row of table.rows) {
        const whole = row.matches(DETAIL);
        for (const cell of row.cells) {
            const start = whole ? undefined : starts.get(cell.cellIndex);
            if (start === undefined) {
                if (cell.dataset.kpFixed !== undefined) {
                    delete cell.dataset.kpFixed;
                    cell.style.removeProperty('--kp-datatable-fixed-start');
                }
            } else {
                cell.dataset.kpFixed = cell.cellIndex === last ? 'last' : '';
                cell.style.setProperty('--kp-datatable-fixed-start', `${Math.round(start * 100) / 100}px`);
            }
            const end = whole ? undefined : ends.get(cell.cellIndex);
            if (end === undefined) {
                if (cell.dataset.kpFixedEnd !== undefined) {
                    delete cell.dataset.kpFixedEnd;
                    cell.style.removeProperty('--kp-datatable-fixed-end');
                }
            } else {
                cell.dataset.kpFixedEnd = cell.cellIndex === first ? 'first' : '';
                cell.style.setProperty('--kp-datatable-fixed-end', `${Math.round(end * 100) / 100}px`);
            }
        }
    }
}
/**
 * Mark a data table while its scroll box is scrolled away from the top
 * [scope-90]: `data-kp-scrolled` on `element` while `box.scrollTop` is
 * above 0, removed at the top. The stylesheet draws the sticky header's
 * reach (`fix-32`) only under it, so a caption right above the header is
 * not painted over at rest. One decision per frame, on a passive listener.
 * Both channels use this one.
 *
 * @param {HTMLElement} element the `.kp-datatable`
 * @param {HTMLElement} box its `.kp-table-wrap`, the box that scrolls
 * @returns {() => void} detach, which removes the attribute
 */
export function watchScrolled(element, box) {
    const mark = new ScrollMark(element, { box });
    mark.connect();
    return () => mark.destroy();
}
/**
 * @typedef {object} GridHandle
 * @property {() => void} sync  re-read the rows and cells after they changed; keeps one cell in the tab order
 * @property {(row: number, column: number) => void} focus  move to a cell, by row index in the table and column
 * @property {() => void} detach
 */

/**
 * A roving focus grid over a table [Kenny, 2026-09-13, #keyboard; APG grid].
 *
 * Tab enters on one cell and leaves with the next Tab; inside, the arrow
 * keys move a cell at a time, Home and End go to the start and end of the
 * row, Ctrl + Home and Ctrl + End to the first and last cell, and Page Up
 * and Page Down `pageRows` rows. A cell that holds exactly one control — a
 * sort button, a checkbox, an edit button — hands the focus to that
 * control, so Enter and Space do what the control does. Hidden rows and
 * columns are stepped over, and keys pressed inside an open editor belong
 * to the editor. Both channels use this one.
 *
 * @param {HTMLTableElement} table
 * @param {{ pageRows?: number, onMove?: (position: { row: number, rows: number, column: number, cell: HTMLTableCellElement }) => void }} [options]
 * @returns {GridHandle}
 */
export function attachGrid(table, { pageRows = GRID_PAGE_ROWS, onMove } = {}) {
    const grid = new GridControl(table, { pageRows, onMove });
    try {
        grid.connect();
    } catch (error) {
        grid.destroy();
        throw error;
    }
    return {
        sync: () => grid.sync(),
        focus: (row, column) => grid.move(row, column),
        detach: () => grid.destroy(),
    };
}
