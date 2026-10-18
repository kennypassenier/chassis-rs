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

/** A bar cell written in markup. */
export const BAR_CELL = '[data-kp-bar]';
/** The attribute a data table sorts a cell by. */
export const SORT_VALUE_ATTRIBUTE = 'data-kp-sort-value';

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
 * Write a bar cell: the meter, the number, and the sort value on the cell
 * around it.
 *
 * @param {HTMLElement} el  the `.kp-bar-cell` (made one when it is not)
 * @param {BarCell} cell
 */
export function setBarCell(el, { value = null, text, tone, warnAt = 0.75, badAt = 0.9, sortValue, mark = null, label, markLabel, loading = false }) {
    el.classList.add('kp-bar-cell');
    let meter = /** @type {HTMLElement | null} */ (el.querySelector(':scope > .kp-meter'));
    if (!meter) {
        meter = el.ownerDocument.createElement('span');
        meter.className = 'kp-meter';
        el.prepend(meter);
    }
    let number = /** @type {HTMLElement | null} */ (el.querySelector(':scope > .kp-bar-cell__value'));
    if (!number) {
        number = el.ownerDocument.createElement('span');
        number.className = 'kp-bar-cell__value';
        el.append(number);
    }
    const measured = value != null && Number.isFinite(value) && !loading;
    const auto = !measured
        ? null
        : /** @type {number} */ (value) >= badAt
          ? 'destructive'
          : /** @type {number} */ (value) >= warnAt
            ? 'warning'
            : null;
    setMeter(meter, { value: measured ? value : null, mark, tone: tone === undefined ? auto : tone, label, markLabel, loading });
    // While it loads the figure waits too, in the theme's own loading picture (a skeleton line of the column's width),
    // so the row never reads as empty (Kenny, 2026-10-16: "show loading toont enkel lege rijen en geen load animatie").
    if (loading) {
        const ghost = el.ownerDocument.createElement('span');
        ghost.className = 'kp-skeleton kp-bar-cell__ghost';
        ghost.setAttribute('aria-hidden', 'true');
        number.replaceChildren(ghost);
    } else number.textContent = text ?? (measured ? `${Math.round(/** @type {number} */ (value) * 100)}%` : '');
    el.toggleAttribute('data-kp-loading', loading);
    const sort =
        sortValue === undefined
            ? measured
                ? String(Math.round(/** @type {number} */ (value) * 1000) / 10)
                : ''
            : sortValue === null
              ? ''
              : String(sortValue);
    const holder = el.closest('td, th');
    if (holder) holder.setAttribute(SORT_VALUE_ATTRIBUTE, sort);
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

/**
 * Fill every `[data-kp-bar]` under `root` and keep it filled when its
 * attributes change.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachBarCells(root = document) {
    for (const el of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll(BAR_CELL))) fill(el);
    const doc = root instanceof Document ? root : /** @type {Element} */ (root).ownerDocument;
    const view = doc.defaultView;
    if (!view) return () => {};
    const watch = new view.MutationObserver((records) => {
        for (const record of records) {
            const el = /** @type {HTMLElement} */ (record.target);
            if (el.matches?.(BAR_CELL)) fill(el);
        }
    });
    watch.observe(root instanceof Document ? root.documentElement : /** @type {Node} */ (root), {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-kp-bar', 'data-kp-bar-text', 'data-kp-bar-tone', 'data-kp-bar-mark', 'data-kp-bar-loading'],
    });
    return () => watch.disconnect();
}
