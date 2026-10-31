// The table's view state: rows, page, query, scope, filters, sorts and busy flags.
import { DETAIL, GROUP_ROW, HELD_ROW, SKELETON_ROW } from '../selectors.js';
/** @typedef {import('../events.js').FilterValue} FilterValue */
/** @typedef {import('../events.js').SortKey} SortKey */
/** @typedef {import('../events.js').State} State */
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

export class TableModel {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
        this.holdRows();
        this.all = /** @type {HTMLTableRowElement[]} */ ([...this.t.body.rows].filter(this.t.bound(this, this.isRow)));
        /** The order the server rendered, so detach can put it back. */
        this.rendered = [...this.all];
        /** @type {HTMLTableRowElement[]} */
        this.shownRows = [...this.all];
        /** @type {HTMLTableRowElement[]} */
        this.pageRows = [...this.all];
        this.page = 0;
        this.query = '';
        /** @type {number | null} */
        this.scope = null;
        /** @type {Map<number, FilterValue>} */
        this.filters = new Map();
        /** @type {SortKey[]} */
        this.sorts = [];
        /** @type {State} */
        this.state = /** @type {State} */ (['loading', 'failed'].includes(this.t.wrap.dataset.kpState ?? '') ? this.t.wrap.dataset.kpState : 'ready');
        /** The consumer's own words for the status line while it loads (busy(), fix-80); null is the dictionary's busy word. @type {string | null} */
        this.busyText = null;
        /** Why the table failed, in the app's words (fail(), fix-85); null is the dictionary's. @type {string | null} */
        this.failReason = null;
        /** When the load began, for a count the table keeps itself (busy({ since }), fix-84); null is no count. @type {number | null} */
        this.busySince = null;
        /** The timer that moves that count, only while a counting table loads. @type {ReturnType<typeof setInterval> | null} */
        this.busyTimer = null;
        /** The element the count is written into, so the tick touches nothing else. @type {HTMLElement | null} */
        this.busyClock = null;
        /** A large spinner over the rows while it loads, for a table long or slow enough that the status line is out of sight (busy({ overlay }) or data-kp-busy-overlay). */
        this.busyOverlay = this.t.wrap.hasAttribute('data-kp-busy-overlay');
        /** That layer, while it shows. @type {HTMLElement | null} */
        this.overlayLayer = null;
        /** Its copy of the count, moved by the same tick. @type {HTMLElement | null} */
        this.overlayClock = null;
    }

    /** Every row as it was rendered. Sorting reorders this array, never the DOM's idea of it. */
    isRow(/** @type {HTMLTableRowElement} */ row) {
        return !row.matches(DETAIL) && !row.matches(SKELETON_ROW) && !row.matches(GROUP_ROW) && !row.matches(HELD_ROW);
    }

    /** A held row stays hidden whatever the table does; the page lifts it with the attribute [b3b4-1019]. */
    holdRows() {
        for (const row of this.t.body.querySelectorAll(`:scope > ${HELD_ROW}`)) /** @type {HTMLElement} */ (row).hidden = true;
    }
}
