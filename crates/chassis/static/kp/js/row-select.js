// Rows ticked with the keyboard and with Shift-click [kpadopt5; homelab's Overview keys, kyu's dead letters].
//
// A table or a list of rows that carry a checkbox (`data-kp-select-row`) is
// worked down without the mouse: j and k walk a cursor from row to row, x ticks
// the row under it, Shift+x ticks everything from the last tick to the cursor,
// Esc unticks all, Enter on a row opens it (`kp-row-open`, as js/actions.js'
// row keys do). Shift-click on a checkbox ticks the range from the last one a
// plain click ticked; a plain click still toggles one row, so nobody needs
// Shift. It is on for every data table that has a select column and for any
// element marked `data-kp-select-keys`; `data-kp-select-keys="false"` turns it
// off.
//
//   <div class="kp-datatable" data-kp-datatable data-kp-select-range="shift">…</div>
//   <ul data-kp-select-keys> <li data-kp-row-key="a"><input type="checkbox" data-kp-select-row>…
//
// The module only sets the boxes and fires `change` on each, so the data table
// (or the page's own list) hears a tick the way it hears a click; it keeps
// nothing of its own but the cursor. Options, as attributes on the element and
// as the second argument of attachRowSelect():
//
//   data-kp-select-range   `shift` (default) | `off`
//   data-kp-select-arrows  the arrow keys walk too, on by default, `false` turns them off (never inside a `data-kp-grid`, which owns them)
//   data-kp-select-all-key Ctrl+A ticks every row shown, `Ctrl+Shift+A` unticks them: on by default, `false` turns it off
//   data-kp-cursor-scroll  `nearest` (default) | `center`
//   data-kp-select-hint    an element in the page; the keys are written into it as a `.kp-keys` line
//
// Rows hidden by a filter are not in the walk; rows whose box is disabled are
// walked over by a range and counted in what is said ("2 skipped: cannot be
// selected"). The cursor is a ring on the row (`is-cursor`), not a fill, so a
// ticked row and the cursor row read apart. It survives a refresh by the row's
// key. On a phone a long press on a row starts selection mode: every tap on a
// row then ticks it, until the last tick goes (`data-kp-selecting`).

import { getStrings } from './strings.js';
import { setKeys } from './keys.js';

/** An element that gets the keys whether or not it is a data table. */
export const ROW_SELECT = '[data-kp-select-keys]';
/** A data table that carries a select column gets them too. */
export const ROW_SELECT_AUTO = '[data-kp-datatable]:has([data-kp-select-row])';
/** The boxes this module sets. */
export const SELECT_BOX = '[data-kp-select-row]';
/** Fired on the element after this module changed the ticks: `{ keys, count, source, skipped }`. */
export const ROW_SELECT_EVENT = 'kp-rows-select';
/** Fired on a row when Enter is pressed on the row itself, the event js/actions.js' row keys fire too: `{ row }`. */
export const ROW_OPEN_EVENT = 'kp-row-open';
/** The cursor row. */
export const CURSOR_CLASS = 'is-cursor';
/** How long a finger rests on a row before selection mode starts [ms]. */
export const LONG_PRESS_MS = 500;

/**
 * @typedef {object} RowSelectOptions
 * @property {'shift' | 'off'} [range]
 * @property {boolean} [arrows]
 * @property {boolean} [allKey]
 * @property {'nearest' | 'center'} [scroll]
 */

/** @param {Element} el @param {string} name */
const flag = (el, name) => el.hasAttribute(name) && el.getAttribute(name) !== 'false';
/** An option that is on unless the attribute says `false` (Kenny, 2026-10-17: the arrows walk and Ctrl+A ticks, by default). @param {Element} el @param {string} name */
const onByDefault = (el, name) => el.getAttribute(name) !== 'false';

/** Every box of the element in document order. @param {Element} el @returns {HTMLInputElement[]} */
const boxesOf = (el) => /** @type {HTMLInputElement[]} */ ([...el.querySelectorAll(SELECT_BOX)]).filter((b) => b instanceof HTMLInputElement);

/** The row a box belongs to. @param {Element} box @returns {HTMLElement | null} */
const rowOf = (box) => /** @type {HTMLElement | null} */ (box.closest('[data-kp-row-key], tr, li, [role="row"]'));

/** @param {HTMLElement} row @param {number} index */
const keyOfRow = (row, index) =>
    row.dataset.kpRowKey ?? (row.id || /** @type {HTMLInputElement | null} */ (row.querySelector(SELECT_BOX))?.value || `row-${index}`);

