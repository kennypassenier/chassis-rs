// One element whose rows are picked without boxes: Ctrl/Cmd+click, Shift+click, a long press on touch, and the key actions a page binds.

import { getStrings } from '../strings.js';
import { RowPickCore } from './core.js';
import { LONG_PRESS_MS, PRESS_SLOP_PX, PICK_ROW, keyOf, ownControl } from './rows.js';

/** @typedef {import('../row-pick.js').RowPickHandle} RowPickHandle */

export class RowPicker extends RowPickCore {
    /** @param {HTMLElement} el @param {Record<string, unknown>} [options] */
    constructor(el, options = {}) {
        super(el, options);
        /** The long press that starts selection mode on a phone. @type {ReturnType<typeof setTimeout> | null} */
        this.hold = null;
        this.pressAt = { x: 0, y: 0 };
        /** Whether the last press became a pick, so its own click does not toggle the row again. */
        this.heldRow = false;
        /** What a page gets back from rowPick(el). @type {RowPickHandle} */
        this.handle = {
            keys: () => this.keys(),
            cursor: () => this.cursorKey,
            moveTo: (key) => this.place(this.rowByKey(key)),
            set: (keys) => this.replacePicks(keys),
            next: () => this.step(1),
            prev: () => this.step(-1),
            toggle: () => this.toggleCursor(),
            extend: (direction) => this.extend(direction),
            clear: () => this.clearAll('clear'),
        };
    }

    connect() {
        const el = this.host;
        this.mountVoice();
        // Registered first, so it runs last: the marks go once the listeners and the observer are gone.
        this.own(() => this.unmark());
        // The capture phase: a click that picks never reaches the row's own handler (a title that opens a panel).
        this.listen(el, 'click', (event) => this.onClick(/** @type {MouseEvent} */ (event)), true);
        this.listen(el, 'dblclick', (event) => this.onDouble(/** @type {MouseEvent} */ (event)), true);
        this.listen(el, 'mousedown', (event) => this.onDown(/** @type {MouseEvent} */ (event)));
        this.listen(el, 'pointerdown', (event) => this.onPressStart(/** @type {PointerEvent} */ (event)));
        this.listen(el, 'pointermove', (event) => this.onPressMove(/** @type {PointerEvent} */ (event)));
        for (const type of ['pointerup', 'pointercancel']) this.listen(el, type, () => this.onPressEnd());
        this.listen(el, 'contextmenu', (event) => this.onContext(event));
        this.own(() => this.onPressEnd());
        const view = this.doc.defaultView;
        if (view && 'MutationObserver' in view) this.observe(new view.MutationObserver(() => this.settle())).observe(el, { childList: true, subtree: true });
        this.settle();
    }

    // --- The key actions: a page binds these in its own shortcut table. ---

    /** Move the cursor one row down (1) or up (-1) over the rows shown. @param {number} by */
    step(by) {
        const list = this.rows();
        if (list.length === 0) return;
        const at = list.findIndex((row) => keyOf(row) === this.cursorKey);
        this.host.setAttribute('data-kp-cursor-visible', '');
        this.place(list[at < 0 ? 0 : Math.max(0, Math.min(list.length - 1, at + by))] ?? null);
    }

    /** Pick or unpick the cursor row. */
    toggleCursor() {
        if (this.cursorKey !== null) this.toggle(this.cursorKey, 'key');
    }

    /** Move the cursor and pick everything from the anchor to it (the anchor is the cursor row when nothing starts a range). @param {number} direction 1 or -1 */
    extend(direction) {
        const list = this.rows();
        const at = list.findIndex((row) => keyOf(row) === this.cursorKey);
        if (list.length === 0 || (at < 0 && this.cursorKey !== null)) return;
        if (at >= 0) this.startRange();
        this.step(direction);
        if (this.cursorKey !== null) this.extendTo(this.cursorKey, 'range');
    }

    // --- The mouse and the finger. ---

    /** The row a pointer event is about: the innermost keyed row, none when it landed on one of the row's own controls. @param {Event} event */
    rowAt(event) {
        const target = event.target instanceof Element ? event.target : null;
        if (!target || ownControl(target, this.host.getAttribute('data-kp-pick-ignore') ?? '')) return null;
        const row = target.closest(PICK_ROW);
        return row instanceof HTMLElement && this.host.contains(row) ? row : null;
    }

    /** Whether a plain tap picks: after a long press on touch, or always with `data-kp-pick-mode="any"` once anything is picked. */
    tapPicks() {
        return this.host.hasAttribute('data-kp-selecting') || (this.picked.size > 0 && this.host.getAttribute('data-kp-pick-mode') === 'any');
    }

    /** @param {Event} event */
    swallow(event) {
        event.preventDefault();
        event.stopPropagation();
    }

    /** @param {MouseEvent} event */
    onClick(event) {
        const row = this.rowAt(event);
        if (!row) return;
        if (this.heldRow) {
            this.heldRow = false;
            return this.swallow(event);
        }
        if (event.shiftKey) {
            this.swallow(event);
            this.place(row);
            this.extendTo(keyOf(row), 'range');
        } else if (event.ctrlKey || event.metaKey || this.tapPicks()) {
            this.swallow(event);
            this.place(row);
            this.toggle(keyOf(row), 'click');
            if (this.picked.size === 0) this.say(getStrings().rowSelectModeEnd);
        }
    }

    /** A double click while picking is two picks, never a rename or an open. @param {MouseEvent} event */
    onDouble(event) {
        if (this.rowAt(event) && (this.tapPicks() || event.ctrlKey || event.metaKey || event.shiftKey)) this.swallow(event);
    }

    /** Shift + press would select the text between two rows. @param {MouseEvent} event */
    onDown(event) {
        this.host.removeAttribute('data-kp-cursor-visible');
        if (event.shiftKey && this.rowAt(event)) event.preventDefault();
    }

    /** A long press on touch picks the row and starts selection mode. @param {PointerEvent} event */
    onPressStart(event) {
        this.onPressEnd();
        this.heldRow = false;
        if (event.pointerType === 'mouse' || !event.isPrimary) return;
        const row = this.rowAt(event);
        if (!row) return;
        this.pressAt = { x: event.clientX, y: event.clientY };
        this.hold = setTimeout(() => {
            this.hold = null;
            this.heldRow = true;
            this.host.setAttribute('data-kp-selecting', '');
            this.place(row);
            this.toggle(keyOf(row), 'mode');
            this.say(getStrings().rowSelectMode);
        }, LONG_PRESS_MS);
    }

    /** @param {PointerEvent} event */
    onPressMove(event) {
        if (Math.hypot(event.clientX - this.pressAt.x, event.clientY - this.pressAt.y) > PRESS_SLOP_PX) this.onPressEnd();
    }

    onPressEnd() {
        if (this.hold) clearTimeout(this.hold);
        this.hold = null;
    }

    /** Android opens a context menu on the same long press; the press already picked. @param {Event} event */
    onContext(event) {
        if (this.heldRow && this.rowAt(event)) event.preventDefault();
    }
}
