// The drawn select: its test, its handles and its attach.
import { SelectControl } from './select-control.js';
import { selectHandles } from './handle.js';
/** @typedef {import('./types.js').SelectHandle} SelectHandle */

// ── The drawn select [scope-54, Kenny's form of 2026-09-13] ──────────────
//
// Firefox cannot style a native select's open list, so the one list in a
// form that did not wear the theme was the select's. A listbox in the
// combobox's look is laid over every single select the package styles —
// `select.kp-field__input` — without asking. It was an opt-in under scope-54;
// Kenny's form of 2026-09-13 made it the default, because a form whose one
// unthemed list is the select's is the fault the opt-in left in place:
//
//   <select class="kp-field__input">…</select>                        drawn
//   <select class="kp-field__input" data-kp-select="native">…</select> the browser's
//   <select multiple>…</select>                                        always the browser's
//
// A bare `data-kp-select` still asks for the drawn list on a select without
// the class, as it did in 6.1.
//
// The native select stays exactly where it was and stays the control: it
// keeps DOM focus, holds the value, submits with the form, fires `change`,
// and is what a screen reader reads (a single select is already a
// combobox to assistive technology, so `aria-expanded`, `aria-controls`
// and `aria-activedescendant` on it mean what they mean on the combobox's
// input). What is drawn is only the open list, a sibling directly after
// the select, rebuilt from the select's own options every time it opens —
// so a value or an option the page changed behind its back is what shows.

/**
 * Whether a select gets the drawn list: a single select that is the
 * package's field (`.kp-field__input`) or asks for it (`data-kp-select`),
 * unless it opts out with `data-kp-select="native"`.
 *
 * @param {Element} element
 * @returns {element is HTMLSelectElement}
 */
export function drawsSelect(element) {
    if (!(element instanceof HTMLSelectElement) || element.multiple) return false;
    const asked = element.getAttribute('data-kp-select');
    if (asked === 'native') return false;
    return asked !== null || element.classList.contains('kp-field__input');
}

/** The handle for an attached drawn select. @param {Element} element */
export function drawnSelect(element) {
    return selectHandles.get(element) ?? null;
}

/** The default time in ms a typed letter keeps counting as the same search. */
const TYPEAHEAD_MS = 500;

/**
 * Lay a drawn list over one select. Returns its detach.
 *
 * @param {HTMLSelectElement} select
 * @param {{ loop?: boolean, typeaheadMs?: number }} [options]
 * @returns {(() => void) & { handle: SelectHandle }}
 */
export function attachSelect(select, { loop = false, typeaheadMs = TYPEAHEAD_MS } = {}) {
    const control = new SelectControl(select, { loop, typeaheadMs });
    try {
        control.connect();
    } catch (error) {
        control.destroy();
        throw error;
    }
    return Object.assign(() => control.destroy(), { handle: control.handle });
}

/**
 * Lay a drawn list over every select under `root` that `drawsSelect` accepts:
 * each single `select.kp-field__input` and each `select[data-kp-select]`, but
 * never one marked `data-kp-select="native"` and never a multiple select
 * [scope-54; the default since Kenny's form of 2026-09-13].
 *
 * @param {ParentNode} [root]
 * @param {{ loop?: boolean, typeaheadMs?: number }} [options] Defaults; per select `data-kp-loop`.
 * @returns {(() => void) & { handles: SelectHandle[] }} detach
 */
export function attachSelects(root = document, options = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    /** @type {SelectHandle[]} */
    const created = [];
    const found = root instanceof Element && root.matches('select') ? [root] : [...root.querySelectorAll('select')];
    for (const element of found) {
        if (!drawsSelect(element)) continue;
        const select = element;
        if (select.dataset.kpSelectAttached !== undefined) continue;
        const loopFlag = select.dataset.kpLoop;
        const detach = attachSelect(select, { ...options, ...(loopFlag === undefined ? {} : { loop: loopFlag !== 'false' }) });
        cleanups.push(detach);
        created.push(detach.handle);
    }
    const detach = () => {
        for (const c of cleanups) c();
    };
    return Object.assign(detach, { handles: created });
}
