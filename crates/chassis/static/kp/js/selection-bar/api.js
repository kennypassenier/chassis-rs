// What a page tells a selection bar: feed it by hand, read it, say an action is running or how far it is, say how it
// ended, and the rules that turn an action off.

import { controllerOf } from '../controller.js';
import { getStrings } from '../strings.js';
import { SelectionBar } from './controller.js';
import { draw, parts, sync } from './draw.js';
import { BOX, keyOf, rowOf } from './model.js';

/** @typedef {import('./model.js').SelectionItem} SelectionItem */

/** The memory of an attached bar. @param {HTMLElement} bar */
const memoryOf = (bar) => controllerOf(bar, SelectionBar)?.memory;

/**
 * Feed the bar by hand, for a list that has no boxes to read (a board, a server's selection). The bar then ignores the boxes.
 * @param {HTMLElement} bar
 * @param {readonly (string | SelectionItem)[]} items the keys, or keys with the names to show
 * @param {{ matching?: number }} [options] `matching`: how many rows match in all, for the offer beyond these
 */
export function setSelection(bar, items, options = {}) {
    const memory = memoryOf(bar);
    if (!memory) return;
    memory.manual = true;
    if (options.matching !== undefined) memory.matchingTotal = options.matching;
    memory.items = items.map((i) => (typeof i === 'string' ? { key: i, label: i } : i));
    sync(bar, memory);
}

/**
 * What the bar holds now.
 * @param {HTMLElement} bar
 * @returns {{ keys: string[], items: SelectionItem[], count: number, matching: boolean }}
 */
export function getSelection(bar) {
    const memory = memoryOf(bar);
    if (!memory) return { keys: [], items: [], count: 0, matching: false };
    return {
        keys: memory.items.map((i) => i.key),
        items: memory.items,
        count: memory.matching ? memory.matchingTotal : memory.items.length,
        matching: memory.matching,
    };
}

/**
 * Say an action is running ("Backing up 3…"), or that it is done (no words). The buttons stop answering, the count gives way to the words in its own room.
 * @param {HTMLElement} bar
 * @param {string | null} [words] `null` or an empty string ends it
 */
export function setSelectionBusy(bar, words = '') {
    const memory = memoryOf(bar);
    if (!memory) return;
    memory.busy = words ? words : '';
    memory.progress = null;
    const live = bar.querySelector(':scope > .kp-selection__live');
    if (live && memory.busy) live.textContent = memory.busy;
    draw(bar, memory);
}

/**
 * Say how far a running action is, between its start and its end: "3 of 7 done" beside the busy words [wish-1120, homelab 112].
 * Call it after setSelectionBusy(); on a bar that is not busy it starts the busy state with the package's own words. The end is
 * still setSelectionBusy(bar, '') or setSelectionResult(), which take the progress away. A screen reader hears every quarter
 * (and the last) from the polite region, not every row. `done` is clamped to 0..`total`.
 * @param {HTMLElement} bar
 * @param {{ done: number, total: number }} progress
 */
export function setSelectionProgress(bar, progress) {
    const memory = memoryOf(bar);
    if (!memory) return;
    const total = Math.max(0, Math.floor(progress.total));
    const done = Math.min(total, Math.max(0, Math.floor(progress.done)));
    const before = memory.progress;
    if (!memory.busy) memory.busy = getStrings().selectionBusy('');
    memory.progress = { done, total };
    const quarter = (/** @type {number} */ n) => (total > 0 ? Math.floor((n / total) * 4) : 0);
    const live = bar.querySelector(':scope > .kp-selection__live');
    if (live && (!before || quarter(done) > quarter(before.done) || done === total)) live.textContent = getStrings().selectionProgress(done, total);
    draw(bar, memory);
}

/**
 * Say how an action ended when some rows refused it: "2 done, 1 refused: why", with a mark on each refused row.
 * @param {HTMLElement} bar
 * @param {{ done: number, refused: readonly { key: string, reason: string }[] }} result
 */
export function setSelectionResult(bar, result) {
    const memory = memoryOf(bar);
    if (!memory) return;
    const strings = getStrings();
    memory.busy = '';
    memory.progress = null;
    draw(bar, memory);
    const p = parts(bar, memory);
    const why = [...new Set(result.refused.map((r) => r.reason))].join('; ');
    p.result.textContent = result.refused.length
        ? `${strings.selectionResult(result.done, result.refused.length)}: ${why}`
        : strings.selectionResult(result.done, 0);
    p.result.removeAttribute('data-kp-selection-reasons');
    p.result.setAttribute('data-kp-selection-result', result.refused.length ? 'refused' : 'done');
    p.result.hidden = false;
    for (const source of memory.sources) {
        let index = 0;
        for (const box of source.querySelectorAll(BOX)) {
            const row = rowOf(box);
            if (!row) continue;
            const refusal = result.refused.find((r) => r.key === keyOf(row, index++));
            if (!refusal) continue;
            row.setAttribute('data-kp-refused', refusal.reason);
            if (!row.querySelector('.kp-selection__refusal')) {
                const note = row.ownerDocument.createElement('small');
                note.className = 'kp-selection__refusal';
                note.textContent = refusal.reason;
                const cell = row.matches('tr') ? (row.querySelector(':scope > th, :scope > td:nth-child(2)') ?? row.lastElementChild) : row;
                cell?.append(note);
            }
        }
    }
    const live = bar.querySelector(':scope > .kp-selection__live');
    if (live) live.textContent = p.result.textContent;
}

/**
 * Turn an action off, with the reason, for a selection it does not fit: the function answers the reason ("2 of 3 can be updated") or an empty string.
 * @param {HTMLElement} bar
 * @param {Record<string, (items: SelectionItem[]) => string | null>} rules by the action's id (`data-kp-selection-action`)
 */
export function setSelectionRules(bar, rules) {
    const memory = memoryOf(bar);
    if (!memory) return;
    memory.rules = rules;
    draw(bar, memory);
}
