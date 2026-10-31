// One element with row keys: the keys (walk, tick, range, all, clear, open), the mouse and touch ticks, and the wiring.

import { setKeys } from '../keys.js';
import { getStrings } from '../strings.js';
import { RowSelectCore } from './core.js';
import { CONTROLS, CURSOR_CLASS, LONG_PRESS_MS, ROW_LIKE, ROW_OPEN_EVENT, SELECT_BOX, boxOf, labelOfRow, rowOf, tickable } from './rows.js';

/** Fields a key on a row may come from; any other input keeps its own keys. */
const TEXT_ENTRY = 'textarea, select, [contenteditable]';

export class RowSelector extends RowSelectCore {
    /** @param {HTMLElement} el @param {import('../row-select.js').RowSelectOptions} [options] */
    constructor(el, options = {}) {
        super(el, options);
        /** The long press that starts selection mode on a phone. @type {ReturnType<typeof setTimeout> | null} */
        this.hold = null;
        /** Whether the last press became selection mode, so its own click does not untick the row again. */
        this.heldRow = false;
        /** What a page gets back from rowSelect(el). @type {import('../row-select.js').RowSelectHandle} */
        this.handle = {
            keys: () => this.keys(),
            cursor: () => this.cursorKey,
            moveTo: (key) => this.place(this.rowByKey(key), { focus: false }),
            clear: () => {
                this.clearAll();
                this.fire('clear');
            },
        };
    }

