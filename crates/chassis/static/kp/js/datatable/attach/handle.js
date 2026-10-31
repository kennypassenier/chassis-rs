// The handle a page gets back from the table, the watch that keeps the table's rows the body's, and the wiring again when an
// option attribute changes.
import { handles } from '../instance.js';
import { watchOptions } from '../../live-options.js';
/** @typedef {import('../instance.js').DataTableHandle} DataTableHandle */
/** @typedef {import('../events.js').FilterValue} FilterValue */
/** @typedef {import('../events.js').State} State */
/** @typedef {import('../events.js').View} View */
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

/** The option attributes the chrome is built from: a change wires the table again [live-options-1019]. */
const LIVE_OPTIONS = ['data-kp-sort-multi', 'data-kp-filter-mode', 'data-kp-filter-ui', 'data-kp-expand-single', 'data-kp-fixed-end'];

export class TableHandle {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
        /** What a page gets back for this table. @type {DataTableHandle} */
        this.handle = this.makeHandle();
        handles.set(t.wrap, this.handle);
        t.call.created.push(this.handle);
        if (!t.controls.serverMode) this.watchRows();
        // The options that shape the chrome are read again when their attribute changes: the filter bar and the sort summary are
        // built from them, and the one-row-open rule is read when the table is wired. The table is wired again with the view it
        // had [live-options-1019].
        t.identity.undo.push(watchOptions(t.wrap, LIVE_OPTIONS, () => this.wireAgain()));
    }

    /** @returns {DataTableHandle} */
    makeHandle() {
        const { t } = this;
        return {
            element: t.wrap,
            view: t.bound(t.sync, t.sync.view),
            sort: t.bound(t.handlers, t.handlers.setSort),
            sortBy: (keys) => t.handlers.commitSorts(keys.map((key) => ({ column: key.column, direction: key.direction }))),
            page: (next) => this.page(next),
            pageSize: t.bound(t.handlers, t.handlers.setPageSize),
            query: (next) => this.query(next),
            scope: (given) => this.scope(given),
            columnIndex: (id) => t.sync.columnAt(id),
            filter: t.bound(t.handlers, t.handlers.setFilter),
            clearFilters: t.bound(t.handlers, t.handlers.clearFilters),
            editFilter: (given) => this.editFilter(given),
            hideColumns: (columns) => t.handlers.setHidden(columns),
            expand: t.bound(t.expand, t.expand.expandKeys),
            fold: (keys) => {
                t.expand.foldKeys(keys);
                t.render.render();
            },
            density: t.bound(t.handlers, t.handlers.setDensity),
            state: (next) => this.setState(next),
            fail: (reason) => this.fail(reason),
            busy: (words) => this.busy(words),
            reload: () => (t.controls.serverMode ? t.server.request() : t.apply.applyFilter({ keepPage: true })),
            edit: (key, column) => {
                const row = t.model.all.find((r) => t.columns.keyOf(r) === key);
                if (row !== undefined) void t.edit.openEditor(row, column);
            },
            cancelEdit: () => void t.edit.commitEdit(false),
            rows: (which = 'view') => (which === 'page' ? [...t.model.pageRows] : [...t.model.shownRows]),
            selected: () => (t.controls.serverMode ? [...t.sync.serverSelection] : t.sync.selectedRows().map((row) => t.columns.keyOf(row))),
            select: t.bound(t.selection, t.selection.select),
            refresh: (options) => this.refresh(options),
        };
    }

    /** @param {number} next */
    page(next) {
        this.t.model.page = Math.max(0, next);
        if (this.t.controls.serverMode) this.t.server.request();
        else this.t.render.render();
    }

    /** @param {string} next */
    query(next) {
        this.t.model.query = next;
        if (this.t.controls.search !== null) this.t.controls.search.value = next;
        this.t.apply.applyFilter();
    }

    /** @param {number | string | null} given */
    scope(given) {
        const { model, controls } = this.t;
        const column = given === null ? null : this.t.sync.columnAt(given);
        model.scope = column === null || column < 0 ? null : column;
        if (controls.scopeSelect !== null) controls.scopeSelect.value = model.scope === null ? '' : String(model.scope);
        this.t.apply.applyFilter();
    }

    /** @param {number | string | null} given */
    editFilter(given) {
        const { filterUi, filterEditing } = this.t;
        const column = given === null ? null : this.t.sync.columnAt(given);
        if (column !== null && column < 0) return;
        if (filterUi.addMode) {
            if (column === null) filterEditing.closeFilterEditor(false);
            else filterEditing.openFilterEditor(column, this.t.model.filters.has(column) ? column : null);
        } else if (filterUi.panel !== null && filterUi.toggle !== null) {
            filterUi.panel.hidden = column === null;
            filterUi.toggle.setAttribute('aria-expanded', String(!filterUi.panel.hidden));
        }
    }

    /** @param {State} next */
    setState(next) {
        this.t.model.state = next;
        if (next !== 'failed') this.t.model.failReason = null;
        this.t.render.render();
    }

    /** @param {string | null} [reason] */
    fail(reason) {
        this.t.model.failReason = reason ?? null;
        this.t.model.state = 'failed';
        this.t.render.render();
    }

    /** @param {Parameters<DataTableHandle['busy']>[0]} words */
    busy(words) {
        const { model, wrap } = this.t;
        const given = typeof words === 'object' && words !== null ? words : { text: words };
        model.busyText = given.text ?? null;
        model.busySince = given.since === undefined || given.since === null ? null : Number(given.since);
        model.busyOverlay = 'overlay' in given && given.overlay !== undefined ? Boolean(given.overlay) : wrap.hasAttribute('data-kp-busy-overlay');
        this.t.render.render();
    }

    /**
     * Read the rows again. The control that held the focus keeps it [R-LIVE, J2]: the same element when it stayed, else the same
     * toggle of the row (or group) with the same key, when the consumer replaced it, even before this call, as long as nothing else
     * took the focus.
     * @param {{ keepPage?: boolean }} [options]
     */
    refresh(options) {
        const { selection, body } = this.t;
        const active = document.activeElement;
        const inBody = active instanceof HTMLElement && body.contains(active) ? active : null;
        const focusMemo = selection.focusMemo;
        const lost = inBody === null && focusMemo !== null && !focusMemo.element.isConnected && (active === null || active === document.body);
        const memo = inBody !== null ? selection.toggleMemo(inBody) : lost ? focusMemo : null;
        const held = inBody ?? (lost && focusMemo !== null ? focusMemo.element : null);
        this.readRows();
        this.t.groups.collectGroups();
        this.t.sync.syncColumns();
        this.t.apply.refreshChoices();
        this.t.apply.applyFilter({ keepPage: options?.keepPage === true });
        if (held !== null && document.activeElement !== held) this.focusBack(held, memo);
    }

    /** The rows as the body holds them now: held rows hidden, gone rows forgotten, new rows prepared, their built details dropped. */
    readRows() {
        const { model, details, body } = this.t;
        details.collectDetails();
        model.holdRows();
        model.all = [...body.rows].filter((row) => model.isRow(row));
        // A row the page took out is no longer one of the table's: detach must not put it back.
        for (let at = model.rendered.length - 1; at >= 0; at -= 1)
            if (!model.all.includes(model.rendered[at]) && !model.rendered[at].isConnected) model.rendered.splice(at, 1);
        for (const row of model.all) {
            if (!model.rendered.includes(row)) model.rendered.push(row);
            this.t.reorder.prepareRow(row);
        }
        // A detail this table built for a row that is gone goes with it.
        for (const [row, detail] of details.details) {
            if (row.isConnected || !details.builtDetails.has(detail)) continue;
            detail.remove();
            details.builtDetails.delete(detail);
            details.details.delete(row);
        }
    }

    /**
     * Give the focus back to the control that held it, or to the same toggle of its row or group.
     * @param {HTMLElement} held
     * @param {{ key: string | null, group: string | null, selector: string | null } | null} memo
     */
    focusBack(held, memo) {
        const heldKey = memo?.key ?? null;
        const heldGroup = memo?.group ?? null;
        const heldToggle = memo?.selector ?? null;
        /** @type {HTMLElement | null} */
        let back = held.isConnected ? held : null;
        if (back === null && heldToggle !== null) {
            const row =
                heldGroup !== null
                    ? (this.t.groups.groups.get(heldGroup) ?? null)
                    : (this.t.model.all.find((r) => heldKey !== null && heldKey !== '' && this.t.columns.keyOf(r) === heldKey) ?? null);
            back = /** @type {HTMLElement | null} */ (row?.querySelector(heldToggle) ?? null);
        }
        if (back !== null && !back.hidden && back.closest('tr')?.hidden !== true) back.focus({ preventScroll: true });
    }

    /**
     * Rows the page added, removed or held are the table's rows at once, without a call to refresh(): the count, the pager and the
     * pages follow the body [b3b4-1019; homelab gap 34, kyu gap 28]. The table's own sort and page moves put the same rows back in
     * another order, which changes nothing here.
     */
    watchRows() {
        const { body, model, wrap } = this.t;
        let queued = false;
        const resync = () => {
            queued = false;
            model.holdRows();
            const now = [...body.rows].filter((row) => model.isRow(row));
            if (now.length === model.all.length && now.every((row) => model.all.includes(row))) return;
            handles.get(wrap)?.refresh({ keepPage: true });
        };
        const onBody = () => {
            if (queued) return;
            queued = true;
            queueMicrotask(resync);
        };
        const rowsWatch = new MutationObserver(onBody);
        rowsWatch.observe(body, { childList: true });
        const holdWatch = new MutationObserver(onBody);
        holdWatch.observe(body, { attributes: true, attributeFilter: ['data-kp-row-hidden'], subtree: true });
        this.t.identity.undo.push(() => {
            rowsWatch.disconnect();
            holdWatch.disconnect();
        });
    }

    /** Wire the table again after an option attribute changed, and give the page's handle the view it had. */
    wireAgain() {
        const { wrap, call } = this.t;
        const old = handles.get(wrap);
        if (old === undefined) return;
        const was = old.view();
        const selected = old.selected();
        const fresh = this.t.rewire(old);
        if (fresh === undefined) return;
        // The page keeps the handle it has: the new table's methods move onto it.
        Object.assign(old, fresh);
        handles.set(wrap, old);
        call.created.splice(call.created.indexOf(fresh), 1, old);
        restoreView(old, was, selected, call.sortsSeveral(wrap));
    }
}

/**
 * Put a view back on a freshly wired table through its handle.
 * @param {DataTableHandle} handle
 * @param {View} was
 * @param {string[]} selected
 * @param {boolean} several whether the table sorts on several columns now
 */
function restoreView(handle, was, selected, several) {
    if (was.query !== '') handle.query(was.query);
    if (was.scope !== null) handle.scope(was.scope);
    for (const [column, value] of Object.entries(was.filters)) handle.filter(Number(column), /** @type {FilterValue} */ (value));
    // Going to one sort key keeps the first.
    if (was.sorts.length > 0) handle.sortBy(several ? was.sorts : was.sorts.slice(0, 1));
    if (was.pageSize !== handle.view().pageSize) handle.pageSize(was.pageSize);
    if (was.hidden.length > 0) handle.hideColumns(was.hidden);
    if (was.density !== handle.view().density) handle.density(was.density);
    if (was.folded.length > 0) handle.fold(was.folded);
    if (was.expanded.length > 0) handle.expand(was.expanded);
    if (selected.length > 0) handle.select(selected);
    if (was.page > 0) handle.page(was.page);
    if (was.state !== 'ready') handle.state(was.state);
}
