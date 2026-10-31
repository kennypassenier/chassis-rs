// Server mode: sending a request and applying the answer.
import { CHECK_CLASS, EXPAND_COLUMN, REORDER_COLUMN, SELECT_ALL, SELECT_ROW } from '../selectors.js';
import { getStrings } from '../../strings.js';
import { REQUEST_EVENT } from '../events.js';
/** @typedef {import('../events.js').DataAnswer} DataAnswer */
/** @typedef {import('../events.js').DataRequest} DataRequest */
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

export class TableServer {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
        // ── Rows from a server (#async) ────────────────────────────────
        this.sent = 0;
        this.latest = 0;
        /** @type {AbortController | null} */
        this.controller = null;
        this.pending = 0;
    }

    /** @param {HTMLTableRowElement | Record<string, unknown>} item */
    rowFrom(item) {
        if (item instanceof HTMLTableRowElement) return item;
        const row = /** @type {HTMLTableRowElement} */ (this.t.identity.make('tr'));
        // The key: the consumer's function, else the field the table names, else
        // the key column's field, else `key` or `id`.
        const field = this.t.wrap.dataset.kpRowKeyField ?? this.t.columns.headers[this.t.columns.keyColumn]?.dataset.kpField;
        row.dataset.kpRowKey = this.t.settings.rowKeyFn ? this.t.settings.rowKeyFn(item) : String((field === undefined ? undefined : item[field]) ?? item.key ?? item.id ?? '');
        this.t.columns.headers.forEach((header, at) => {
            if (header.matches(EXPAND_COLUMN) || header.matches(REORDER_COLUMN)) return;
            const cell = this.t.identity.make('td');
            if (header.querySelector(SELECT_ALL) !== null) {
                const box = /** @type {HTMLInputElement} */ (this.t.identity.make('input', CHECK_CLASS));
                box.type = 'checkbox';
                box.dataset.kpSelectRow = '';
                box.setAttribute('aria-label', getStrings().tableSelectRow(row.dataset.kpRowKey ?? ''));
                cell.dataset.label = '';
                cell.append(box);
            } else {
                cell.dataset.label = this.t.columns.labelOf(at);
                // A number column's alignment, a code column's face: the classes
                // the header asks its cells to wear, since an object has none.
                if (header.dataset.kpCellClass) cell.className = header.dataset.kpCellClass;
                const value = item[header.dataset.kpField ?? this.t.columns.labelOf(at)];
                cell.textContent = value === undefined || value === null ? '' : String(value);
            }
            row.append(cell);
        });
        return row;
    }

    /** @param {DataAnswer} answer */
    applyAnswer(answer) {
        for (const row of this.t.model.all) {
            const box = /** @type {HTMLInputElement | null} */ (row.querySelector(SELECT_ROW));
            if (box !== null) {
                if (box.checked) this.t.sync.serverSelection.add(this.t.columns.keyOf(row));
                else this.t.sync.serverSelection.delete(this.t.columns.keyOf(row));
            }
        }
        if (this.t.edit.editing !== null) this.t.edit.closeEditor();
        const next = answer.rows.map(this.t.bound(this, this.rowFrom));
        for (const row of [...this.t.body.rows]) if (!next.includes(row)) row.remove();
        this.t.details.details.clear();
        for (const row of next) {
            row.hidden = false;
            this.t.body.append(row);
            this.t.reorder.prepareRow(row);
            const box = /** @type {HTMLInputElement | null} */ (row.querySelector(SELECT_ROW));
            if (box !== null) box.checked = this.t.sync.serverSelection.has(this.t.columns.keyOf(row));
        }
        this.t.model.all = next;
        this.t.model.shownRows = [...next];
        this.t.busy.total = Number(answer.total) || 0;
        this.t.model.state = 'ready';
        this.t.sync.syncColumns();
        this.t.render.render();
    }

    /**
     * What the table asks the server for: its view now.
     * @param {number} id @param {AbortSignal} signal
     * @returns {DataRequest}
     */
    requestFor(id, signal) {
        const { model } = this.t;
        return {
            id,
            query: model.query,
            scope: model.scope,
            sort: model.sorts[0] ? { ...model.sorts[0] } : null,
            sorts: model.sorts.map((key) => ({ ...key })),
            filters: Object.fromEntries(model.filters),
            filtersByField: this.t.sync.byField(),
            page: model.page,
            pageSize: this.t.controls.size,
            signal,
        };
    }

    /** Ask the server for the view: by `kp-datatable-request` and the `load` option; only the newest answer counts. */
    request() {
        if (!this.t.controls.serverMode) return;
        this.sent += 1;
        const requestId = this.sent;
        this.latest = requestId;
        this.controller?.abort();
        this.controller = new AbortController();
        const params = this.requestFor(requestId, this.controller.signal);
        this.t.model.state = 'loading';
        this.t.render.render();
        let settled = false;
        /** @param {DataAnswer} answer */
        const respond = (answer) => {
            if (settled) return;
            settled = true;
            // An answer to a request that is no longer the newest is thrown away.
            if (requestId !== this.latest) return;
            this.applyAnswer(answer);
        };
        /** @param {unknown} error */
        const fail = (error) => {
            if (settled) return;
            settled = true;
            if (requestId !== this.latest) return;
            void error;
            this.t.model.state = 'failed';
            this.t.render.render();
        };
        this.t.wrap.dispatchEvent(new CustomEvent(REQUEST_EVENT, { bubbles: true, detail: { ...params, respond, fail } }));
        const loadFn = this.t.settings.loadFn;
        if (loadFn !== undefined) {
            Promise.resolve()
                .then(() => loadFn(params))
                .then(respond, fail);
        }
    }
}
