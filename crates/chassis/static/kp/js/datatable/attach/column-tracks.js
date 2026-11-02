// Fixed column tracks while a group folds [ux-1101, table-rows; homelab: "collapsing a group re-measures the columns; headers jump sideways"].
// An auto-layout table sizes each column to its widest visible cell, so folding the group that held the widest cell moved every header.
// The first time a group folds, the table writes the columns' measured widths on its header cells and lays itself out as a fixed table;
// the widths hold until the table's own width changes or the page refreshes the rows, and then they are measured again.
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

export class TableColumnTracks {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
        /** Whether the widths are written now. */
        this.held = false;
        /** The width of the table's wrapper when they were written [px]; a different width means the room changed and they are let go. */
        this.heldWidth = 0;
        t.own(() => this.release());
        t.own(() => this.watch.disconnect());
        /** Lets the columns go when the room changes. */
        this.watch = new ResizeObserver(() => {
            if (this.held && Math.abs(this.t.wrap.clientWidth - this.heldWidth) >= 1) this.release();
        });
        this.watch.observe(t.wrap);
    }

    /** Hold the columns where they stand, before rows leave or come back. A table with no group row has nothing to fold. */
    hold() {
        const { table, columns, groups } = this.t;
        if (groups.groups.size === 0) return;
        if (this.held || table.getBoundingClientRect().width === 0) return;
        const widths = columns.headers.map((header) => header.getBoundingClientRect().width);
        columns.headers.forEach((header, at) => header.style.setProperty('inline-size', `${widths[at]}px`));
        table.style.setProperty('table-layout', 'fixed');
        this.held = true;
        this.heldWidth = this.t.wrap.clientWidth;
    }

    /** Let the columns size themselves again. */
    release() {
        if (!this.held) return;
        for (const header of this.t.columns.headers) header.style.removeProperty('inline-size');
        this.t.table.style.removeProperty('table-layout');
        this.held = false;
        this.heldWidth = 0;
    }
}
