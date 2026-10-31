// One shortcut sheet: opened by its key (`?` by default) or an opener, closed by a press outside it.
import { Controller } from '../controller.js';
import { handles } from './api.js';
import { OPEN_EVENT, SHEET } from './constants.js';
import { isTyping } from './keys.js';
import { answers, closeOnOutsidePress, openerFor } from './outside.js';
/** @typedef {import('./types.js').PaletteHandle} PaletteHandle */

/** One sheet: its key and the handle a page gets for it. */
export class SheetControl extends Controller {
    /** @param {HTMLElement} host @param {{ sheetKey?: string | null, typingSelector?: string }} [options] */
    constructor(host, options = {}) {
        super(host, options);
        this.sheet = /** @type {HTMLDialogElement} */ (host);
        this.key = host.dataset.kpHotkey === 'none' ? null : (host.dataset.kpHotkey ?? options.sheetKey ?? null);
        this.typingSelector = options.typingSelector ?? '';
        /** @type {PaletteHandle} */
        this.handle = { element: this.sheet, open: () => this.open(), close: () => this.sheet.close(), refresh: () => {}, setState: () => {} };
    }

    connect() {
        const sheet = this.sheet;
        sheet.dataset.kpShortcutsAttached = '';
        this.own(() => {
            if (sheet.open) sheet.close();
            handles.delete(sheet);
            delete sheet.dataset.kpShortcutsAttached;
        });
        handles.set(sheet, this.handle);
        if (this.key !== null) this.listen(document, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(document, 'click', (event) => {
            if (openerFor(event, sheet, false)) this.open();
        });
        this.listen(sheet, 'close', () => sheet.dispatchEvent(new CustomEvent(OPEN_EVENT, { bubbles: true, detail: { open: false } })));
        // A press outside the sheet closes it, as it does the palette [scope-80].
        this.own(closeOnOutsidePress(sheet));
    }

    open() {
        const sheet = this.sheet;
        if (sheet.open) return;
        sheet.showModal();
        sheet.dispatchEvent(new CustomEvent(OPEN_EVENT, { bubbles: true, detail: { open: true } }));
    }

    /** `?` only when nobody is typing one into a field, and never with a modifier — Ctrl+? belongs to the browser. @param {KeyboardEvent} event */
    onKey(event) {
        if (this.key === null || event.key !== this.key || event.ctrlKey || event.metaKey || event.altKey) return;
        if (isTyping(event.target, this.typingSelector)) return;
        if (!answers(SHEET, this.sheet)) return;
        event.preventDefault();
        if (this.sheet.open) this.sheet.close();
        else this.open();
    }
}
