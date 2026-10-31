// Row groups: collecting, folding, placing and syncing them.
import { DETAIL, GROUP_COUNT, GROUP_ROW, GROUP_TOGGLE, SKELETON_ROW } from '../selectors.js';
import { getStrings } from '../../strings.js';
/** @typedef {import('../../strings/types.js').Strings} Strings */
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

export class TableGroups {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
        // ── Group rows that fold a run of rows [J2] ────────────────────
        // A heading row `tr[data-kp-row-group="g"]` folds the rows marked
        // `data-kp-group-of="g"`. The table keeps a group together under its
        // heading: a sort orders the rows within their group, and the groups,
        // and any run of rows outside a group between them, keep the place
        // the markup gave them. That is the least surprising of the choices:
        // a sort that tore a group apart would leave headings over rows that
        // are not theirs. A filter hides a group whose rows all fail it, and
        // a group split over two pages shows its heading on both. Folded rows
        // still count as matched, so the status line keeps the exact number
        // [R-COUNT]. Not for a server-backed table, whose server orders rows.
        /** Each group's heading row, by group key. @type {Map<string, HTMLTableRowElement>} */
        this.groups = new Map();
        /** The group keys folded now; kept by key, so they outlive a refresh. @type {Set<string>} */
        this.folded = new Set();
        /** Rows of a folding group held shown while their arrival plays backwards. @type {Set<HTMLTableRowElement>} */
        this.departing = new Set();
        /** Every group key seen, so a heading's data-kp-folded counts the first time only. @type {Set<string>} */
        this.seenGroups = new Set();
        /** The blocks in the order they stand: a group, or a run of rows outside every group. @type {string[]} */
        this.blockOrder = [];
        /** @type {Map<HTMLTableRowElement, string>} */
        this.blockOf = new Map();
        /** A heading's name, read before its toggle went in. @type {Map<HTMLTableRowElement, string>} */
        this.groupNames = new Map();
        /** Heading rows this attach prepared, with what detach puts back. @type {Map<HTMLTableRowElement, { span: string | null, hidden: boolean }>} */
        this.preparedGroups = new Map();
        /** Member rows this attach gave an id, so their toggle can name them in aria-controls. @type {Set<HTMLTableRowElement>} */
        this.givenIds = new Set();
        this.memberIds = 0;
        this.collectGroups();
        /** The body's order at attach, headings included, for detach. */
        this.layoutAtAttach = this.groups.size > 0 ? [...this.t.body.rows] : null;
    }

    /** The count of the columns a reader sees. */
    visibleColumns() {
        return this.t.columns.headers.filter((_, at) => !this.t.sortSetup.hiddenColumns.has(at)).length;
    }

    /** The group a row belongs to, when that group has a heading row. @param {HTMLTableRowElement} row */
    groupOf(row) {
        const key = row.dataset.kpGroupOf;
        return key !== undefined && this.groups.has(key) ? key : null;
    }

    /** A heading row's fold button, first in its first cell. @param {HTMLTableRowElement} heading */
    prepareGroup(heading) {
        const cell = heading.cells[0];
        if (cell === undefined || heading.querySelector(GROUP_TOGGLE) !== null) return;
        const key = heading.dataset.kpRowGroup ?? '';
        const copy = /** @type {HTMLElement} */ (heading.cloneNode(true));
        for (const slot of copy.querySelectorAll(GROUP_COUNT)) slot.remove();
        const name = heading.dataset.kpGroupLabel ?? (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
        this.groupNames.set(heading, name);
        this.preparedGroups.set(heading, { span: heading.cells.length === 1 ? cell.getAttribute('colspan') : null, hidden: heading.hidden === true });
        const button = /** @type {HTMLButtonElement} */ (
            this.t.identity.make('button', 'kp-button kp-button--ghost kp-button--sm kp-datatable__expand kp-datatable__group-toggle')
        );
        button.type = 'button';
        button.dataset.kpGroupToggle = '';
        cell.prepend(button);
        this.t.details.decoratePart(button, { kind: 'row-group-toggle', value: key, label: name });
    }

    /** Read the group rows and the blocks from the body as it stands now. */
    collectGroups() {
        if (this.t.controls.serverMode) return;
        this.groups.clear();
        for (const row of this.t.body.rows) {
            if (!row.matches(GROUP_ROW)) continue;
            const key = row.dataset.kpRowGroup ?? '';
            if (this.groups.has(key)) continue;
            this.groups.set(key, row);
            if (!this.seenGroups.has(key)) {
                this.seenGroups.add(key);
                if (row.dataset.kpFolded !== undefined) this.folded.add(key);
            }
            this.prepareGroup(row);
        }
        this.blockOrder = [];
        this.blockOf.clear();
        if (this.groups.size === 0) return;
        const placed = new Set();
        let loose = 0;
        let inLoose = false;
        for (const row of this.t.body.rows) {
            if (row.matches(DETAIL) || row.matches(SKELETON_ROW)) continue;
            /** @type {string} */
            let block;
            if (row.matches(GROUP_ROW)) {
                const key = row.dataset.kpRowGroup ?? '';
                if (this.groups.get(key) !== row) continue;
                block = `group:${key}`;
            } else {
                const key = this.groupOf(row);
                if (key !== null) block = `group:${key}`;
                else {
                    if (!inLoose) loose += 1;
                    block = `rows:${loose}`;
                }
            }
            inLoose = block.startsWith('rows:');
            if (!placed.has(block)) {
                placed.add(block);
                this.blockOrder.push(block);
            }
            if (!row.matches(GROUP_ROW)) this.blockOf.set(row, block);
        }
    }

    /** Rows in the order of their blocks, each block's rows in the order given. @param {HTMLTableRowElement[]} rows */
    arrange(rows) {
        if (this.blockOrder.length === 0) return rows;
        /** @type {Map<string, HTMLTableRowElement[]>} */
        const byBlock = new Map();
        for (const row of rows) {
            const block = this.blockOf.get(row) ?? '';
            const list = byBlock.get(block);
            if (list === undefined) byBlock.set(block, [row]);
            else list.push(row);
        }
        return [...this.blockOrder, ''].flatMap((block) => byBlock.get(block) ?? []);
    }

    /** Is the row in a folded group? @param {HTMLTableRowElement} row */
    isFolded(row) {
        const key = this.groupOf(row);
        return key !== null && this.folded.has(key);
    }

    /**
     * Put the body in the order of its blocks: each heading, then its
     * rows, each with its detail. Nothing moves when the order already
     * stands, and a control that held the focus gets it back when it
     * moved, so a refresh leaves the reader where they were [R-LIVE].
     */
    placeGroups() {
        const shownSet = new Set(this.t.model.shownRows);
        const allSet = new Set(this.t.model.all);
        /** @type {Map<string, HTMLTableRowElement[]>} */
        const byBlock = new Map();
        for (const row of [...this.t.model.shownRows, ...this.t.model.rendered.filter((r) => !shownSet.has(r) && allSet.has(r))]) {
            const block = this.blockOf.get(row) ?? '';
            const list = byBlock.get(block);
            if (list === undefined) byBlock.set(block, [row]);
            else list.push(row);
        }
        /** @type {HTMLTableRowElement[]} */
        const sequence = [];
        for (const block of [...this.blockOrder, '']) {
            const heading = block.startsWith('group:') ? this.groups.get(block.slice('group:'.length)) : undefined;
            if (heading !== undefined) sequence.push(heading);
            for (const row of byBlock.get(block) ?? []) {
                sequence.push(row);
                const detail = this.t.details.details.get(row);
                if (detail !== undefined) sequence.push(detail);
            }
        }
        const wanted = new Set(sequence);
        const current = [...this.t.body.rows].filter((row) => wanted.has(row));
        if (current.length === sequence.length && current.every((row, at) => row === sequence[at])) return;
        const active = document.activeElement;
        const held = active instanceof HTMLElement && this.t.body.contains(active) ? active : null;
        // Only rows still in the body are placed: one the page took out (replaced tbody content, then a sort before refresh())
        // stays out, and is never put back beside its replacement [states-check-1019].
        // A detail row built on demand (detailFn) is not in the body yet: it is placed here with the rows, or a grouped table never
        // showed it [HL 143].
        for (const row of sequence) if (row.parentElement === this.t.body || (this.t.details.builtDetails.has(row) && row.parentElement === null)) this.t.body.append(row);
        if (held !== null && held.isConnected && document.activeElement !== held) held.focus({ preventScroll: true });
    }

    /** Name each heading's toggle, count its rows and show it where its rows are. @param {ReturnType<typeof getStrings>} s */
    syncGroups(s) {
        if (this.groups.size === 0) return;
        /** @type {Map<string, number>} */
        const matched = new Map();
        for (const row of this.t.model.shownRows) {
            const key = this.groupOf(row);
            if (key !== null) matched.set(key, (matched.get(key) ?? 0) + 1);
        }
        /** @type {Map<string, string[]>} */
        const onPage = new Map();
        for (const row of this.t.model.pageRows) {
            const key = this.groupOf(row);
            if (key === null) continue;
            if (row.id === '' && row.dataset.kpRowKey !== undefined) {
                this.memberIds += 1;
                row.id = `${this.t.identity.id}-row-${this.memberIds}`;
                this.givenIds.add(row);
            }
            const ids = onPage.get(key) ?? [];
            if (row.id !== '') ids.push(row.id);
            onPage.set(key, ids);
        }
        for (const [key, heading] of this.groups) {
            const count = matched.get(key) ?? 0;
            const open = !this.folded.has(key);
            // `data-kp-group-always` [kpadopt]: the heading stays with no data row under it (rows still loading, failed, or none).
            heading.hidden = !onPage.has(key) && heading.dataset.kpGroupAlways === undefined;
            const button = heading.querySelector(GROUP_TOGGLE);
            if (button !== null) {
                button.setAttribute('aria-expanded', String(open));
                button.setAttribute('aria-label', s.tableGroupRows(this.groupNames.get(heading) ?? key, count));
                button.textContent = open ? this.t.controls.glyphs.collapse : this.t.controls.glyphs.expand;
                const ids = onPage.get(key) ?? [];
                if (ids.length > 0) button.setAttribute('aria-controls', ids.join(' '));
                else button.removeAttribute('aria-controls');
            }
            for (const slot of heading.querySelectorAll(GROUP_COUNT)) slot.textContent = String(count);
            const cell = heading.cells[0];
            if (heading.cells.length === 1 && cell !== undefined) cell.colSpan = this.visibleColumns();
        }
    }
}
