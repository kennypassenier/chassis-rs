// One add row: its layout under the table's columns (or as a line in a form grid), and its valid line handed to the page [forms-1102].

import { Controller } from '../controller.js';
import { TABLE } from '../datatable/selectors.js';
import { COLUMNS_EVENT, VIEW_EVENT } from '../datatable/events.js';
import { VALID_EVENT } from '../forms/constants.js';
import { ADD_ROW_FOR } from './constants.js';
import { headerCells, layLine, layTableRow } from './layout.js';
import { addLine, refusalOf } from './submit.js';

export class AddRow extends Controller {
    /** @param {HTMLElement} host the add row, a form */
    constructor(host) {
        super(host);
        this.row = /** @type {HTMLFormElement} */ (host);
        /** The frame a new layout waits for. */
        this.frame = 0;
    }

    connect() {
        const row = this.row;
        row.classList.add('kp-addrow');
        refusalOf(row);
        if (!row.querySelector('.kp-addrow__live')) {
            const live = row.ownerDocument.createElement('span');
            live.className = 'kp-sr-only kp-addrow__live';
            live.setAttribute('role', 'status');
            row.append(live);
            this.own(() => live.remove());
        }
        this.listen(row, VALID_EVENT, (event) => {
            if (event.target === row) void addLine(row, /** @type {CustomEvent} */ (event).detail?.data ?? new FormData(row));
        });
        this.own(() => cancelAnimationFrame(this.frame));
        const sizes = this.observe(new ResizeObserver(() => this.soon()));
        sizes.observe(row);
        const wrap = this.wrap();
        if (wrap) {
            sizes.observe(wrap);
            for (const th of headerCells(wrap)) sizes.observe(th);
            for (const type of [VIEW_EVENT, COLUMNS_EVENT]) this.listen(wrap, type, () => this.soon());
            const scroller = wrap.querySelector('.kp-table-wrap');
            if (scroller) this.listen(scroller, 'scroll', () => this.shift(), { passive: true });
        }
        this.lay();
    }

    /** The table this row adds to, or null for a line in a form grid. @returns {HTMLElement | null} */
    wrap() {
        const id = this.row.getAttribute(ADD_ROW_FOR);
        if (!id) return null;
        const named = this.row.ownerDocument.getElementById(id);
        const wrap = /** @type {HTMLElement | null} */ (named?.closest(TABLE) ?? named?.querySelector(TABLE) ?? null);
        if (!wrap) console.warn(`kp-addrow: no data table #${id} on the page; the row stands as a line`, this.row);
        return wrap;
    }

    /** Lay out on the next frame. */
    soon() {
        cancelAnimationFrame(this.frame);
        this.frame = requestAnimationFrame(() => this.lay());
    }

    lay() {
        const wrap = this.wrap();
        const cells = /** @type {HTMLElement | null} */ (this.row.querySelector('.kp-addrow__cells'));
        if (!wrap || !cells) {
            layLine(this.row);
            return;
        }
        layTableRow(this.row, cells, wrap);
        this.shift();
    }

    /** Hold the cells on the table's columns as the table scrolls sideways (and on its first column's edge). */
    shift() {
        const wrap = this.wrap();
        const cells = /** @type {HTMLElement | null} */ (this.row.querySelector('.kp-addrow__cells'));
        const first = wrap ? headerCells(wrap)[0] : undefined;
        if (!cells || !first || this.row.hasAttribute('data-kp-addrow-stacked')) {
            cells?.style.removeProperty('--kp-addrow-shift');
            return;
        }
        const box = this.row.getBoundingClientRect();
        const style = getComputedStyle(this.row);
        const start = box.left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth);
        cells.style.setProperty('--kp-addrow-shift', `${(first.getBoundingClientRect().left - start).toFixed(2)}px`);
    }
}
