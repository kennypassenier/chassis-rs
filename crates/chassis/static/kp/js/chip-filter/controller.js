// One chip group tied to one data table's column [forms-1102]: a press filters the table, the table's filter lights the chips,
// and every chip counts its rows again whenever the table's rows or their words change.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { dataTable } from '../datatable/instance.js';
import { VIEW_EVENT } from '../datatable/events.js';
import { DETAIL, EDIT_VALUE, GROUP_ROW, HELD_ROW, SKELETON_ROW, TABLE } from '../datatable/selectors.js';
import { splitList } from '../datatable/filter.js';
import { SEGMENTED_EVENT } from '../segmented/constants.js';
import { getSegmentedValues, isAll, isMulti, itemsOf, valueOf } from '../segmented/read.js';
import { setSegmentedCounts, setSegmentedValues } from '../segmented/api.js';
import { buildItem, setSegmentedItems } from '../segmented/items.js';
import { ALL_VALUE, FILTER_CHIPS, FILTER_COLUMN, FILTER_COUNTS, FILTER_FOR, LINKED } from './constants.js';
import { chipCounts, chipValues, countValues } from './counts.js';
import { byId } from '../by-id.js';

export class ChipFilter extends Controller {
    /** @param {HTMLElement} host the chip group */
    constructor(host) {
        super(host);
        /** The column's number in the table, once the table is attached; -1 before. */
        this.at = -1;
        /** The values the chips were last made from (auto chips), to know when to make them again. */
        this.made = '';
        /** The frame a recount waits for. */
        this.frame = 0;
    }

    connect() {
        this.listen(this.host, SEGMENTED_EVENT, (event) => event.target === this.host && this.toTable());
        this.listen(this.host.ownerDocument, VIEW_EVENT, (event) => {
            if (event.target !== this.wrap()) return;
            if (this.host.hasAttribute(LINKED)) this.fromTable();
            else this.link();
        });
        this.own(() => cancelAnimationFrame(this.frame));
        this.own(() => this.host.removeAttribute(LINKED));
        this.link();
        // The table may be attached after the chips: try again once the page has attached everything.
        const later = requestAnimationFrame(() => this.link());
        this.own(() => cancelAnimationFrame(later));
    }

    /** The table's wrapper, or null while it is not on the page. @returns {HTMLElement | null} */
    wrap() {
        const id = this.host.getAttribute(FILTER_FOR) ?? '';
        const named = id ? byId(this.host.ownerDocument, id) : null;
        return /** @type {HTMLElement | null} */ (named?.closest(TABLE) ?? named?.querySelector(TABLE) ?? null);
    }

    /** Find the table, its column and its rows, once; then count and paint. */
    link() {
        const wrap = this.wrap();
        const handle = wrap ? dataTable(wrap) : null;
        if (!wrap || !handle || this.host.hasAttribute(LINKED)) return;
        const column = this.host.getAttribute(FILTER_COLUMN) ?? '';
        this.at = handle.columnIndex(column);
        if (this.at < 0 && /^\d+$/.test(column)) this.at = Number(column);
        const header = wrap.querySelector('thead tr:last-child')?.children[this.at];
        if (!header || header.getAttribute('data-kp-filter') !== 'choice') {
            console.warn(`kp-chip-filter: column "${column}" of #${wrap.id || '(table)'} needs data-kp-filter="choice" on its header`, this.host);
            return;
        }
        this.host.setAttribute(LINKED, '');
        const body = wrap.querySelector('tbody');
        if (body) {
            const watch = this.observe(new MutationObserver(() => this.soon()));
            watch.observe(body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-kp-filter-value', 'data-kp-row-hidden'] });
        }
        this.recount();
        this.fromTable();
    }

    /** Count again on the next frame: a burst of row changes is counted once. */
    soon() {
        cancelAnimationFrame(this.frame);
        this.frame = requestAnimationFrame(() => this.recount());
    }

    /** One value per row the table holds (a held-out, detail, group or loading row is none). @returns {string[]} */
    rowValues() {
        const rows = [...(this.wrap()?.querySelectorAll('tbody > tr') ?? [])].filter((row) => !row.matches(`${DETAIL}, ${GROUP_ROW}, ${HELD_ROW}, ${SKELETON_ROW}`));
        return rows.map((row) => {
            const cell = /** @type {HTMLTableRowElement} */ (row).cells[this.at];
            if (!cell) return '';
            return (cell.getAttribute('data-kp-filter-value') ?? (cell.querySelector(EDIT_VALUE) ?? cell).textContent ?? '').trim();
        });
    }

    /** The All item's value: the one the page wrote, else none. */
    allValue() {
        const all = itemsOf(this.host).find(isAll);
        return all ? valueOf(all) : ALL_VALUE;
    }

    /** Make the chips again (auto) or give the page's chips an All item, then write every count. */
    recount() {
        if (this.at < 0) return;
        const counts = countValues(this.rowValues());
        const header = this.wrap()?.querySelector('thead tr:last-child')?.children[this.at];
        const values = chipValues(counts, header ? splitList(header.getAttribute('data-kp-filter-options')) : null, this.host.ownerDocument.documentElement.lang || undefined);
        if (this.auto()) this.makeChips(values);
        else this.ensureAll();
        if (this.host.getAttribute(FILTER_COUNTS) === 'off') return;
        const shown = itemsOf(this.host).filter((item) => !isAll(item)).map(valueOf);
        setSegmentedCounts(this.host, chipCounts(counts, shown, this.allValue()));
    }

    /** Whether the chips are made from the column (the page asked, or wrote none). */
    auto() {
        const mode = this.host.getAttribute(FILTER_CHIPS);
        return mode === 'auto' || (mode !== 'own' && (this.made !== '' || itemsOf(this.host).length === 0));
    }

    /** @param {string[]} values */
    makeChips(values) {
        const key = JSON.stringify(values);
        if (key === this.made) return;
        this.made = key;
        const all = { value: ALL_VALUE, label: getStrings().chipFilterAll, all: true, count: null };
        setSegmentedItems(this.host, [all, ...values.map((value) => ({ value, label: value, count: null }))]);
        this.fromTable();
    }

    /** A page's own chips without an All item get one, first. */
    ensureAll() {
        if (itemsOf(this.host).some(isAll)) return;
        const look = { multi: isMulti(this.host), tri: false, kept: new Map() };
        this.host.prepend(buildItem({ value: ALL_VALUE, label: getStrings().chipFilterAll, all: true, count: null }, look));
        this.fromTable();
    }

    /** A press: the chips on become the column's filter; All (or nothing) lifts it. */
    toTable() {
        const wrap = this.wrap();
        const handle = wrap ? dataTable(wrap) : null;
        if (!handle || this.at < 0) return;
        const all = this.allValue();
        const values = getSegmentedValues(this.host).filter((value) => value !== all);
        handle.filter(this.at, values.length ? values : null);
    }

    /** The table's filter on the column, whoever set it, lights the chips (no event). */
    fromTable() {
        const wrap = this.wrap();
        const handle = wrap ? dataTable(wrap) : null;
        if (!handle || this.at < 0) return;
        const value = handle.view().filters[this.at];
        const on = Array.isArray(value) ? value : [];
        if (isMulti(this.host)) setSegmentedValues(this.host, on);
        else setSegmentedValues(this.host, on.length ? [on[0]] : [this.allValue()]);
    }
}
