// A value with a proportional bar, inside a table cell [kpadopt2-grids; the
// admin dashboard's `mp-caps` and `mp-growth`: CPU, memory and disk per
// stack, a disk's fullness].
//
// It is the package's meter (`.kp-meter`, js/kpi.js) with its number beside
// it in a fixed column, so the bars of a column all start and end in the
// same places and the numbers line up on their end edge:
//
//   <td data-kp-sort-value="62">
//       <span class="kp-bar-cell" data-kp-bar="0.62" data-kp-bar-text="62%"></span>
//   </td>
//
// or from script:
//
//   setBarCell(span, { value: 0.62, text: '62%' });
//
// A data table sorts and range-filters by the cell's `data-kp-sort-value`
// (js/datatable.js), not by the text it shows, so a bar cell sorts by its
// number whatever the words say. `setBarCell()` writes it on the closest
// `td` / `th` for you; written by hand, it is on the `td`.
//
// The tone follows the share unless the page says otherwise: from `warnAt`
// (0.75) the fill is the warning colour, from `badAt` (0.9) the destructive
// one; the number carries a word as well for a screen reader (the meter's
// own `aria-valuetext`). A share of null is "not measured": the track stays,
// empty, and the number says why (`text`, "not read"); the cell keeps its
// size, so a row that arrives later moves nothing. `loading` shows the
// meter's loading picture at the same size and a skeleton line in place of
// the figure, both the register's own.
//
// Nothing runs on import. attachBarCells(root) fills every `[data-kp-bar]`
// under it and again whenever `data-kp-bar`, `data-kp-bar-text` or
// `data-kp-bar-tone` changes; it returns a detach.

import { setMeter } from './kpi.js';
import { Controller } from './controller.js';

/** A bar cell written in markup. */
export const BAR_CELL = '[data-kp-bar]';
/** The attribute a data table sorts a cell by. */
export const SORT_VALUE_ATTRIBUTE = 'data-kp-sort-value';

/** The share from which the fill turns to the warning colour, unless the page says otherwise. */
const WARN_AT = 0.75;
/** The share from which the fill turns to the destructive colour, unless the page says otherwise. */
const BAD_AT = 0.9;
/** A share of 1 is full; times this it is a percentage. */
const PERCENT = 100;
/** The default sort value is the percentage to one decimal: a share times this is that many tenths of a percent. */
const SORT_SCALE = 1000;
/** Tenths of a percent per percent. */
const SORT_TENTHS = 10;

/**
 * @typedef {object} BarCell
 * @property {number | null} [value]  the share, 0 up (1 is full); null is not measured
 * @property {string} [text]          the number beside the bar ("62%", "2.1 GB"); default the rounded percentage, or empty
 * @property {'warning' | 'destructive' | null} [tone]  the fill's colour; omit to let `warnAt` and `badAt` decide, null for none
 * @property {number} [warnAt]        from this share the fill is the warning colour (default 0.75)
 * @property {number} [badAt]         from this share the fill is the destructive colour (default 0.9)
 * @property {number | string | null} [sortValue]  what a data table sorts and filters this cell by; default the share as a percentage, '' when not measured
 * @property {number | null} [mark]   a tick on the bar (a limit, a target)
 * @property {string} [label]         what the share is, for a screen reader ("full")
 * @property {string} [markLabel]     what the mark is
 * @property {boolean} [loading]
 */

/**
 * The part of a cell with this class, made (and put first or last) when the cell has none.
 * @param {HTMLElement} el
 * @param {string} className
 * @param {'prepend' | 'append'} place
 * @returns {HTMLElement}
 */
function partOf(el, className, place) {
    const found = /** @type {HTMLElement | null} */ (el.querySelector(`:scope > .${className}`));
    if (found) return found;
    const part = el.ownerDocument.createElement('span');
    part.className = className;
    el[place](part);
    return part;
}

/**
 * The tone a share gets when the page names none.
 * @param {number | null} value the share, null when not measured
 * @param {number} warnAt
 * @param {number} badAt
 * @returns {'warning' | 'destructive' | null}
 */
function autoTone(value, warnAt, badAt) {
    if (value === null) return null;
    if (value >= badAt) return 'destructive';
    return value >= warnAt ? 'warning' : null;
}

