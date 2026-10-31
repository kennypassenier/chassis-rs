// Renders the rows, the pager and the filter pills area.
import { getStrings } from '../../strings.js';
import { VIEW_EVENT } from '../events.js';
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

/** How often the busy count moves, in milliseconds. */
const BUSY_TICK_MS = 1000;

export class TableRender {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
        // The list is rebuilt, the clear button is not: a click on it blurs a
        // range field, whose change event re-renders the pills, and a button
        // rebuilt between the press and the release never gets its click.
        this.pillsList = this.t.identity.add(this.t.identity.make('ul', 'kp-tag-list'));
        this.clearButton = /** @type {HTMLButtonElement} */ (
            this.t.identity.add(this.t.identity.make('button', `kp-button kp-button--ghost kp-datatable__clear-filters${this.t.filterUi.addMode ? ' kp-button--sm' : ''}`))
        );
        this.clearButton.type = 'button';
        this.t.details.decoratePart(this.clearButton, { kind: 'clear-filters' });
        this.clearButton.addEventListener('click', () => {
            this.t.handlers.clearFilters();
            (this.t.filterUi.toggle ?? this.t.filterUi.addButton)?.focus();
        });
        if (this.t.filterUi.pills !== null) {
            this.t.filterUi.pills.textContent = '';
            this.t.filterUi.pills.append(this.pillsList, this.clearButton);
        }
    }

    render() {
        const { controls, model } = this.t;
        this.t.sync.labelCells();
        const count = controls.serverMode ? this.t.busy.total || 0 : model.shownRows.length;
        const pages = Math.max(1, Math.ceil(count / controls.size));
        model.page = Math.min(model.page, pages - 1);
        const from = model.page * controls.size;
        model.pageRows = controls.serverMode || controls.pager === null ? model.shownRows : model.shownRows.slice(from, from + controls.size);
        this.placeRows();
        const s = getStrings();
        this.t.groups.syncGroups(s);
        if (controls.status !== null) this.writeStatus(controls.status, s, from, count);
        this.t.busy.drawOverlay(s);
        if (controls.pager !== null) this.writePager(controls.pager, s, pages);
        if (controls.empty !== null) this.syncEmpty(controls.empty, count);
        if (controls.failedSlot !== null) {
            const reason = controls.failedSlot.querySelector('[data-kp-datatable-failed-reason]');
            if (reason !== null) reason.textContent = model.failReason ?? s.tableFailed;
        }
        this.syncParts();
        this.t.wrap.dispatchEvent(new CustomEvent(VIEW_EVENT, { bubbles: true, detail: { ...this.t.sync.view(), rows: [...model.shownRows], pageRows: [...model.pageRows] } }));
    }

    /**
     * Show this page's rows and hide the rest. Reordering by appending: the rows are the same elements, so anything a consumer
     * attached to them survives a sort. A row's detail travels directly under it.
     */
    placeRows() {
        const { model, groups, details, body } = this.t;
        for (const row of model.all) row.hidden = true;
        // A row of a folded group stays on its page, hidden [J2].
        for (const row of model.pageRows) row.hidden = groups.groups.size > 0 && groups.isFolded(row) && !groups.departing.has(row);
        if (groups.blockOrder.length > 0) groups.placeGroups();
        else
            for (const row of model.shownRows) {
                // A row the page replaced is no longer in the body: it is not re-placed beside its replacement [states-check-1019].
                if (row.parentElement !== body) continue;
                body.append(row);
                const detail = details.details.get(row);
                if (detail !== undefined) body.append(detail);
            }
        for (const [row, detail] of details.details) {
            const open = details.expanded.has(this.t.columns.keyOf(row)) && !row.hidden && model.all.includes(row);
            if (open) this.t.sync.detailFor(row);
            detail.hidden = !open;
        }
        for (const row of model.all) this.t.reorder.labelRow(row);
    }

    /**
     * The status line: what is shown, or the busy words with a spinner while loading. Loading, first or again: a spinner says it is
     * working [#states]. It used to come only on a refresh, so a first load that took minutes showed no sign of life [fix-80].
     * @param {HTMLElement} status @param {ReturnType<typeof getStrings>} s @param {number} from @param {number} count
     */
    writeStatus(status, s, from, count) {
        const { model, controls } = this.t;
        status.textContent = '';
        if (model.state === 'loading') {
            const spinner = this.t.identity.make('span', 'kp-spinner');
            spinner.setAttribute('aria-hidden', 'true');
            status.append(spinner, ' ');
        }
        status.append(
            model.state === 'loading'
                ? (model.busyText ?? s.busy)
                : s.tableShowing(model.pageRows.length === 0 ? 0 : from + 1, from + model.pageRows.length, count, controls.serverMode ? count : model.all.length),
        );
        this.t.busy.stopBusyClock();
        if (model.state === 'loading' && model.busySince !== null) this.startBusyClock(status, s);
    }

    /**
     * A count the table keeps itself, in a part the live region does not announce: a screen reader hears the words when they change,
     * not a number every second, and the tick rewrites this one element rather than rendering the table [fix-84].
     * @param {HTMLElement} status @param {ReturnType<typeof getStrings>} s
     */
    startBusyClock(status, s) {
        const { model, busy } = this.t;
        const clock = this.t.identity.make('span', 'kp-datatable__busy-clock');
        clock.dataset.kpBusyClock = '';
        clock.setAttribute('aria-hidden', 'true');
        clock.textContent = s.tableBusyElapsed(busy.busySeconds());
        model.busyClock = clock;
        status.append(' ', clock);
        model.busyTimer = setInterval(() => {
            const words = getStrings().tableBusyElapsed(busy.busySeconds());
            if (model.busyClock !== null) model.busyClock.textContent = words;
            if (model.overlayClock !== null) model.overlayClock.textContent = words;
        }, BUSY_TICK_MS);
    }

    /** The pager: the page-size choice, Back, the page and Next. @param {HTMLElement} pager @param {ReturnType<typeof getStrings>} s @param {number} pages */
    writePager(pager, s, pages) {
        const { model } = this.t;
        pager.textContent = '';
        if (this.t.layoutSetup.sizeLabel !== null) pager.append(this.t.layoutSetup.sizeLabel);
        pager.append(this.pagerButton(s.previous, model.page > 0, () => (model.page -= 1), 'back'));
        const label = document.createElement('span');
        label.className = 'kp-datatable__page';
        label.textContent = (this.t.settings.pageLabel ?? s.tablePage)(model.page + 1, pages);
        pager.append(label);
        pager.append(this.pagerButton(s.next, model.page < pages - 1, () => (model.page += 1)));
    }

    /**
     * The empty slot. Nothing yet, or nothing matching: each of the slot's two optional parts says its own thing and offers its own
     * way out [fix-85].
     * @param {HTMLElement} empty @param {number} count
     */
    syncEmpty(empty, count) {
        const { model } = this.t;
        this.t.busy.showEmpty(count > 0 || model.state !== 'ready');
        const narrowing = model.query.trim() !== '' || model.filters.size > 0;
        for (const part of empty.querySelectorAll('[data-kp-datatable-empty-none]')) /** @type {HTMLElement} */ (part).hidden = narrowing;
        for (const part of empty.querySelectorAll('[data-kp-datatable-empty-nomatch]')) /** @type {HTMLElement} */ (part).hidden = !narrowing;
    }

    /** The parts that follow the rows. After a search or a filter the ticked row may be gone from the page, and the header box must say so [gap-13]. */
    syncParts() {
        const { sync } = this.t;
        sync.syncSelectAll();
        sync.syncActions();
        sync.syncStateParts();
        sync.syncCardSort();
        sync.syncSortMarks();
        sync.syncFixed();
        sync.grid?.sync();
    }

    /** @param {string} text @param {boolean} enabled @param {() => void} go @param {'back'} [direction] */
    pagerButton(text, enabled, go, direction) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = this.t.settings.pagerClassName;
        // Meaning in the markup, the look in the theme: cyberpunk turns a
        // back button's notch to the side it points to; the other themes
        // draw it as the button beside it [Kenny's note of 2026-09-13].
        if (direction !== undefined) button.dataset.kpDirection = direction;
        button.textContent = text;
        button.disabled = !enabled;
        button.addEventListener('click', () => {
            go();
            if (this.t.controls.serverMode) this.t.server.request();
            else this.render();
        });
        return button;
    }
}
