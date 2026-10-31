// Finds the controls around the table and reads its options.
import { ACTIONS, DENSITY, EMPTY, FAILED, LOADING, PAGER, SCOPE, SEARCH, SELECT_ALL, STATUS } from '../selectors.js';
import { PAGE_SIZE, SERVER_DEBOUNCE_MS } from '../events.js';
import { resolveLocale } from '../../locale.js';
import { splitList } from '../filter.js';
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

export class TableControls {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
        this.search = /** @type {HTMLInputElement | null} */ (this.t.wrap.querySelector(SEARCH));
        this.scopeSelect = /** @type {HTMLSelectElement | null} */ (this.t.wrap.querySelector(SCOPE));
        this.densitySelect = /** @type {HTMLSelectElement | null} */ (this.t.wrap.querySelector(DENSITY));
        this.status = /** @type {HTMLElement | null} */ (this.t.wrap.querySelector(STATUS));
        this.pager = /** @type {HTMLElement | null} */ (this.t.wrap.querySelector(PAGER));
        this.empty = /** @type {HTMLElement | null} */ (this.t.wrap.querySelector(EMPTY));
        this.loadingSlot = /** @type {HTMLElement | null} */ (this.t.wrap.querySelector(LOADING));
        this.failedSlot = /** @type {HTMLElement | null} */ (this.t.wrap.querySelector(FAILED));
        this.actions = /** @type {HTMLElement | null} */ (this.t.wrap.querySelector(ACTIONS));
        this.selectAll = /** @type {HTMLInputElement | null} */ (this.t.wrap.querySelector(SELECT_ALL));
        this.size = Number.parseInt(this.t.wrap.dataset.kpPageSize ?? '', 10) || PAGE_SIZE;
        this.locale = resolveLocale(this.t.wrap.dataset.kpLocale ?? this.t.settings.localeOption, this.t.wrap);
        this.serverMode = this.t.wrap.dataset.kpServer !== undefined;
        // The page owns the order [kpadopt4]: everything about the sort but the moving of rows.
        this.externalSort = this.t.wrap.dataset.kpSortExternal === undefined ? this.t.settings.sortExternal : this.t.wrap.dataset.kpSortExternal !== 'false';
        this.debounce = Number.parseInt(this.t.wrap.dataset.kpDebounce ?? '', 10) || this.t.settings.debounceMs || (this.serverMode ? SERVER_DEBOUNCE_MS : 0);
        this.cycle = this.t.wrap.dataset.kpSortCycle ?? this.t.settings.sortCycle;
        /** @type {'two' | 'three'} */
        this.cycleName = this.cycle === 'two' ? 'two' : 'three';
        this.multi = this.t.call.sortsSeveral(this.t.wrap);
        // `data-kp-sort-multi="click"` [kpadopt]: every plain press adds the
        // column as a key (ascending, descending, out); Shift flips to the
        // old plain press, "this column alone", the quick way back to one key.
        this.addOnClick = this.multi && (this.t.wrap.dataset.kpSortMulti === 'click' || (this.t.wrap.dataset.kpSortMulti === undefined && this.t.settings.multiSort === 'click'));
        this.glyphs = {
            expand: this.t.wrap.dataset.kpExpandGlyph ?? this.t.settings.expandGlyph,
            collapse: this.t.wrap.dataset.kpCollapseGlyph ?? this.t.settings.collapseGlyph,
        };
        this.sizesAttribute = this.t.wrap.dataset.kpPageSizes;
        this.sizes = this.sizesAttribute === 'none'
                ? []
                : [
                      ...new Set([
                          ...(this.sizesAttribute
                              ? splitList(this.sizesAttribute)
                                    .map(Number)
                                    .filter((n) => n > 0)
                              : this.t.settings.pageSizesOption),
                          this.size,
                      ]),
                  ].sort((a, b) => a - b);
    }
}