/**
 * What a data table sorts this cell by.
 * @param {number | string | null | undefined} sortValue what the page gave
 * @param {number | null} measured the share, null when not measured
 * @returns {string}
 */
function sortText(sortValue, measured) {
    if (sortValue === undefined) return measured === null ? '' : String(Math.round(measured * SORT_SCALE) / SORT_TENTHS);
    return sortValue === null ? '' : String(sortValue);
}

/**
 * Write a bar cell: the meter, the number, and the sort value on the cell
 * around it.
 *
 * @param {HTMLElement} el  the `.kp-bar-cell` (made one when it is not)
 * @param {BarCell} cell
 */
export function setBarCell(
    el,
    { value = null, text, tone, warnAt = WARN_AT, badAt = BAD_AT, sortValue, mark = null, label, markLabel, loading = false },
) {
    el.classList.add('kp-bar-cell');
    const meter = partOf(el, 'kp-meter', 'prepend');
    const number = partOf(el, 'kp-bar-cell__value', 'append');
    const measured = value != null && Number.isFinite(value) && !loading ? value : null;
    setMeter(meter, { value: measured, mark, tone: tone === undefined ? autoTone(measured, warnAt, badAt) : tone, label, markLabel, loading });
    // While it loads the figure waits too, in the theme's own loading picture (a skeleton line of the column's width),
    // so the row never reads as empty (Kenny, 2026-10-16: "show loading toont enkel lege rijen en geen load animatie").
    if (loading) {
        const ghost = el.ownerDocument.createElement('span');
        ghost.className = 'kp-skeleton kp-bar-cell__ghost';
        ghost.setAttribute('aria-hidden', 'true');
        number.replaceChildren(ghost);
    } else number.textContent = text ?? (measured === null ? '' : `${Math.round(measured * PERCENT)}%`);
    el.toggleAttribute('data-kp-loading', loading);
    const holder = el.closest('td, th');
    if (holder) holder.setAttribute(SORT_VALUE_ATTRIBUTE, sortText(sortValue, measured));
}

/** @param {string | null} text */
const numberOf = (text) => (text == null || text.trim() === '' || !Number.isFinite(Number(text)) ? null : Number(text));

/** @param {HTMLElement} el */
function fill(el) {
    const tone = el.getAttribute('data-kp-bar-tone');
    setBarCell(el, {
        value: numberOf(el.getAttribute('data-kp-bar')),
        text: el.getAttribute('data-kp-bar-text') ?? undefined,
        tone: tone === 'warning' || tone === 'destructive' ? tone : tone === 'none' ? null : undefined,
        mark: numberOf(el.getAttribute('data-kp-bar-mark')),
        label: el.getAttribute('data-kp-bar-label') ?? undefined,
        loading: el.hasAttribute('data-kp-bar-loading'),
        warnAt: numberOf(el.getAttribute('data-kp-bar-warn')) ?? undefined,
        badAt: numberOf(el.getAttribute('data-kp-bar-bad')) ?? undefined,
    });
}

/** The watch of one root: it fills every bar cell under it and fills one again when its attributes change. */
class BarCellsController extends Controller {
    connect() {
        const root = /** @type {ParentNode} */ (/** @type {unknown} */ (this.host));
        for (const el of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll(BAR_CELL))) fill(el);
        const doc = root instanceof Document ? root : /** @type {Element} */ (root).ownerDocument;
        const view = doc.defaultView;
        if (!view) return;
        const watch = this.observe(
            new view.MutationObserver((records) => {
                for (const record of records) {
                    const el = /** @type {HTMLElement} */ (record.target);
                    if (el.matches?.(BAR_CELL)) fill(el);
                }
            }),
        );
        watch.observe(root instanceof Document ? root.documentElement : /** @type {Node} */ (root), {
            subtree: true,
            attributes: true,
            attributeFilter: ['data-kp-bar', 'data-kp-bar-text', 'data-kp-bar-tone', 'data-kp-bar-mark', 'data-kp-bar-loading'],
        });
    }
}

/**
 * Fill every `[data-kp-bar]` under `root` and keep it filled when its
 * attributes change.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachBarCells(root = document) {
    // Built directly, not keyed on the root: every attach call fills and watches on its own, as it always did.
    const controller = new BarCellsController(/** @type {HTMLElement} */ (/** @type {unknown} */ (root)));
    controller.connect();
    return () => controller.destroy();
}