/** @param {HTMLElement} row */
const labelOfRow = (row) => {
    const box = row.querySelector(SELECT_BOX);
    const named = row.dataset.kpRowLabel ?? box?.getAttribute('aria-label')?.replace(/^select\s+/i, '');
    return (named ?? row.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
};

/** A row the walk may land on: in the page and not hidden by a filter or a page. @param {HTMLElement} row */
const shown = (row) => !row.hidden && !row.closest('[hidden]');

/** A box a tick may reach. @param {HTMLInputElement} box */
const tickable = (box) => !box.disabled && box.getAttribute('aria-disabled') !== 'true';

/** The handle of each element. @type {WeakMap<Element, RowSelectHandle>} */
const HANDLES = new WeakMap();

/**
 * @typedef {object} RowSelectHandle
 * @property {() => string[]} keys the keys of every ticked row
 * @property {() => string | null} cursor the key of the cursor row
 * @property {(key: string | null) => void} moveTo put the cursor on a row, or take it away
 * @property {() => void} clear untick everything
 */

/**
 * The keys of every ticked row under `el`.
 * @param {Element} el
 * @returns {string[]}
 */
export function rowSelectKeys(el) {
    const known = HANDLES.get(el);
    if (known) return known.keys();
    return boxesOf(el)
        .filter((b) => b.checked)
        .map((b, i) => {
            const row = rowOf(b);
            return row ? keyOfRow(row, i) : '';
        });
}

/**
 * The handle of an element that has the keys.
 * @param {Element} el
 * @returns {RowSelectHandle | null}
 */
export function rowSelect(el) {
    return HANDLES.get(el) ?? null;
}

/**
 * Give one element the keys.
 * @param {HTMLElement} el
 * @param {RowSelectOptions} [options]
 * @returns {() => void} detach
 */
function attachOne(el, options = {}) {
    if (HANDLES.has(el)) return () => undefined;
    const doc = el.ownerDocument;
    // The options are read when they are used, so a page that flips an attribute is heard at once.
    const isRange = () => (options.range ?? el.getAttribute('data-kp-select-range') ?? 'shift') !== 'off';
    const owned = () => el.matches('[data-kp-grid]') || el.querySelector('[data-kp-grid]') !== null;
    const useArrows = () => (options.arrows ?? onByDefault(el, 'data-kp-select-arrows')) && !owned();
    const useAllKey = () => options.allKey ?? onByDefault(el, 'data-kp-select-all-key');
    const scrollTo = () => ((options.scroll ?? el.getAttribute('data-kp-cursor-scroll')) === 'center' ? 'center' : 'nearest');

    const live = doc.createElement('div');
    live.className = 'kp-sr-only';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    el.append(live);
    /** @param {string} text */
    const say = (text) => {
        live.textContent = '';
        // A second identical sentence is still heard: the text is set a frame later.
        el.ownerDocument.defaultView?.requestAnimationFrame(() => (live.textContent = text));
    };

    /** Every row with a box, shown or not, in the order they are drawn. @returns {HTMLElement[]} */
    const allRows = () => {
        /** @type {HTMLElement[]} */
        const out = [];
        for (const box of boxesOf(el)) {
            const row = rowOf(box);
            if (row && !out.includes(row)) out.push(row);
        }
        return out;
    };
    /** The rows the walk may land on, in the order they are drawn. @returns {HTMLElement[]} */
    const rows = () => allRows().filter(shown);
    /** @param {HTMLElement} row @returns {HTMLInputElement | null} */
    const boxOf = (row) => /** @type {HTMLInputElement | null} */ (row.querySelector(SELECT_BOX));
    /** @type {string | null} */
    let cursorKey = null;
    /** The key of the row last ticked by a click or a key, the start of the next range. @type {string | null} */
    let anchorKey = null;
    /** @param {string | null} key */
    const rowByKey = (key) => (key === null ? null : (rows().find((r, i) => keyOfRow(r, i) === key) ?? null));

    const keys = () =>
        boxesOf(el)
            .filter((b) => b.checked)
            .map((b, i) => keyOfRow(rowOf(b) ?? el, i));
    const count = () => boxesOf(el).filter((b) => b.checked).length;

    /**
     * Rows are focusable, one of them in the tab order. Every row, hidden or not: the walk skips a hidden row, the
     * roving tabindex does not. Only shown rows were made roving until 11.0.0, and nothing settles again when a row
     * or a section around the element is shown later (a `hidden` flip is not a child added), so a row a data table's
     * page or a hidden section kept out at attach stayed out of the walk once shown, and the markup depended on which
     * of the two modules attached first (tests/auto-lazy.spec.mjs: the catalogue's tables, the fixture's paged row).
     * The tab stop is the cursor row, else the first shown row, else the first row.
     */
    const settle = () => {
        const every = allRows();
        const current = rowByKey(cursorKey);
        const stop = current ?? every.find(shown) ?? every[0];
        for (const row of every) {
            if (!row.hasAttribute('tabindex') || row.hasAttribute('data-kp-roving')) {
                row.setAttribute('data-kp-roving', '');
                row.tabIndex = row === stop ? 0 : -1;
            }
            row.classList.toggle(CURSOR_CLASS, row === current);
            if (row === current) row.setAttribute('aria-current', 'true');
            else row.removeAttribute('aria-current');
        }
    };

    /** @param {HTMLElement | null} row @param {{ focus?: boolean }} [how] */
    const place = (row, { focus = true } = {}) => {
        const list = rows();
        cursorKey = row ? keyOfRow(row, list.indexOf(row)) : null;
        // Every row, so a hidden one keeps no tab stop of its own.
        for (const r of allRows()) {
            if (r.hasAttribute('data-kp-roving')) r.tabIndex = r === row ? 0 : -1;
            r.classList.toggle(CURSOR_CLASS, r === row);
            if (r === row) r.setAttribute('aria-current', 'true');
            else r.removeAttribute('aria-current');
        }
        if (row && focus) {
            row.focus({ preventScroll: true });
            row.scrollIntoView({ block: scrollTo(), inline: 'nearest' });
        }
    };

    /** @param {HTMLInputElement} box @param {boolean} checked */
    const setBox = (box, checked) => {
        if (box.checked === checked || !tickable(box)) return false;
        box.checked = checked;
        box.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    };
    /** @param {string} source @param {number} [skipped] */
    const fire = (source, skipped = 0) => {
        el.dispatchEvent(new CustomEvent(ROW_SELECT_EVENT, { bubbles: true, detail: { keys: keys(), count: count(), source, skipped } }));
    };

    /** Set the boxes from the anchor to a row. @param {HTMLElement} to @param {boolean} checked */
    const tickRange = (to, checked) => {
        const list = rows();
        const from = rowByKey(anchorKey) ?? to;
        const a = list.indexOf(from);
        const b = list.indexOf(to);
        if (a < 0 || b < 0) return { changed: 0, skipped: 0 };
        let changed = 0;
        let skipped = 0;
        for (const row of list.slice(Math.min(a, b), Math.max(a, b) + 1)) {
            const box = boxOf(row);
            if (!box) continue;
            if (!tickable(box)) {
                skipped += 1;
                continue;
            }
            if (setBox(box, checked)) changed += 1;
        }
        return { changed, skipped };
    };

    /** @param {string} source @param {number} skipped */
    const said = (source, skipped) => {
        const strings = getStrings();
        say([strings.rowSelectCount(count()), skipped > 0 ? strings.rowSelectSkipped(skipped) : ''].filter(Boolean).join('. '));
        fire(source, skipped);
    };

    /** @param {KeyboardEvent} event */
    const onKey = (event) => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!target) return;
        if (target.closest('textarea, select, [contenteditable]')) return;
        if (target instanceof HTMLInputElement && !target.matches(SELECT_BOX) && target.type !== 'button') return;
        const list = rows();
        const inRow = list.find((r) => r === target || r.contains(target)) ?? null;
        const key = event.key;
        const bare = !event.ctrlKey && !event.metaKey && !event.altKey;
        const strings = getStrings();

        // Esc unticks all, only when there is something to untick, so it never steals a dialog's Esc.
        if (key === 'Escape' && bare && count() > 0 && (inRow || target === el)) {
            event.preventDefault();
            for (const box of boxesOf(el)) setBox(box, false);
            anchorKey = null;
            el.removeAttribute('data-kp-selecting');
            say(strings.selectionCleared);
            fire('clear');
            return;
        }
        if (useAllKey() && (event.ctrlKey || event.metaKey) && key.toLowerCase() === 'a' && (inRow || target === el)) {
            event.preventDefault();
            const on = !event.shiftKey;
            let changed = 0;
            for (const row of list) {
                const box = boxOf(row);
                if (box && setBox(box, on)) changed += 1;
            }
            say(on ? strings.rowSelectAllShown(list.length) : strings.rowSelectCount(count()));
            fire(on ? 'all' : 'clear');
            return;
        }
        if (!bare || !inRow) return;
        const at = list.indexOf(inRow);
        const down = key === 'j' || (useArrows() && key === 'ArrowDown');
        const up = key === 'k' || (useArrows() && key === 'ArrowUp');
        if (down || up) {
            event.preventDefault();
            const to = list[Math.max(0, Math.min(list.length - 1, at + (down ? 1 : -1)))];
            el.setAttribute('data-kp-cursor-visible', '');
            place(to);
            say(strings.rowSelectCursor(labelOfRow(to), list.indexOf(to) + 1, list.length));
            return;
        }
        if (key === 'Home' && target === inRow) {
            event.preventDefault();
            el.setAttribute('data-kp-cursor-visible', '');
            place(list[0]);
            return;
        }
        if (key === 'End' && target === inRow) {
            event.preventDefault();
            el.setAttribute('data-kp-cursor-visible', '');
            place(list[list.length - 1]);
            return;
        }
        if (key.toLowerCase() === 'x' && !event.shiftKey) {
            event.preventDefault();
            const row = rowByKey(cursorKey) ?? inRow;
            const box = boxOf(row);
            if (!box || !tickable(box)) {
                say(strings.rowSelectSkipped(1));
                return;
            }
            el.setAttribute('data-kp-cursor-visible', '');
            place(row, { focus: row !== inRow });
            setBox(box, !box.checked);
            if (box.checked) anchorKey = keyOfRow(row, list.indexOf(row));
            said('key', 0);
            return;
        }
        if (key.toLowerCase() === 'x' && event.shiftKey) {
            event.preventDefault();
            const row = rowByKey(cursorKey) ?? inRow;
            el.setAttribute('data-kp-cursor-visible', '');
            const { skipped } = tickRange(row, true);
            anchorKey = keyOfRow(row, list.indexOf(row));
            said('range', skipped);
            return;
        }
        if (key === 'Enter' && target === inRow) {
            event.preventDefault();
            inRow.dispatchEvent(new CustomEvent(ROW_OPEN_EVENT, { bubbles: true, detail: { row: inRow } }));
        }
    };

    /** Follows the box the reader ticks with the mouse: the next range starts here. @param {Event} event */
    const onChange = (event) => {
        const box = event.target instanceof HTMLInputElement && event.target.matches(SELECT_BOX) ? event.target : null;
        if (!box) return;
        const row = rowOf(box);
        if (row && box.checked) anchorKey = keyOfRow(row, rows().indexOf(row));
        if (count() === 0) el.removeAttribute('data-kp-selecting');
    };

    /** Shift-click on a box ticks the range from the last tick [data-kp-select-range]. @param {MouseEvent} event */
    const onClick = (event) => {
        const box = event.target instanceof HTMLInputElement && event.target.matches(SELECT_BOX) ? event.target : null;
        if (!box) return;
        const row = rowOf(box);
        if (!row) return;
        place(row, { focus: false });
        if (!isRange() || !event.shiftKey || anchorKey === null) return;
        // The box has already flipped when the click is heard: the range takes its new state.
        const { skipped } = tickRange(row, box.checked);
        anchorKey = keyOfRow(row, rows().indexOf(row));
        said('range', skipped);
    };
    /** A shift-press on a box would select the text between rows. @param {MouseEvent} event */
    const onDown = (event) => {
        if (isRange() && event.shiftKey && event.target instanceof Element && event.target.matches(SELECT_BOX)) event.preventDefault();
        el.removeAttribute('data-kp-cursor-visible');
    };

    // Selection mode on a phone: a long press on a row, then taps.
    /** @type {ReturnType<typeof setTimeout> | null} */
    let hold = null;
    let heldRow = false;
    /** @param {PointerEvent} event */
    const onPressStart = (event) => {
        if (event.pointerType !== 'touch') return;
        const target = event.target instanceof Element ? event.target : null;
        const row = target?.closest('[data-kp-row-key], tr, li, [role="row"]');
        if (!row || !(row instanceof HTMLElement) || target?.closest('a, button, input, select, textarea')) return;
        const box = boxOf(row);
        if (!box || !tickable(box)) return;
        hold = setTimeout(() => {
            hold = null;
            heldRow = true;
            el.setAttribute('data-kp-selecting', '');
            setBox(box, true);
            anchorKey = keyOfRow(row, rows().indexOf(row));
            say(getStrings().rowSelectMode);
            fire('mode');
        }, LONG_PRESS_MS);
    };
    const onPressEnd = () => {
        if (hold) clearTimeout(hold);
        hold = null;
    };
    /** @param {MouseEvent} event */
    const onTap = (event) => {
        if (heldRow) {
            heldRow = false;
            event.preventDefault();
            return;
        }
        if (!el.hasAttribute('data-kp-selecting')) return;
        const target = event.target instanceof Element ? event.target : null;
        if (!target || target.closest('a, button, input, select, textarea')) return;
        const row = target.closest('[data-kp-row-key], tr, li, [role="row"]');
        const box = row instanceof HTMLElement ? boxOf(row) : null;
        if (!box || !tickable(box)) return;
        setBox(box, !box.checked);
        if (count() === 0) {
            el.removeAttribute('data-kp-selecting');
            say(getStrings().rowSelectModeEnd);
        } else said('mode', 0);
    };

    /** @param {FocusEvent} event */
    const onFocusIn = (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const row = target?.closest('[data-kp-roving]');
        if (row instanceof HTMLElement && row !== rowByKey(cursorKey)) place(row, { focus: false });
    };

    el.addEventListener('keydown', onKey);
    el.addEventListener('change', onChange, true);
    el.addEventListener('click', onClick);
    el.addEventListener('mousedown', onDown);
    el.addEventListener('pointerdown', onPressStart);
    el.addEventListener('pointerup', onPressEnd);
    el.addEventListener('pointercancel', onPressEnd);
    el.addEventListener('pointermove', onPressEnd);
    el.addEventListener('click', onTap, true);
    el.addEventListener('focusin', onFocusIn);
    // A refresh: rows come and go, the cursor stays on its key.
    const view = doc.defaultView;
    const watcher = view && 'MutationObserver' in view ? new view.MutationObserver(() => settle()) : null;
    watcher?.observe(el, { childList: true, subtree: true });
    settle();

    const hint = /** @type {HTMLElement | null} */ (
        el.querySelector('[data-kp-select-hint]') ?? doc.querySelector(`[data-kp-select-hint="${el.id}"]`)
    );
    if (hint) {
        const strings = getStrings();
        /** @type {import('./keys.js').KeyPair[]} */
        const pairs = [
            [['j', 'k'], strings.rowKeysMove],
            ['x', strings.rowKeysTick],
            [['Shift', 'x'], strings.rowKeysRange],
            ['Esc', strings.rowKeysClear],
            ['Enter', strings.rowKeysOpen],
        ];
        if (useAllKey()) pairs.push([['Mod', 'A'], strings.rowKeysAll]);
        setKeys(hint, pairs);
    }

    HANDLES.set(el, {
        keys,
        cursor: () => cursorKey,
        moveTo: (key) => place(rowByKey(key), { focus: false }),
        clear: () => {
            for (const box of boxesOf(el)) setBox(box, false);
            anchorKey = null;
            fire('clear');
        },
    });
    return () => {
        el.removeEventListener('keydown', onKey);
        el.removeEventListener('change', onChange, true);
        el.removeEventListener('click', onClick);
        el.removeEventListener('mousedown', onDown);
        el.removeEventListener('pointerdown', onPressStart);
        el.removeEventListener('pointerup', onPressEnd);
        el.removeEventListener('pointercancel', onPressEnd);
        el.removeEventListener('pointermove', onPressEnd);
        el.removeEventListener('click', onTap, true);
        el.removeEventListener('focusin', onFocusIn);
        watcher?.disconnect();
        live.remove();
        for (const row of el.querySelectorAll('[data-kp-roving]')) {
            row.removeAttribute('data-kp-roving');
            row.removeAttribute('tabindex');
            row.classList.remove(CURSOR_CLASS);
            row.removeAttribute('aria-current');
        }
        el.removeAttribute('data-kp-selecting');
        el.removeAttribute('data-kp-cursor-visible');
        HANDLES.delete(el);
    };
}

/**
 * Give every table and list under `root` that has select boxes the keys.
 * @param {ParentNode} [root]
 * @param {RowSelectOptions} [options]
 * @returns {() => void} detach
 */
export function attachRowSelect(root = document, options = {}) {
    const found = new Set(/** @type {HTMLElement[]} */ ([...root.querySelectorAll(`${ROW_SELECT}, ${ROW_SELECT_AUTO}`)]));
    if (root instanceof HTMLElement && root.matches(`${ROW_SELECT}, ${ROW_SELECT_AUTO}`)) found.add(root);
    /** @type {(() => void)[]} */
    const undo = [];
    for (const el of found) {
        if (el.getAttribute('data-kp-select-keys') === 'false') continue;
        undo.push(attachOne(el, options));
    }
    return () => undo.forEach((u) => u());
}