    connect() {
        const el = this.host;
        this.mountVoice();
        // Registered first, so it runs last: the markup this module added goes once the listeners and the observer are gone.
        this.own(() => this.unmark());
        this.listen(el, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(el, 'change', (event) => this.onChange(event), true);
        this.listen(el, 'click', (event) => this.onClick(/** @type {MouseEvent} */ (event)));
        this.listen(el, 'mousedown', (event) => this.onDown(/** @type {MouseEvent} */ (event)));
        this.listen(el, 'pointerdown', (event) => this.onPressStart(/** @type {PointerEvent} */ (event)));
        for (const type of ['pointerup', 'pointercancel', 'pointermove']) this.listen(el, type, () => this.onPressEnd());
        this.listen(el, 'click', (event) => this.onTap(/** @type {MouseEvent} */ (event)), true);
        this.listen(el, 'focusin', (event) => this.onFocusIn(event));
        this.own(() => this.onPressEnd());
        // A refresh: rows come and go, the cursor stays on its key.
        const view = this.doc.defaultView;
        if (view && 'MutationObserver' in view) this.observe(new view.MutationObserver(() => this.settle())).observe(el, { childList: true, subtree: true });
        this.settle();
        this.writeHint();
    }

    /** Take away the voice, the roving tab stops, the cursor and the mode marks. */
    unmark() {
        this.live.remove();
        for (const row of this.host.querySelectorAll('[data-kp-roving]')) {
            row.removeAttribute('data-kp-roving');
            row.removeAttribute('tabindex');
            row.classList.remove(CURSOR_CLASS);
            row.removeAttribute('aria-current');
        }
        this.host.removeAttribute('data-kp-selecting');
        this.host.removeAttribute('data-kp-cursor-visible');
    }

    /** The keys, written as a `.kp-keys` line into the element's `data-kp-select-hint`. */
    writeHint() {
        const el = this.host;
        const hint = /** @type {HTMLElement | null} */ (el.querySelector('[data-kp-select-hint]') ?? this.doc.querySelector(`[data-kp-select-hint="${el.id}"]`));
        if (!hint) return;
        const strings = getStrings();
        /** @type {import('../keys.js').KeyPair[]} */
        const pairs = [
            [['j', 'k'], strings.rowKeysMove],
            ['x', strings.rowKeysTick],
            [['Shift', 'x'], strings.rowKeysRange],
            ['Esc', strings.rowKeysClear],
            ['Enter', strings.rowKeysOpen],
        ];
        if (this.useAllKey()) pairs.push([['Mod', 'A'], strings.rowKeysAll]);
        setKeys(hint, pairs);
    }

    // --- The keys. ---

    /** @param {KeyboardEvent} event */
    onKey(event) {
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!target || target.closest(TEXT_ENTRY)) return;
        if (target instanceof HTMLInputElement && !target.matches(SELECT_BOX) && target.type !== 'button') return;
        const list = this.rows();
        const inRow = list.find((r) => r === target || r.contains(target)) ?? null;
        const bare = !event.ctrlKey && !event.metaKey && !event.altKey;
        const onElement = inRow !== null || target === this.host;
        // Esc unticks all, only when there is something to untick, so it never steals a dialog's Esc.
        if (event.key === 'Escape' && bare && this.count() > 0 && onElement) return this.escape(event);
        if (this.useAllKey() && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' && onElement) return this.tickShown(event, list);
        if (!bare || !inRow) return;
        if (this.walk(event, list, inRow)) return;
        const key = event.key;
        if (key.toLowerCase() === 'x') return event.shiftKey ? this.rangeKey(event, list, inRow) : this.tickKey(event, list, inRow);
        if (key === 'Enter' && target === inRow) {
            event.preventDefault();
            inRow.dispatchEvent(new CustomEvent(ROW_OPEN_EVENT, { bubbles: true, detail: { row: inRow } }));
        }
    }

    /** @param {KeyboardEvent} event */
    escape(event) {
        event.preventDefault();
        this.clearAll();
        this.host.removeAttribute('data-kp-selecting');
        this.say(getStrings().selectionCleared);
        this.fire('clear');
    }

    /** Ctrl+A ticks every row shown, Ctrl+Shift+A unticks them. @param {KeyboardEvent} event @param {HTMLElement[]} list */
    tickShown(event, list) {
        event.preventDefault();
        const on = !event.shiftKey;
        for (const row of list) {
            const box = boxOf(row);
            if (box) this.setBox(box, on);
        }
        const strings = getStrings();
        this.say(on ? strings.rowSelectAllShown(list.length) : strings.rowSelectCount(this.count()));
        this.fire(on ? 'all' : 'clear');
    }

    /**
     * j / k (and the arrows) walk one row, Home and End on a row go to the ends. Returns whether the key was one of these.
     * @param {KeyboardEvent} event @param {HTMLElement[]} list @param {HTMLElement} inRow
     */
    walk(event, list, inRow) {
        const key = event.key;
        const down = key === 'j' || (this.useArrows() && key === 'ArrowDown');
        const up = key === 'k' || (this.useArrows() && key === 'ArrowUp');
        const atRow = event.target === inRow;
        /** @type {HTMLElement | undefined} */
        let to;
        if (down || up) to = list[Math.max(0, Math.min(list.length - 1, list.indexOf(inRow) + (down ? 1 : -1)))];
        else if (key === 'Home' && atRow) to = list[0];
        else if (key === 'End' && atRow) to = list[list.length - 1];
        if (!to) return false;
        event.preventDefault();
        this.host.setAttribute('data-kp-cursor-visible', '');
        this.place(to);
        if (down || up) this.say(getStrings().rowSelectCursor(labelOfRow(to), list.indexOf(to) + 1, list.length));
        return true;
    }

    /** x ticks or unticks the cursor row. @param {KeyboardEvent} event @param {HTMLElement[]} list @param {HTMLElement} inRow */
    tickKey(event, list, inRow) {
        event.preventDefault();
        const row = this.rowByKey(this.cursorKey) ?? inRow;
        const box = boxOf(row);
        if (!box || !tickable(box)) return this.say(getStrings().rowSelectSkipped(1));
        this.host.setAttribute('data-kp-cursor-visible', '');
        this.place(row, { focus: row !== inRow });
        this.setBox(box, !box.checked);
        if (box.checked) this.anchorAt(row);
        this.said('key', 0);
    }

    /** Shift+x ticks everything from the last tick to the cursor. @param {KeyboardEvent} event @param {HTMLElement[]} list @param {HTMLElement} inRow */
    rangeKey(event, list, inRow) {
        event.preventDefault();
        const row = this.rowByKey(this.cursorKey) ?? inRow;
        this.host.setAttribute('data-kp-cursor-visible', '');
        const { skipped } = this.tickRange(row, true);
        this.anchorAt(row);
        this.said('range', skipped);
    }

    // --- The mouse, the finger and the focus. ---

    /** Follows the box the reader ticks with the mouse: the next range starts here. @param {Event} event */
    onChange(event) {
        if (!RowSelector.isBox(event.target)) return;
        const row = rowOf(event.target);
        if (row && event.target.checked) this.anchorAt(row);
        if (this.count() === 0) this.host.removeAttribute('data-kp-selecting');
    }

    /** Shift-click on a box ticks the range from the last tick [data-kp-select-range]. @param {MouseEvent} event */
    onClick(event) {
        const box = event.target;
        if (!RowSelector.isBox(box)) return;
        const row = rowOf(box);
        if (!row) return;
        this.place(row, { focus: false });
        if (!this.isRange() || !event.shiftKey || this.anchorKey === null) return;
        // The box has already flipped when the click is heard: the range takes its new state.
        const { skipped } = this.tickRange(row, box.checked);
        this.anchorAt(row);
        this.said('range', skipped);
    }

    /** A shift-press on a box would select the text between rows. @param {MouseEvent} event */
    onDown(event) {
        if (this.isRange() && event.shiftKey && event.target instanceof Element && event.target.matches(SELECT_BOX)) event.preventDefault();
        this.host.removeAttribute('data-kp-cursor-visible');
    }

    /** Selection mode on a phone: a long press on a row ticks it and starts the mode. @param {PointerEvent} event */
    onPressStart(event) {
        if (event.pointerType !== 'touch') return;
        const target = event.target instanceof Element ? event.target : null;
        const row = target?.closest(ROW_LIKE);
        if (!(row instanceof HTMLElement) || target?.closest(CONTROLS)) return;
        const box = boxOf(row);
        if (!box || !tickable(box)) return;
        this.hold = setTimeout(() => {
            this.hold = null;
            this.heldRow = true;
            this.host.setAttribute('data-kp-selecting', '');
            this.setBox(box, true);
            this.anchorAt(row);
            this.say(getStrings().rowSelectMode);
            this.fire('mode');
        }, LONG_PRESS_MS);
    }

    onPressEnd() {
        if (this.hold) clearTimeout(this.hold);
        this.hold = null;
    }

    /** In selection mode every tap on a row ticks it, until the last tick goes. @param {MouseEvent} event */
    onTap(event) {
        if (this.heldRow) {
            this.heldRow = false;
            event.preventDefault();
            return;
        }
        if (!this.host.hasAttribute('data-kp-selecting')) return;
        const target = event.target instanceof Element ? event.target : null;
        if (!target || target.closest(CONTROLS)) return;
        const row = target.closest(ROW_LIKE);
        const box = row instanceof HTMLElement ? boxOf(row) : null;
        if (!box || !tickable(box)) return;
        this.setBox(box, !box.checked);
        if (this.count() > 0) return this.said('mode', 0);
        this.host.removeAttribute('data-kp-selecting');
        this.say(getStrings().rowSelectModeEnd);
    }

    /** @param {Event} event */
    onFocusIn(event) {
        const row = event.target instanceof Element ? event.target.closest('[data-kp-roving]') : null;
        if (row instanceof HTMLElement && row !== this.rowByKey(this.cursorKey)) this.place(row, { focus: false });
    }
}
