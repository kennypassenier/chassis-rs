// Expanding and folding rows and the row keys.
import { EXPAND_EVENT, GROUP_EVENT } from '../events.js';
import { FOLDING_OUT, playArrivalBackwards, stopReversing } from '../../motion.js';
import { DETAIL, GROUP_ROW, ROW_TOGGLE } from '../selectors.js';
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

export class TableExpand {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
    }

    // ── Expansion ──────────────────────────────────────────────────
    /** @param {HTMLTableRowElement} row @param {boolean} open */
    setExpanded(row, open) {
        const key = this.t.columns.keyOf(row);
        if (open === this.t.details.expanded.has(key)) return;
        // One open row at a time [J2]: the opening closes the row that
        // was open, in the same step and the same event.
        /** @type {string[]} */
        const closed = open && this.t.details.single ? [...this.t.details.expanded] : [];
        for (const other of closed) this.t.details.expanded.delete(other);
        if (open) this.t.details.expanded.add(key);
        else this.t.details.expanded.delete(key);
        const detail = open ? this.t.sync.detailFor(row) : this.t.details.details.get(row);
        this.t.render.render();
        /** @type {Record<string, unknown>} */
        const said = { key, row, open, cell: detail?.cells[0] ?? null, expanded: [...this.t.details.expanded] };
        if (this.t.details.single) said.closed = closed;
        this.t.wrap.dispatchEvent(new CustomEvent(EXPAND_EVENT, { bubbles: true, detail: said }));
    }

    /** @param {readonly string[]} keys */
    expandKeys(keys) {
        const want = new Set(this.t.details.single ? keys.slice(-1) : keys);
        for (const row of this.t.model.all) {
            const key = this.t.columns.keyOf(row);
            if (want.has(key) !== this.t.details.expanded.has(key)) this.setExpanded(row, want.has(key));
        }
    }

    // ── Folding a group [J2] ───────────────────────────────────────
    /** The rows of a folding group play their arrival backwards, then are hidden by a render. @param {HTMLTableRowElement[]} going */
    foldAway(going) {
        void Promise.all(going.map((row) => playArrivalBackwards(row))).then(() => {
            let held = false;
            for (const row of going)
                if (this.t.groups.departing.delete(row)) {
                    row.removeAttribute('data-kp-folding');
                    held = true;
                }
            if (held) this.t.render.render();
        });
    }

    /** @param {string} key @param {boolean} fold */
    setFolded(key, fold) {
        if (fold === this.t.groups.folded.has(key)) return;
        // A group folds as it unfolded, turned around: its rows play
        // their arrival backwards (js/motion.js) and are hidden once it
        // has played; they unfolded the theme's way and folded away at
        // once (Kenny, 2026-10-05). Unfolded meanwhile, they turn round.
        // Meanwhile they carry `data-kp-folding="out"`, so the box around
        // them glides shut as they play, the mirror of its glide open
        // (Kenny's form v21: it snapped shut once they had gone).
        const going = fold ? this.t.model.pageRows.filter((row) => this.t.groups.groupOf(row) === key && !row.hidden) : [];
        if (fold) this.t.groups.folded.add(key);
        else {
            this.t.groups.folded.delete(key);
            for (const row of [...this.t.groups.departing])
                if (this.t.groups.groupOf(row) === key) {
                    this.t.groups.departing.delete(row);
                    row.removeAttribute('data-kp-folding');
                    stopReversing(row);
                }
        }
        for (const row of going) {
            this.t.groups.departing.add(row);
            row.setAttribute('data-kp-folding', FOLDING_OUT);
        }
        if (going.length) this.foldAway(going);
        this.t.render.render();
        this.t.wrap.dispatchEvent(
            new CustomEvent(GROUP_EVENT, {
                bubbles: true,
                detail: {
                    key,
                    row: this.t.groups.groups.get(key) ?? null,
                    open: !fold,
                    members: this.t.model.all.filter((row) => this.t.groups.groupOf(row) === key),
                    folded: [...this.t.groups.folded],
                },
            }),
        );
    }

    /** @param {readonly string[]} keys */
    foldKeys(keys) {
        const want = new Set(keys);
        for (const key of this.t.groups.groups.keys()) this.setFolded(key, want.has(key));
        // A group not in the body now keeps the state it is given, for when its rows come.
        for (const key of [...this.t.groups.folded]) if (!this.t.groups.groups.has(key) && !want.has(key)) this.t.groups.folded.delete(key);
        for (const key of want) if (!this.t.groups.groups.has(key)) this.t.groups.folded.add(key);
    }

    /**
     * Enter or Space on a row, or on a cell, that holds the focus itself
     * (a row given a tabindex, a cell of the keyboard grid) works it as a
     * click does: opens the row, folds the group [J2, R-KEYS]. A control
     * in the row keeps its own keys.
     * @param {KeyboardEvent} event
     */
    onRowKey(event) {
        if ((event.key !== 'Enter' && event.key !== ' ') || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        const target = /** @type {HTMLElement} */ (event.target);
        if (!target.matches('tr, td, th')) return;
        const row = /** @type {HTMLTableRowElement | null} */ (target.closest('tr'));
        if (row === null || row.parentElement !== this.t.body || row.matches(DETAIL)) return;
        if (row.matches(GROUP_ROW)) {
            const key = row.dataset.kpRowGroup ?? '';
            if (this.t.groups.groups.get(key) !== row) return;
            event.preventDefault();
            this.setFolded(key, !this.t.groups.folded.has(key));
        } else if (this.t.details.expandable && row.querySelector(ROW_TOGGLE) !== null) {
            event.preventDefault();
            this.setExpanded(row, !this.t.details.expanded.has(this.t.columns.keyOf(row)));
        } else return;
        if (target.isConnected && document.activeElement !== target) target.focus({ preventScroll: true });
    }
}
