// What one usual picker does with its input: a change of the picks, Enter on a typed name, Alt U, presses and typing.
import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { addName, clearNote } from './add.js';
import { USUAL_NOT_TODAY_EVENT, USUAL_PICK_EVENT, USUAL_RETRY_EVENT } from './constants.js';
import { arrange } from './layout.js';
import { exactItem, nearOf, pickedValues } from './lookup.js';
import { attr, readPinned } from './model.js';
import { normaliseName } from './names.js';
import { flashTag, originOf, pick, sayAfter } from './picking.js';
import { answer, answerOf, syncCheck, syncHint } from './sync.js';
/** @typedef {import('./types.js').UsualItem} UsualItem */
/** @typedef {import('./types.js').UsualModel} UsualModel */

/** The base of a usual picker's controller: its model and the input on it. */
export class UsualPickerInput extends Controller {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options = {}) {
        super(host, options);
        /** The picker's model, the `models` registry entry the functions a page calls read; set by adopt(). */
        this.m = /** @type {UsualModel} */ (/** @type {unknown} */ (null));
        /** The text in the field when Enter went down, to tell an add that named an item already listed. */
        this.typedAtEnter = '';
    }

    /** Take the model connect() built. @param {UsualModel} m */
    adopt(m) {
        this.m = m;
    }

    /** The picks changed: say what a typed name selected, end the Undo, end "not today" for what is picked, tell the page. @param {Event} event */
    onChange(event) {
        const m = this.m;
        const { value, action, label } = /** @type {CustomEvent} */ (event).detail;
        // Text that named an item already in the list selected it: the status line says so (the combobox cleared the field).
        if (action === 'add' && this.typedAtEnter !== '' && normaliseName(this.typedAtEnter) === normaliseName(String(label ?? ''))) {
            sayAfter(m, getStrings().usualSelectedExisting(String(label)));
            flashTag(m, String(value));
        }
        this.typedAtEnter = '';
        // Any change of the picks ends the Undo offered after an add (an add sets its own line after its pick).
        clearNote(m);
        // Picked is "had it": a usual choice picked from the list or by typing stops being "not today".
        for (const v of m.handle.values()) {
            if (!m.notToday.delete(v)) continue;
            m.box.dispatchEvent(new CustomEvent(USUAL_NOT_TODAY_EVENT, { bubbles: true, detail: { value: v, on: false } }));
        }
        if (!m.silent && action !== 'remove') {
            const from = m.nextFrom ?? originOf(m, String(value));
            m.nextFrom = null;
            m.box.dispatchEvent(new CustomEvent(USUAL_PICK_EVENT, { bubbles: true, detail: { value, from } }));
        }
        syncCheck(m);
        syncHint(m);
    }

    /** A name typed that is already picked: its tag lights up and the status line says so; the text stays. @param {UsualItem} item */
    already(item) {
        this.m.handle.open();
        flashTag(this.m, item.value);
        sayAfter(this.m, getStrings().usualAlreadyPicked(item.label));
    }

    /** Alt U jumps to the first usual choice; Enter on a typed name selects, asks, refuses or adds. @param {KeyboardEvent} event */
    onKey(event) {
        const m = this.m;
        const input = m.input;
        if (event.key === 'Enter') this.typedAtEnter = input.value.trim();
        if (event.altKey && (event.code === 'KeyU' || event.key.toLowerCase() === 'u') && input.value === '') {
            event.preventDefault();
            m.handle.open();
            const pinned = readPinned(m).length;
            for (let i = 0; i < pinned + 1; i += 1) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
            return;
        }
        if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing) return;
        const typed = input.value.trim();
        if (typed === '') return;
        // A row lit by the arrows (or by the first Enter on a near name) is what Enter takes: the listbox chooses it.
        if (!m.list.hidden && input.getAttribute('aria-activedescendant')) return;
        if (this.enterExact(event, typed) || this.enterNear(event, typed)) return;
        if (attr(m, 'add', 'off') !== 'inline') return;
        event.preventDefault();
        const near = attr(m, 'near', 'ask') ?? 'ask';
        // The name a new one was close to, for the add event (null when the guard is off or nothing is close).
        addName(m, typed, near === 'off' ? null : (nearOf(m, typed)[0]?.label ?? null));
    }

    /**
     * Identical after case, accents and spaces: never a second one, whatever the guard is set to.
     * @param {KeyboardEvent} event @param {string} typed
     * @returns {boolean} whether Enter was spent on an item already listed
     */
    enterExact(event, typed) {
        const m = this.m;
        const exact = exactItem(m, typed);
        if (!exact) return false;
        event.preventDefault();
        if (pickedValues(m).includes(exact.value)) this.already(exact);
        else {
            pick(m, exact.value, 'typed');
            sayAfter(m, getStrings().usualSelectedExisting(exact.label));
        }
        return true;
    }

    /**
     * A name close to one listed: take the closest, ask first, or point at the one already picked.
     * @param {KeyboardEvent} event @param {string} typed
     * @returns {boolean} whether Enter was spent on the guard
     */
    enterNear(event, typed) {
        const m = this.m;
        const near = attr(m, 'near', 'ask') ?? 'ask';
        if (near === 'off') return false;
        const s = getStrings();
        const picked = new Set(pickedValues(m));
        const close = nearOf(m, typed);
        const free = close.filter((item) => !picked.has(item.value) && !item.el.hasAttribute('aria-disabled'));
        if (free[0]) {
            event.preventDefault();
            if (near === 'select') {
                pick(m, free[0].value, 'typed');
                sayAfter(m, s.usualTookClosest(typed, free[0].label));
            } else {
                // Ask: the question already stands first in the list; Enter lights it, and a second Enter takes it. This
                // Enter is spent here: the listbox, which runs after, must not take the row it has just been lit.
                event.stopImmediatePropagation();
                m.handle.open();
                m.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
                sayAfter(m, s.usualAsk(free[0].label));
            }
            return true;
        }
        if (!close[0]) return false;
        event.preventDefault();
        this.already(close[0]);
        return true;
    }

    /** Retry, the add button, or a row of the check pressed. @param {MouseEvent} event */
    onClick(event) {
        const m = this.m;
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('[data-kp-usual-retry]')) m.box.dispatchEvent(new CustomEvent(USUAL_RETRY_EVENT, { bubbles: true }));
        else if (target?.closest('[data-kp-usual-add-button]')) {
            const typed = m.input.value.trim();
            if (typed) addName(m, typed, null);
            else m.input.focus();
        } else {
            // A row of the check: "Had it" or "Not today", pressed again: not answered. (The chips are the segmented
            // module's own three-way group, which says what changed by its event.)
            const button = /** @type {HTMLButtonElement | null} */ (target?.closest('.kp-usual__check-pair button') ?? null);
            const pair = button?.closest('.kp-usual__check-pair');
            if (!button || button.disabled || !(pair instanceof HTMLElement)) return;
            const kind = button.dataset.value === 'not' ? 'not' : 'had';
            const value = pair.dataset.value ?? '';
            answer(m, value, answerOf(m, value) === kind ? 'none' : kind);
        }
    }

    /** Typing re-orders for `while-typing="hide"` and shows or hides the rows of the guard. */
    onInput() {
        const m = this.m;
        clearNote(m);
        if (attr(m, 'usual-while-typing') === 'hide') {
            arrange(m);
            m.handle.refresh();
        }
        syncHint(m);
    }
}
