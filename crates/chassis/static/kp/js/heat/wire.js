// Wires the heat grids of a page: one controller per grid for its pointer, keys, focus and calm legend.
import { Controller, attachAll, controllerOf } from '../controller.js';
import { attachHoverCards } from '../hovercard.js';
import { HEAT, HEAT_CELL, HEAT_PAGE_EVENT, HEAT_PICK_EVENT, HEAT_ROW_EVENT } from './constants.js';
import { HeatDays, opensDays } from './days.js';
import { cellGrid, placeStop } from './draw.js';
import { LIT, STOPS } from './grid-state.js';
import { syncCalmLegend } from './legend.js';
import { PAGING, heatOffset, setHeatPaging } from './paging.js';
import { pressCell, setHeatPick, setHeatRows } from './pick.js';

/**
 * The cell of the grid an event happened in, if any.
 * @param {Element} grid @param {Event} event @param {string} selector
 * @returns {HTMLElement | null}
 */
export function cellOf(grid, event, selector) {
    const cell = /** @type {HTMLElement | null} */ ((event.target instanceof Element ? event.target : null)?.closest(selector) ?? null);
    return cell && grid.contains(cell) ? cell : null;
}

/**
 * A cell that takes the focus holds the tab stop.
 * @param {Element} grid @param {FocusEvent} event @param {string} selector
 */
export function followFocus(grid, event, selector) {
    const cell = cellOf(grid, event, selector);
    if (!cell) return;
    const at = { r: Number(cell.dataset.r), c: Number(cell.dataset.c) };
    const now = STOPS.get(grid);
    if (now?.r !== at.r || now?.c !== at.c) placeStop(grid, selector, at);
}

