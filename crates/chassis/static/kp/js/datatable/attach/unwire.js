// The detach that undoes everything the table added, in the order it always did: timers and watches, the listeners, then the
// rows, groups, headers and slots as the server rendered them, and the parts this table added.
import { DATE_EVENT } from '../../datepicker.js';
import { GROUP_TOGGLE, SKELETON_ROW } from '../selectors.js';
import { syncFixedColumns } from '../grid.js';
import { handles } from '../instance.js';
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

export class TableUnwire {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
    }

    /** Undo everything: DataTableControl.destroy() runs this last. */
    unwire() {
        const { t } = this;
        t.busy.stopBusyClock();
        clearTimeout(t.server.pending);
        t.server.controller?.abort();
        t.wire.resize?.disconnect();
        cancelAnimationFrame(t.wire.resizeFrame);
        t.edit.closeEditor();
        t.sync.grid?.detach();
        this.removeListeners();
        this.restoreRows();
        this.restoreGroups();
        this.restoreOrder();
        syncFixedColumns(t.table, 0);
        this.restoreHeaders();
        this.restoreSlots();
        this.restoreWrap();
    }

    /** The listeners TableWire added, removed with the same bound functions; the filter editor and the add menu close on the way. */
    removeListeners() {
        this.t.controls.search?.removeEventListener('input', this.t.bound(this.t.handlers, this.t.handlers.onSearch));
        this.t.controls.scopeSelect?.removeEventListener('change', this.t.bound(this.t.handlers, this.t.handlers.onScope));
        this.t.controls.densitySelect?.removeEventListener('change', this.t.bound(this.t.handlers, this.t.handlers.onDensity));
        this.t.filterUi.panel?.removeEventListener('input', this.t.bound(this.t.handlers, this.t.handlers.onPanel));
        this.t.filterUi.panel?.removeEventListener('change', this.t.bound(this.t.handlers, this.t.handlers.onPanel));
        this.t.filterUi.panel?.removeEventListener(DATE_EVENT, this.t.bound(this.t.handlers, this.t.handlers.onPanel));
        this.t.filterUi.toggle?.removeEventListener('click', this.t.bound(this.t.handlers, this.t.handlers.onToggle));
        this.t.filterEditing.closeFilterEditor(false);
        if (this.t.filterUi.addPop?.matches(':popover-open')) this.t.filterUi.addPop.hidePopover();
        this.t.filterUi.addPop?.removeEventListener('toggle', this.t.bound(this.t.pills, this.t.pills.onAddToggle));
        this.t.filterUi.addMenu?.removeEventListener('click', this.t.bound(this.t.pills, this.t.pills.onAddMenuClick));
        this.t.filterUi.addMenu?.removeEventListener('keydown', this.t.bound(this.t.pills, this.t.pills.onAddMenuKey));
        this.t.filterUi.filterEditor?.removeEventListener('submit', this.t.bound(this.t.filterEditing, this.t.filterEditing.onEditorSubmit));
        this.t.filterUi.filterEditor?.removeEventListener('click', this.t.bound(this.t.filterEditing, this.t.filterEditing.onEditorClick));
        this.t.filterUi.filterEditor?.removeEventListener('keydown', this.t.bound(this.t.filterEditing, this.t.filterEditing.onEditorKeydown));
        this.t.render.pillsList.removeEventListener('click', this.t.bound(this.t.pills, this.t.pills.onPillsClick));
        this.t.sortSetup.sortBy?.removeEventListener('change', this.t.bound(this.t.handlers, this.t.handlers.onSortBy));
        this.t.sortSetup.sortDirection?.removeEventListener('click', this.t.bound(this.t.handlers, this.t.handlers.onSortDirection));
        this.t.layoutSetup.sizeSelect?.removeEventListener('change', this.t.bound(this.t.handlers, this.t.handlers.onPageSize));
        this.t.sortSetup.columnList?.removeEventListener('change', this.t.bound(this.t.handlers, this.t.handlers.onColumnChange));
        this.t.sortSetup.columnList?.removeEventListener('click', this.t.bound(this.t.handlers, this.t.handlers.onColumnClick));
        this.t.wrap.removeEventListener('click', this.t.bound(this.t.wrapClick, this.t.wrapClick.onWrapClick));
        this.t.wrap.removeEventListener('keydown', this.t.bound(this.t.edit, this.t.edit.onEditorKeyCapture), { capture: true });
        this.t.wrap.removeEventListener('keydown', this.t.bound(this.t.edit, this.t.edit.onEditorKey));
        this.t.wrap.removeEventListener('focusout', this.t.bound(this.t.edit, this.t.edit.onEditorFocusOut));
        this.t.table.tHead?.removeEventListener('click', this.t.bound(this.t.handlers, this.t.handlers.onHeadClick));
        this.t.table.tHead?.removeEventListener('keydown', this.t.bound(this.t.handlers, this.t.handlers.onHeadKey));
        this.t.body.removeEventListener('change', this.t.bound(this.t.selection, this.t.selection.onBodyChange));
        this.t.body.removeEventListener('keydown', this.t.bound(this.t.expand, this.t.expand.onRowKey));
        this.t.body.removeEventListener('focusin', this.t.bound(this.t.selection, this.t.selection.onBodyFocusIn));
        this.t.body.removeEventListener('focusout', this.t.bound(this.t.selection, this.t.selection.onBodyFocusOut));
        this.t.controls.selectAll?.removeEventListener('change', this.t.bound(this.t.selection, this.t.selection.onSelectAll));
    }

    /**
     * Put back what the server rendered: order, visibility, the sort marks, the pager, the empty state, the focusability, and every
     * part this attach added. First the rows and their details.
     */
    restoreRows() {
        const { body, details, reorder, model } = this.t;
        for (const row of body.querySelectorAll(`:scope > ${SKELETON_ROW}`)) row.remove();
        for (const detail of details.builtDetails) detail.remove();
        for (const row of reorder.prepared) reorder.unprepareRow(row);
        for (const row of model.rendered) row.hidden = false;
        for (const row of model.rendered) {
            const detail = details.details.get(row);
            if (detail !== undefined && !details.builtDetails.has(detail)) detail.hidden = details.detailsWereHidden.get(detail) ?? detail.hidden;
        }
    }

    /** Group rows [J2]: their toggles out, their span and visibility back, the ids taken back. */
    restoreGroups() {
        const { groups } = this.t;
        for (const [heading, was] of groups.preparedGroups) {
            heading.querySelector(GROUP_TOGGLE)?.remove();
            const cell = heading.cells[0];
            if (was.span !== null && cell !== undefined) cell.setAttribute('colspan', was.span);
            else if (heading.cells.length === 1) cell?.removeAttribute('colspan');
            heading.hidden = was.hidden;
        }
        for (const row of groups.givenIds) row.removeAttribute('id');
    }

    /**
     * The body goes back to the order it came in with one write [perf-1026]: the order is worked out on a list, as the appends would
     * have left it, and the rows go in together. A table the page took out of the document gets the same order: its markup after
     * detach is what it was before attach.
     */
    restoreOrder() {
        const { body, details, model, groups } = this.t;
        /** Where each node would stand after the appends, in the order they would have been made. @type {Map<Node, number>} */
        const stand = new Map();
        let next = 0;
        for (const child of body.children) stand.set(child, next++);
        /** @param {Node} node */
        const append = (node) => void stand.set(node, next++);
        for (const row of model.rendered) {
            append(row);
            const detail = details.details.get(row);
            if (detail !== undefined && !details.builtDetails.has(detail)) append(detail);
        }
        if (groups.layoutAtAttach !== null) {
            const placed = new Set(groups.layoutAtAttach);
            for (const row of groups.layoutAtAttach) if (stand.has(row)) append(row);
            for (const row of model.rendered) {
                if (placed.has(row) || !stand.has(row)) continue;
                append(row);
                const detail = details.details.get(row);
                if (detail !== undefined && stand.has(detail)) append(detail);
            }
        }
        const order = [...stand.keys()].sort((a, b) => /** @type {number} */ (stand.get(a)) - /** @type {number} */ (stand.get(b)));
        body.replaceChildren(...order);
    }

    /** The headers' sort marks, visibility, sort and focusability as the markup had them. */
    restoreHeaders() {
        const { columns } = this.t;
        columns.headers.forEach((header, i) => {
            header.querySelector(':scope .kp-datatable__sort-order')?.remove();
            header.hidden = columns.headersWereHidden[i] ?? false;
            const was = columns.headerSort[i];
            if (was === null || was === undefined) header.removeAttribute('aria-sort');
            else header.setAttribute('aria-sort', was);
            const tab = columns.headerTab[i];
            if (tab === null || tab === undefined) header.removeAttribute('tabindex');
            else header.setAttribute('tabindex', tab);
        });
    }

    /** The pager emptied, the slots as they were, the busy count and layer gone. */
    restoreSlots() {
        const { controls, busy, model } = this.t;
        if (controls.pager !== null) controls.pager.textContent = '';
        if (controls.empty !== null) controls.empty.hidden = busy.emptyWasHidden;
        if (controls.loadingSlot !== null) controls.loadingSlot.hidden = true;
        if (controls.failedSlot !== null) controls.failedSlot.hidden = true;
        if (controls.actions !== null) controls.actions.hidden = true;
        busy.stopBusyClock();
        busy.overlayUnwatch?.();
        model.overlayLayer?.remove();
    }

    /** The parts this table added out, its undo steps run, and the wrapper's own attributes back. */
    restoreWrap() {
        const { identity, busy, wrap } = this.t;
        for (const node of identity.added) node.remove();
        for (const step of identity.undo) step();
        if (busy.densityWas === null) wrap.removeAttribute('data-density');
        else wrap.setAttribute('data-density', busy.densityWas);
        if (busy.busyWas === null) wrap.removeAttribute('aria-busy');
        else wrap.setAttribute('aria-busy', busy.busyWas);
        delete wrap.dataset.kpState;
        handles.delete(wrap);
        delete wrap.dataset.kpDatatableAttached;
    }
}
