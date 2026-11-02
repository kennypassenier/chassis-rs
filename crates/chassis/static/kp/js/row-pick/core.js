// The state of one element whose rows are picked without boxes: the picks, the anchor, the cursor, the marks on the rows and the voice.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { MULTI_ROLES, PICKED_ATTRIBUTE, PICK_ROW, ROW_SELECT_EVENT, SELECTABLE_ROLES, keyOf, labelOfRow, markCursor, visible } from './rows.js';

export class RowPickCore extends Controller {
    /** @param {HTMLElement} el @param {Record<string, unknown>} [options] */
    constructor(el, options = {}) {
        super(el, options);
        this.doc = el.ownerDocument;
        /** The picked keys, in the order they were picked. @type {Set<string>} */
        this.picked = new Set();
        /** The key a range starts from: the last row picked or unpicked on its own. @type {string | null} */
        this.anchorKey = null;
        /** The key of the keyboard cursor row. @type {string | null} */
        this.cursorKey = null;
        /** The voice: a polite live region in the element. */
        this.live = this.doc.createElement('div');
    }

    /** Put the voice in the element. */
    mountVoice() {
        this.live.className = 'kp-sr-only';
        this.live.setAttribute('role', 'status');
        this.live.setAttribute('aria-live', 'polite');
        // A list holds only its rows: in a `ul` or a reorder list the line stands after it, so the list's order counts no stranger.
        if (this.host.matches('ul, ol, [data-kp-reorder]')) this.host.after(this.live);
        else this.host.append(this.live);
    }

    /** @param {string} text */
    say(text) {
        this.live.textContent = '';
        // A second identical sentence is still heard: the text is set a frame later.
        this.doc.defaultView?.requestAnimationFrame(() => (this.live.textContent = text));
    }

    /** Every keyed row, shown or not, in the order they are drawn. @returns {HTMLElement[]} */
    allRows() {
        return /** @type {HTMLElement[]} */ ([...this.host.querySelectorAll(PICK_ROW)]);
    }

    /** The rows a person can see now, in screen order: a range runs over these only. */
    rows() {
        return this.allRows().filter(visible);
    }

    /** @param {string | null} key */
    rowByKey(key) {
        return key === null ? null : (this.allRows().find((row) => keyOf(row) === key) ?? null);
    }

    /** The picked keys, in the order they were picked. */
    keys() {
        return [...this.picked];
    }

    /** Put the picked look on picked rows and the cursor on its row; `aria-selected` on rows that have a selectable role. */
    mark() {
        const role = this.host.getAttribute('role') ?? '';
        if (MULTI_ROLES.includes(role)) this.host.setAttribute('aria-multiselectable', 'true');
        for (const row of this.allRows()) {
            const on = this.picked.has(keyOf(row));
            row.toggleAttribute(PICKED_ATTRIBUTE, on);
            if (SELECTABLE_ROLES.includes(row.getAttribute('role') ?? '')) row.setAttribute('aria-selected', String(on));
            markCursor(row, keyOf(row) === this.cursorKey);
        }
    }

    /** Take the marks off, as detach leaves the rows. */
    unmark() {
        this.live.remove();
        this.host.removeAttribute('aria-multiselectable');
        this.host.removeAttribute('data-kp-selecting');
        this.host.removeAttribute('data-kp-cursor-visible');
        for (const row of this.allRows()) {
            row.removeAttribute(PICKED_ATTRIBUTE);
            if (SELECTABLE_ROLES.includes(row.getAttribute('role') ?? '')) row.removeAttribute('aria-selected');
            markCursor(row, false);
        }
    }

    /** Mark, say how many are picked and tell the page and the selection bar. @param {string} source @param {boolean} [quiet] */
    commit(source, quiet = false) {
        this.mark();
        if (!quiet) this.say(getStrings().rowSelectCount(this.picked.size));
        const detail = { keys: this.keys(), count: this.picked.size, source, skipped: 0 };
        this.host.dispatchEvent(new CustomEvent(ROW_SELECT_EVENT, { bubbles: true, detail }));
    }

    /** Pick a row or take it out; it becomes the start of the next range. @param {string} key @param {string} source */
    toggle(key, source) {
        if (this.rowByKey(key) === null) return;
        if (this.picked.has(key)) this.picked.delete(key);
        else this.picked.add(key);
        this.anchorKey = key;
        this.commit(source);
    }

    /** A range with no start yet starts at the cursor row. */
    startRange() {
        if (this.anchorKey === null) this.anchorKey = this.cursorKey;
    }

    /** Pick every visible row from the anchor to `key`, both included; without an anchor, `key` alone. @param {string} key @param {string} source */
    extendTo(key, source) {
        const keys = this.rows().map(keyOf);
        const to = keys.indexOf(key);
        if (to < 0) return;
        const from = this.anchorKey === null ? -1 : keys.indexOf(this.anchorKey);
        if (from < 0) this.anchorKey = key;
        for (const each of keys.slice(Math.min(from < 0 ? to : from, to), Math.max(from < 0 ? to : from, to) + 1)) this.picked.add(each);
        this.commit(source);
    }

    /** Pick exactly these keys, in this order (a page restoring a selection). @param {readonly string[]} keys */
    replacePicks(keys) {
        this.picked = new Set(keys.filter((key) => this.rowByKey(key) !== null));
        this.anchorKey = null;
        this.commit('script');
    }

    /** Take every pick away. @param {string} source */
    clearAll(source) {
        if (this.picked.size === 0 && this.anchorKey === null) return;
        this.picked.clear();
        this.anchorKey = null;
        this.host.removeAttribute('data-kp-selecting');
        this.say(getStrings().selectionCleared);
        this.commit(source, true);
    }

    /** Drop the picks whose row went away (a redraw, a filter that removed it), and mark the rows again. */
    settle() {
        const present = new Set(this.allRows().map(keyOf));
        const before = this.picked.size;
        for (const key of this.picked) if (!present.has(key)) this.picked.delete(key);
        if (this.anchorKey !== null && !present.has(this.anchorKey)) this.anchorKey = null;
        if (this.cursorKey !== null && !present.has(this.cursorKey)) this.cursorKey = null;
        if (this.picked.size === 0) this.host.removeAttribute('data-kp-selecting');
        if (this.picked.size !== before) this.commit('refresh');
        else this.mark();
    }

    /** Move the cursor to a row, or take it away. @param {HTMLElement | null} row */
    place(row) {
        this.cursorKey = row ? keyOf(row) : null;
        this.mark();
        if (!row) return;
        row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const list = this.rows();
        this.say(getStrings().rowSelectCursor(labelOfRow(row), list.indexOf(row) + 1, list.length));
    }
}
