// The keyboard walking the rows of one list: j / k or the arrows, Home and End, Enter to open, and one row in the tab order.

import { Controller } from '../controller.js';
import { ROW_OPEN_EVENT } from './values.js';

export class RowKeys extends Controller {
    connect() {
        this.settle();
        if (typeof MutationObserver !== 'undefined') this.observe(new MutationObserver(() => this.settle())).observe(this.host, { childList: true });
        this.listen(this.host, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(this.host, 'focusin', (event) => this.onFocus(/** @type {FocusEvent} */ (event)));
    }

    /** @returns {HTMLElement[]} */
    rowsOf() {
        return /** @type {HTMLElement[]} */ ([...this.host.children]).filter(
            (r) => r.tagName === 'LI' && !r.hidden && !r.classList.contains('kp-action-list__group') && r.getAttribute('aria-hidden') !== 'true',
        );
    }

    /** Only this row is in the tab order. @param {HTMLElement} row */
    current(row) {
        for (const r of this.rowsOf()) r.tabIndex = r === row ? 0 : -1;
    }

    /** Every row focusable, one of them in the tab order; rows added later too. */
    settle() {
        const rows = this.rowsOf();
        for (const r of rows) if (!r.hasAttribute('tabindex')) r.tabIndex = -1;
        if (rows.length && !rows.some((r) => r.tabIndex === 0)) this.current(rows[0]);
    }

    /**
     * The row a key moves to, or null when it is not a moving key.
     * @param {KeyboardEvent} event @param {number} count @param {number} at @param {boolean} onRow
     */
    target(event, count, at, onRow) {
        if (event.key === 'j' || event.key === 'ArrowDown') return Math.min(count - 1, at + 1);
        if (event.key === 'k' || event.key === 'ArrowUp') return Math.max(0, at - 1);
        if (onRow && event.key === 'Home') return 0;
        if (onRow && event.key === 'End') return count - 1;
        return null;
    }

    /** @param {KeyboardEvent} event */
    onKey(event) {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const target = /** @type {HTMLElement | null} */ (event.target instanceof HTMLElement ? event.target : null);
        if (!target || target.closest('input, textarea, select, [contenteditable]')) return;
        const rows = this.rowsOf();
        const at = rows.findIndex((r) => r === target || r.contains(target));
        if (at < 0) return;
        const onRow = rows[at] === target;
        const to = this.target(event, rows.length, at, onRow);
        if (to !== null) {
            // A summary or a button keeps its own arrows only where it has a use for them: none here.
            event.preventDefault();
            this.current(rows[to]);
            rows[to].focus();
            return;
        }
        if (event.key === 'Enter' && onRow) {
            event.preventDefault();
            rows[at].dispatchEvent(new CustomEvent(ROW_OPEN_EVENT, { bubbles: true, detail: { row: rows[at] } }));
        }
    }

    /** @param {FocusEvent} event */
    onFocus(event) {
        const row = this.rowsOf().find((r) => event.target instanceof Node && r.contains(event.target));
        if (row) this.current(row);
    }
}