/** One heat grid; its tab stop and lit rows stay in the STOPS and LIT registries the setters share. */
export class HeatGrid extends Controller {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        /** The row's list of days [heatstates-1102]. */
        this.days = new HeatDays(host);
        /** The pointer of the press in progress: `touch`, `mouse`, `pen`, or '' (the keys). */
        this.pointer = '';
    }

    connect() {
        const el = this.host;
        // Watched before the listeners are added, so destroy() removes the listeners first and the watch last, as before.
        // A calm grid draws its legend, and follows the options that decide it, also when the page only flips an attribute.
        syncCalmLegend(el);
        const legendWatch = this.observe(new MutationObserver(() => syncCalmLegend(el)));
        legendWatch.observe(el, { attributes: true, attributeFilter: ['data-kp-tones', 'data-kp-legend'] });
        this.own(() => this.days.close(false));
        this.listen(el, 'pointerdown', (event) => (this.pointer = /** @type {PointerEvent} */ (event).pointerType || ''));
        this.listen(el, 'click', (event) => this.onClick(event));
        this.listen(el, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(el, 'focusin', (event) => followFocus(el, /** @type {FocusEvent} */ (event), HEAT_CELL));
        // Markup written by hand gets its tab stop and its pressed labels.
        if (el.querySelector(HEAT_CELL)) {
            const pressed = /** @type {NodeListOf<HTMLElement>} */ (el.querySelectorAll('.kp-heat__label-button[aria-pressed="true"]'));
            LIT.set(el, new Set([...pressed].map((b) => b.dataset.key ?? '')));
            if (!el.querySelector(`${HEAT_CELL}[tabindex="0"]`)) placeStop(el, HEAT_CELL, undefined);
        }
    }

    /**
     * A row label lights its row; a cell picks its column; a tap on a row whose cells are too small for a finger opens that row's
     * days instead (js/heat/days.js) [heatstates-1102].
     * @param {Event} event
     */
    onClick(event) {
        const el = this.host;
        const target = /** @type {Element} */ (event.target);
        // A click the keys made (detail 0) has no pointer, whatever pressed last.
        const pointer = /** @type {MouseEvent} */ (event).detail === 0 ? '' : this.pointer;
        this.pointer = '';
        const label = /** @type {HTMLElement | null} */ (target.closest('.kp-heat__label-button'));
        if (label && el.contains(label)) return this.pressLabel(label);
        const cell = /** @type {HTMLElement | null} */ (target.closest(HEAT_CELL));
        const row = /** @type {HTMLElement | null} */ (target.closest('.kp-heat__row:not(.kp-heat__axis)'));
        if (row && el.contains(row) && opensDays(el, row, pointer)) return this.days.open(row, cell && el.contains(cell) ? cell : null);
        if (!cell || !el.contains(cell) || cell.hasAttribute('aria-disabled')) return;
        pressCell(el, cell);
    }

    /** @param {HTMLElement} label */
    pressLabel(label) {
        const el = this.host;
        const key = label.dataset.key ?? '';
        const keys = new Set(LIT.get(el) ?? []);
        const pressed = !keys.has(key);
        if (!el.hasAttribute('data-kp-heat-owned')) {
            if (pressed) keys.add(key);
            else keys.delete(key);
            setHeatRows(el, [...keys]);
        }
        el.dispatchEvent(new CustomEvent(HEAT_ROW_EVENT, { bubbles: true, detail: { key, pressed, keys: [...keys] } }));
    }

    /** Arrows, Home and End move the stop; PageUp and PageDown page; Escape lets go of the pick. @param {KeyboardEvent} event */
    onKey(event) {
        const el = this.host;
        const cell = cellOf(el, event, HEAT_CELL);
        if (!cell) return;
        if (event.key === 'PageUp' || event.key === 'PageDown') return this.page(event);
        if (event.key === 'Escape') return this.unpick(event, cell);
        const grid = cellGrid(el, HEAT_CELL);
        const moved = this.moveFrom(grid, cell, event);
        if (!moved) return;
        event.preventDefault();
        const { r, c, askLatest } = moved;
        const to = grid[r]?.[c];
        if (!to) return;
        STOPS.set(el, { r, c });
        placeStop(el, HEAT_CELL, { r, c });
        to.focus();
        // Asked once the focus stands on the edge: a page that redraws the grid keeps it there.
        if (askLatest) el.dispatchEvent(new CustomEvent(HEAT_PAGE_EVENT, { bubbles: true, detail: { direction: 'latest' } }));
    }

    /**
     * Where an arrow, Home or End moves the stop from `cell`, or null for another key.
     * @param {HTMLElement[][]} grid @param {HTMLElement} cell @param {KeyboardEvent} event
     * @returns {{ r: number, c: number, askLatest: boolean } | null}
     */
    moveFrom(grid, cell, event) {
        let r = Number(cell.dataset.r);
        let c = Number(cell.dataset.c);
        const rowsN = grid.length;
        const colsN = (grid[r] ?? []).length;
        const key = event.key;
        let askLatest = false;
        if (key === 'ArrowRight') c = Math.min(colsN - 1, c + 1);
        else if (key === 'ArrowLeft') c = Math.max(0, c - 1);
        else if (key === 'ArrowDown') r = Math.min(rowsN - 1, r + 1);
        else if (key === 'ArrowUp') r = Math.max(0, r - 1);
        else if (key === 'Home' || key === 'End') {
            c = key === 'Home' ? 0 : colsN - 1;
            if (event.ctrlKey) r = key === 'Home' ? 0 : rowsN - 1;
            // The key towards the newest column asks the page for the newest columns too [kpadopt3].
            const latest = this.host.getAttribute('data-kp-heat-latest');
            askLatest = latest !== null && key === (latest === 'start' ? 'Home' : 'End');
        } else return null;
        return { r, c, askLatest };
    }

    /** PageUp asks for earlier columns, PageDown for later ones; a grid with a paging bar pages by it [wish-1120]. @param {KeyboardEvent} event */
    page(event) {
        const el = this.host;
        event.preventDefault();
        const earlier = event.key === 'PageUp';
        /** @type {{ direction: string, offset?: number }} */
        const detail = { direction: earlier ? 'earlier' : 'later' };
        // So the keys and the buttons agree.
        if (PAGING.has(el)) {
            const bound = PAGING.get(el) ?? {};
            const next = heatOffset(el) + (earlier ? 1 : -1);
            if ((bound.max !== undefined && next > bound.max) || next < (bound.min ?? 0)) return;
            detail.offset = next;
            if (!el.hasAttribute('data-kp-heat-owned')) setHeatPaging(el, { offset: next });
        }
        el.dispatchEvent(new CustomEvent(HEAT_PAGE_EVENT, { bubbles: true, detail }));
    }

    /** @param {KeyboardEvent} event @param {HTMLElement} cell */
    unpick(event, cell) {
        const el = this.host;
        if (el.getAttribute('data-kp-heat-picked') == null) return;
        event.preventDefault();
        if (!el.hasAttribute('data-kp-heat-owned')) setHeatPick(el, null);
        el.dispatchEvent(new CustomEvent(HEAT_PICK_EVENT, { bubbles: true, detail: { rowKey: cell.dataset.rowKey, colKey: null, cell, picked: false } }));
    }
}

/**
 * Wire every heat grid under `root`: pick, row labels, keys.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachHeats(root = document) {
    const doc = root instanceof Document ? root : /** @type {Element} */ (root).ownerDocument;
    attachHoverCards(doc);
    return attachAll(root, HEAT, HeatGrid);
}

/**
 * Open the list of one row's days from the page (an app's own "Days" button, a review page's opened state) [heatstates-1102]: the
 * day of `colKey` takes the focus, else the picked one, else the newest. A grid that is not wired, or has no such row, opens nothing.
 * @param {HTMLElement} el the grid @param {string} rowKey @param {string} [colKey]
 * @returns {boolean} whether it opened
 */
export function openHeatDays(el, rowKey, colKey) {
    const grid = controllerOf(el, HeatGrid);
    const row = [...el.querySelectorAll('.kp-heat__row:not(.kp-heat__axis)')].find((r) => r instanceof HTMLElement && r.dataset.rowKey === rowKey);
    if (!grid || !(row instanceof HTMLElement) || !row.querySelector(HEAT_CELL)) return false;
    const cell = [.../** @type {NodeListOf<HTMLElement>} */ (row.querySelectorAll(HEAT_CELL))].find((c) => c.dataset.colKey === colKey) ?? null;
    grid.days.open(row, cell);
    return true;
}

/** Close a grid's list of days, the focus left where it is. @param {HTMLElement} el */
export function closeHeatDays(el) {
    controllerOf(el, HeatGrid)?.days.close(false);
}
