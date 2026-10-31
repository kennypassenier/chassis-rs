// The state of one element with row keys: its options, its voice, the rows and the cursor, and setting boxes.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { ROW_SELECT_EVENT, SELECT_BOX, boxOf, boxesOf, keyOfRow, markCursor, onByDefault, rowOf, shown, tickable } from './rows.js';

/** @typedef {import('../row-select.js').RowSelectOptions} RowSelectOptions */

export class RowSelectCore extends Controller {
    /** @param {HTMLElement} el @param {RowSelectOptions} [options] */
    constructor(el, options = {}) {
        super(el, options);
        /** @type {RowSelectOptions} */
        this.opts = options;
        this.doc = el.ownerDocument;
        /** The voice: a polite live region in the element. */
        this.live = this.doc.createElement('div');
        /** The key of the cursor row. @type {string | null} */
        this.cursorKey = null;
        /** The key of the row last ticked by a click or a key, the start of the next range. @type {string | null} */
        this.anchorKey = null;
    }

    // The options are read when they are used, so a page that flips an attribute is heard at once.
    isRange() {
        return (this.opts.range ?? this.host.getAttribute('data-kp-select-range') ?? 'shift') !== 'off';
    }
    /** A `data-kp-grid` owns the arrow keys. */
    owned() {
        return this.host.matches('[data-kp-grid]') || this.host.querySelector('[data-kp-grid]') !== null;
    }
    useArrows() {
        return (this.opts.arrows ?? onByDefault(this.host, 'data-kp-select-arrows')) && !this.owned();
    }
    useAllKey() {
        return this.opts.allKey ?? onByDefault(this.host, 'data-kp-select-all-key');
    }
    scrollTo() {
        return (this.opts.scroll ?? this.host.getAttribute('data-kp-cursor-scroll')) === 'center' ? 'center' : 'nearest';
    }

    /** Put the voice in the element. */
    mountVoice() {
        this.live.className = 'kp-sr-only';
        this.live.setAttribute('role', 'status');
        this.live.setAttribute('aria-live', 'polite');
        this.host.append(this.live);
    }
    /** @param {string} text */
    say(text) {
        this.live.textContent = '';
        // A second identical sentence is still heard: the text is set a frame later.
        this.doc.defaultView?.requestAnimationFrame(() => (this.live.textContent = text));
    }

    /** Every row with a box, shown or not, in the order they are drawn. @returns {HTMLElement[]} */
    allRows() {
        /** @type {HTMLElement[]} */
        const out = [];
        for (const box of boxesOf(this.host)) {
            const row = rowOf(box);
            if (row && !out.includes(row)) out.push(row);
        }
        return out;
    }
    /** The rows the walk may land on, in the order they are drawn. */
    rows() {
        return this.allRows().filter(shown);
    }
    /** @param {string | null} key */
    rowByKey(key) {
        return key === null ? null : (this.rows().find((r, i) => keyOfRow(r, i) === key) ?? null);
    }
    keys() {
        return boxesOf(this.host)
            .filter((b) => b.checked)
            .map((b, i) => keyOfRow(rowOf(b) ?? this.host, i));
    }
    count() {
        return boxesOf(this.host).filter((b) => b.checked).length;
    }

    /**
     * Rows are focusable, one of them in the tab order. Every row, hidden or not: the walk skips a hidden row, the
     * roving tabindex does not. Only shown rows were made roving until 11.0.0, and nothing settles again when a row
     * or a section around the element is shown later (a `hidden` flip is not a child added), so a row a data table's
     * page or a hidden section kept out at attach stayed out of the walk once shown, and the markup depended on which
     * of the two modules attached first (tests/auto-lazy.spec.mjs: the catalogue's tables, the fixture's paged row).
     * The tab stop is the cursor row, else the first shown row, else the first row.
     */
    settle() {
        const every = this.allRows();
        const current = this.rowByKey(this.cursorKey);
        const stop = current ?? every.find(shown) ?? every[0];
        for (const row of every) {
            if (!row.hasAttribute('tabindex') || row.hasAttribute('data-kp-roving')) {
                row.setAttribute('data-kp-roving', '');
                row.tabIndex = row === stop ? 0 : -1;
            }
            markCursor(row, row === current);
        }
    }

    /** Move the cursor to a row, or take it away. @param {HTMLElement | null} row @param {{ focus?: boolean }} [how] */
    place(row, { focus = true } = {}) {
        this.cursorKey = row ? keyOfRow(row, this.rows().indexOf(row)) : null;
        // Every row, so a hidden one keeps no tab stop of its own.
        for (const r of this.allRows()) {
            if (r.hasAttribute('data-kp-roving')) r.tabIndex = r === row ? 0 : -1;
            markCursor(r, r === row);
        }
        if (row && focus) {
            row.focus({ preventScroll: true });
            row.scrollIntoView({ block: this.scrollTo(), inline: 'nearest' });
        }
    }

    /** Set one box and let the table hear it as a click. @param {HTMLInputElement} box @param {boolean} checked */
    setBox(box, checked) {
        if (box.checked === checked || !tickable(box)) return false;
        box.checked = checked;
        box.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }
    /** @param {string} source @param {number} [skipped] */
    fire(source, skipped = 0) {
        const detail = { keys: this.keys(), count: this.count(), source, skipped };
        this.host.dispatchEvent(new CustomEvent(ROW_SELECT_EVENT, { bubbles: true, detail }));
    }
    /** Untick every box. */
    clearAll() {
        for (const box of boxesOf(this.host)) this.setBox(box, false);
        this.anchorKey = null;
    }

    /** Set the boxes from the anchor to a row. @param {HTMLElement} to @param {boolean} checked */
    tickRange(to, checked) {
        const list = this.rows();
        const a = list.indexOf(this.rowByKey(this.anchorKey) ?? to);
        const b = list.indexOf(to);
        if (a < 0 || b < 0) return { changed: 0, skipped: 0 };
        let changed = 0;
        let skipped = 0;
        for (const row of list.slice(Math.min(a, b), Math.max(a, b) + 1)) {
            const box = boxOf(row);
            if (!box) continue;
            if (!tickable(box)) skipped += 1;
            else if (this.setBox(box, checked)) changed += 1;
        }
        return { changed, skipped };
    }

    /** Say how many are ticked (and how many could not be), then fire. @param {string} source @param {number} skipped */
    said(source, skipped) {
        const strings = getStrings();
        this.say([strings.rowSelectCount(this.count()), skipped > 0 ? strings.rowSelectSkipped(skipped) : ''].filter(Boolean).join('. '));
        this.fire(source, skipped);
    }

    /** Make a row the start of the next range. @param {HTMLElement} row */
    anchorAt(row) {
        this.anchorKey = keyOfRow(row, this.rows().indexOf(row));
    }

    /** Whether a box is one of ours. @param {EventTarget | null} target @returns {target is HTMLInputElement} */
    static isBox(target) {
        return target instanceof HTMLInputElement && target.matches(SELECT_BOX);
    }
}
