// The filter pills and the add menu; the editor they open is filter-editor.js.
import { getStrings } from '../../strings.js';
import { filterPillLabel, filterPills } from '../filter.js';
/** @typedef {import('../events.js').FilterKind} FilterKind */
/** @typedef {import('../events.js').FilterValue} FilterValue */
/** @typedef {import('../../strings/types.js').Strings} Strings */
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

export class TablePills {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
    }

    renderPills() {
        if (this.t.filterUi.pills === null) return;
        const s = getStrings();
        const list = this.t.render.pillsList;
        list.textContent = '';
        list.setAttribute('aria-label', s.tableActiveFilters);
        if (this.t.filterUi.addMode) {
            this.renderAddPills(s);
            return;
        }
        this.t.render.clearButton.textContent = s.tableClearFilters;
        let count = 0;
        for (const at of this.t.filterUi.filterColumns) {
            const kind = /** @type {FilterKind} */ (this.t.columns.filterKinds[at]);
            for (const pill of filterPills(kind, this.t.columns.labelOf(at), this.t.model.filters.get(at), s, this.t.controls.locale)) {
                count += 1;
                const item = this.t.identity.make('li', 'kp-tag');
                const remove = /** @type {HTMLButtonElement} */ (this.t.identity.make('button', 'kp-tag__remove'));
                remove.type = 'button';
                remove.setAttribute('aria-label', s.tableRemoveFilter(pill.label));
                remove.textContent = this.t.settings.removeGlyph;
                remove.addEventListener('click', () => {
                    this.t.handlers.setFilter(at, pill.without ?? null);
                    const next = /** @type {HTMLElement | null} */ (this.t.filterUi.pills?.querySelector('.kp-tag__remove') ?? null);
                    (next ?? this.t.filterUi.toggle)?.focus();
                });
                item.append(pill.label, remove);
                list.append(item);
            }
        }
        this.t.filterUi.pills.hidden = count === 0;
        if (this.t.filterUi.toggle !== null) this.t.filterUi.toggle.textContent = s.tableFilters(count);
    }

    /** One pill per filter, in the order the filters were added. @param {import('../../strings.js').Strings} s */
    renderAddPills(s) {
        if (this.t.filterUi.pills === null) return;
        let count = 0;
        for (const [at, value] of this.t.model.filters) {
            const kind = this.t.columns.filterKinds[at];
            if (!kind) continue;
            const label = filterPillLabel(kind, this.t.columns.labelOf(at), value, s, this.t.controls.locale);
            if (label === null) continue;
            count += 1;
            const item = this.t.identity.make('li', 'kp-tag');
            const edit = /** @type {HTMLButtonElement} */ (this.t.identity.make('button', 'kp-datatable__pill-edit'));
            edit.type = 'button';
            edit.dataset.kpFilterPill = String(at);
            edit.setAttribute('aria-label', s.tableEditFilter(label));
            edit.setAttribute('aria-expanded', String(this.t.filterEditing.editingFilter === at));
            if (this.t.filterUi.filterEditor !== null) edit.setAttribute('aria-controls', this.t.filterUi.filterEditor.id);
            edit.textContent = label;
            const remove = /** @type {HTMLButtonElement} */ (this.t.identity.make('button', 'kp-tag__remove'));
            remove.type = 'button';
            remove.dataset.kpFilterUnpill = String(at);
            remove.setAttribute('aria-label', s.tableRemoveFilter(label));
            remove.textContent = this.t.settings.removeGlyph;
            item.append(edit, remove);
            this.t.render.pillsList.append(item);
        }
        this.t.filterUi.pills.hidden = count === 0;
        this.t.render.clearButton.textContent = s.tableFilterClearAll;
        this.t.render.clearButton.hidden = count < 2;
        if (this.t.filterUi.addButton !== null) this.t.filterUi.addButton.textContent = s.tableAddFilter(count);
        this.renderAddMenu(s);
    }

    /** The menu of filterable columns; a filtered one is marked, and choosing it edits its filter. @param {import('../../strings.js').Strings} s */
    renderAddMenu(s) {
        if (this.t.filterUi.addMenu === null) return;
        const focused = /** @type {HTMLElement | null} */ (this.t.filterUi.addMenu.querySelector(':focus'))?.dataset.kpFilterColumn;
        this.t.filterUi.addMenu.setAttribute('aria-label', s.tableAddFilterMenu);
        this.t.filterUi.addMenu.textContent = '';
        for (const at of this.t.filterUi.filterColumns) {
            const on = this.t.model.filters.has(at);
            const item = this.t.identity.make('li');
            const button = /** @type {HTMLButtonElement} */ (this.t.identity.make('button', 'kp-menu__item kp-datatable__add-item'));
            button.type = 'button';
            button.dataset.kpFilterColumn = String(at);
            button.setAttribute('aria-label', on ? s.tableAddFilterItemActive(this.t.columns.labelOf(at)) : s.tableAddFilterItem(this.t.columns.labelOf(at)));
            button.append(this.t.columns.labelOf(at));
            if (on) {
                button.dataset.kpFilterMarked = '';
                const mark = this.t.identity.make('span', 'kp-badge');
                mark.setAttribute('aria-hidden', 'true');
                mark.textContent = s.tableFilterMarked;
                button.append(' ', mark);
            }
            item.append(button);
            this.t.filterUi.addMenu.append(item);
            if (focused === String(at)) button.focus();
        }
    }

    /** @param {MouseEvent} event */
    onAddMenuClick(event) {
        const button = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-kp-filter-column]'));
        if (button === null) return;
        const at = Number(button.dataset.kpFilterColumn);
        if (this.t.filterUi.addPop?.matches(':popover-open')) this.t.filterUi.addPop.hidePopover();
        this.t.filterEditing.openFilterEditor(at, this.t.model.filters.has(at) ? at : null);
    }

    /** @param {KeyboardEvent} event */
    onAddMenuKey(event) {
        if (this.t.filterUi.addMenu === null) return;
        const items = /** @type {HTMLElement[]} */ ([...this.t.filterUi.addMenu.querySelectorAll('.kp-menu__item')]);
        const at = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
        /** @type {Record<string, number>} */
        const moves = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 };
        const to = moves[event.key];
        if (to === undefined || items.length === 0) return;
        event.preventDefault();
        items[(to + items.length) % items.length]?.focus();
    }

    /** @param {Event} event */
    onAddToggle(event) {
        const open = /** @type {ToggleEvent} */ (event).newState === 'open';
        this.t.filterUi.addButton?.setAttribute('aria-expanded', String(open));
        if (!open) return;
        this.renderAddMenu(getStrings());
        /** @type {HTMLElement | null} */ (this.t.filterUi.addMenu?.querySelector('.kp-menu__item') ?? null)?.focus();
    }

    /** @param {MouseEvent} event */
    onPillsClick(event) {
        if (!this.t.filterUi.addMode) return;
        const target = /** @type {HTMLElement} */ (event.target);
        const edit = /** @type {HTMLElement | null} */ (target.closest('[data-kp-filter-pill]'));
        if (edit !== null) {
            const at = Number(edit.dataset.kpFilterPill);
            if (this.t.filterEditing.editingFilter === at) this.t.filterEditing.closeFilterEditor(true);
            else this.t.filterEditing.openFilterEditor(at, at);
            return;
        }
        const remove = /** @type {HTMLElement | null} */ (target.closest('[data-kp-filter-unpill]'));
        if (remove === null) return;
        const at = Number(remove.dataset.kpFilterUnpill);
        if (this.t.filterEditing.editingFilter === at) this.t.filterEditing.closeFilterEditor(false);
        this.t.handlers.setFilter(at, null);
        /** @type {HTMLElement | null} */ (this.t.filterUi.pills?.querySelector('.kp-tag__remove') ?? this.t.filterUi.addButton)?.focus();
    }
}
