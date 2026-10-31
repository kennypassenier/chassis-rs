// One command palette: its matcher, its listbox, its key, its openers and the handle a page gets.
import { Controller } from '../controller.js';
import { createListbox, OPTION_SELECTOR } from '../listbox.js';
import { getStrings } from '../strings.js';
import { watchOptions } from '../live-options.js';
import { handles } from './api.js';
import { GROUP, INPUT, KEYS_SLOT, LIST, OPENER, OPEN_EVENT, PALETTE, RUN_EVENT, STATUS } from './constants.js';
import { createIntentFilter } from './intent-filter.js';
import { MATCHERS, isHotkey, isMac } from './keys.js';
import { answers, closeOnOutsidePress, openerFor } from './outside.js';
import { filterPlain } from './plain-filter.js';
/** @typedef {import('./types.js').Matcher} Matcher */
/** @typedef {import('./types.js').PaletteHandle} PaletteHandle */
/** @typedef {{ hotkey?: string | null, match?: keyof typeof MATCHERS | Matcher, clearOnClose?: boolean, closeOnRun?: boolean }} PaletteOptions */

/** One palette: its options, its matcher and intent filter, the last state the page set, and the click a choice rides on. */
export class PaletteControl extends Controller {
    /** @param {HTMLElement} host @param {PaletteOptions} [options] */
    constructor(host, options = {}) {
        super(host, options);
        const dialog = /** @type {HTMLDialogElement} */ (host);
        this.dialog = dialog;
        this.input = /** @type {HTMLInputElement} */ (dialog.querySelector(INPUT));
        this.list = /** @type {HTMLElement} */ (dialog.querySelector(LIST));
        this.status = /** @type {HTMLElement | null} */ (dialog.querySelector(STATUS));
        this.match = options.match ?? 'intent';
        this.key = dialog.dataset.kpHotkey === 'none' ? null : (dialog.dataset.kpHotkey ?? options.hotkey ?? null);
        this.clears = dialog.dataset.kpClearOnClose === undefined ? (options.clearOnClose ?? true) : dialog.dataset.kpClearOnClose !== 'false';
        this.closes = dialog.dataset.kpCloseOnRun === undefined ? (options.closeOnRun ?? true) : dialog.dataset.kpCloseOnRun !== 'false';
        /** @type {Matcher} */
        this.matcher = MATCHERS.substring;
        /** @type {ReturnType<typeof createIntentFilter> | null} */
        this.intent = null;
        /** The last state the page set, handed on when the matcher is swapped. @type {{ state: 'ready' | 'loading' | 'error', options?: { message?: string } } | null} */
        this.lastSet = null;
        /** The click a choice rides on, while it is being dispatched. @type {MouseEvent | null} */
        this.clicking = null;
        /** The listbox over the list, made in connect(). @type {ReturnType<typeof createListbox> | null} */
        this.listbox = null;
        /** @type {PaletteHandle} */
        this.handle = {
            element: dialog,
            open: (query) => this.open(query),
            close: () => dialog.close(),
            refresh: () => this.filter(),
            setState: (state, opts) => this.setState(state, opts),
        };
    }

    connect() {
        const { dialog, list, input } = this;
        dialog.dataset.kpPaletteAttached = '';
        this.own(() => this.restore());
        this.chooseMatcher();
        this.renderKeys();
        // A link chosen by a click is followed by the browser; one chosen by Enter is clicked here so the browser follows it the same
        // way — target, rel and a router's own click handler included.
        this.listen(list, 'click', (event) => (this.clicking = /** @type {MouseEvent} */ (event)), true);
        this.listbox = createListbox({ input, list, onChoose: (_, option) => this.choose(option), onDismiss: () => dialog.close() });
        this.listen(list, 'click', () => (this.clicking = null));
        this.untab();
        this.listen(input, 'input', () => this.filter());
        this.listen(dialog, 'close', () => this.onClose());
        this.own(closeOnOutsidePress(dialog));
        if (this.key !== null) this.listen(document, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(document, 'click', (event) => openerFor(event, dialog, answers(PALETTE, dialog)) && this.open());
        this.stampOpeners();
        this.filter();
        this.own(watchOptions(dialog, ['data-kp-match'], () => this.onMatch()));
        handles.set(dialog, this.handle);
    }

    /** Put back what the palette changed: the commands shown again, the key hints taken off, the dialog closed and unmarked. */
    restore() {
        const { dialog, list } = this;
        this.intent?.destroy();
        this.listbox?.destroy();
        for (const el of list.querySelectorAll(OPTION_SELECTOR)) /** @type {HTMLElement} */ (el).hidden = false;
        for (const el of list.querySelectorAll(GROUP)) /** @type {HTMLElement} */ (el).hidden = false;
        for (const el of list.querySelectorAll('kbd[data-kp-generated]')) el.remove();
        if (dialog.open) dialog.close();
        handles.delete(dialog);
        delete dialog.dataset.kpPaletteAttached;
    }

    /**
     * `data-kp-match` is read again when it changes [live-options-1019]. Words in any order is the default [kpadopt6-ops]: the
     * palette ranks, marks and caps itself.
     */
    chooseMatcher() {
        const { dialog, match } = this;
        this.matcher = typeof match === 'function' ? match : (MATCHERS[dialog.dataset.kpMatch ?? match] ?? MATCHERS.substring);
        this.intent = typeof match !== 'function' && (dialog.dataset.kpMatch ?? match) === 'intent' ? createIntentFilter(dialog, this.list, this.status) : null;
    }

    /** The old filter gives the commands back (order, marks, hidden), then the new one draws the list. */
    onMatch() {
        if (typeof this.match === 'function') return;
        const carried = this.lastSet;
        this.intent?.destroy();
        this.chooseMatcher();
        if (this.intent !== null && carried !== null) this.intent.setState(carried.state, carried.options ?? {});
        this.filter();
    }

    /** data-kp-keys, rendered: the documented attribute nothing read. */
    renderKeys() {
        for (const element of this.list.querySelectorAll(`${OPTION_SELECTOR}[data-kp-keys]`)) {
            const option = /** @type {HTMLElement} */ (element);
            if (option.querySelector('kbd') !== null) continue;
            const kbd = document.createElement('kbd');
            kbd.className = 'kp-palette__keys';
            kbd.textContent = option.dataset.kpKeys ?? '';
            kbd.dataset.kpGenerated = '';
            option.append(kbd);
        }
    }

    /** A link option is pointed at, never tabbed to [scope-48]. */
    untab() {
        for (const element of this.list.querySelectorAll(`a${OPTION_SELECTOR}[href]:not([tabindex])`)) {
            element.setAttribute('tabindex', '-1');
            this.own(() => element.removeAttribute('tabindex'));
        }
    }

    /** Filter for what is typed: the intent filter, or the plain matcher. */
    filter() {
        const listbox = /** @type {ReturnType<typeof createListbox>} */ (this.listbox);
        const query = this.input.value.trim();
        const shown = this.intent !== null ? this.intent.run(query) : filterPlain(this.list, this.status, this.matcher, query);
        listbox.refresh();
        if (shown > 0) listbox.highlight(0);
    }

    /** @param {'ready' | 'loading' | 'error'} state @param {{ message?: string }} [options] */
    setState(state, options) {
        this.lastSet = { state, ...(options ? { options } : {}) };
        this.intent?.setState(state, options);
        this.filter();
    }

    /** @param {HTMLElement} option */
    choose(option) {
        const dialog = this.dialog;
        const link = option instanceof HTMLAnchorElement && option.hasAttribute('href') ? option : null;
        if (link !== null && this.clicking === null) {
            // Comes straight back through the listbox as a click.
            link.click();
            return;
        }
        const value = option.dataset.value ?? (option.textContent ?? '').trim();
        const run = new CustomEvent(RUN_EVENT, { bubbles: true, cancelable: true, detail: { value, option, href: link?.href ?? null } });
        dialog.dispatchEvent(run);
        if (!run.defaultPrevented) this.intent?.remember(value);
        if (run.defaultPrevented && link !== null) this.clicking?.preventDefault();
        if (this.closes) dialog.close();
    }

    /** @param {string} [query] */
    open(query) {
        const { dialog, input } = this;
        if (dialog.open) return;
        if (query !== undefined) input.value = query;
        dialog.showModal();
        this.filter();
        input.focus();
        dialog.dispatchEvent(new CustomEvent(OPEN_EVENT, { bubbles: true, detail: { open: true } }));
    }

    /**
     * Reopening with the last query still in the box is a small trap: the list looks filtered for no visible reason. The close
     * event arrives a task later: a palette opened again with a query in between keeps that query.
     */
    onClose() {
        if (this.clears && !this.dialog.open) {
            this.input.value = '';
            this.filter();
        }
        this.dialog.dispatchEvent(new CustomEvent(OPEN_EVENT, { bubbles: true, detail: { open: false } }));
    }

    /**
     * Only ONE palette answers the key: the nominated one, else the first in the document. Found by the contract suite: with a
     * palette from each channel on one page, both handlers fired and the second showModal() landed on top of the first.
     * @param {KeyboardEvent} event
     */
    onKey(event) {
        if (this.key === null || !isHotkey(event, this.key) || !answers(PALETTE, this.dialog)) return;
        event.preventDefault();
        if (this.dialog.open) this.dialog.close();
        else this.open();
    }

    /** The triggers that open this palette say so, and print its key [scope-48]. Only what the markup left out is written, and only that is taken back. */
    stampOpeners() {
        const { dialog, key } = this;
        const mac = isMac();
        for (const opener of document.querySelectorAll(OPENER)) {
            const name = opener.getAttribute('data-kp-palette-open') ?? '';
            if (name === '' ? !answers(PALETTE, dialog) : name !== dialog.id) continue;
            /** @param {string} attribute @param {string} value */
            const stamp = (attribute, value) => {
                if (opener.hasAttribute(attribute)) return;
                opener.setAttribute(attribute, value);
                this.own(() => opener.removeAttribute(attribute));
            };
            stamp('aria-haspopup', 'dialog');
            if (key === null) continue;
            stamp('aria-keyshortcuts', `${mac ? 'Meta' : 'Control'}+${key.toUpperCase()}`);
            for (const slot of opener.querySelectorAll(KEYS_SLOT)) {
                if ((slot.textContent ?? '').trim() !== '') continue;
                slot.textContent = getStrings().paletteHotkey(key, mac);
                this.own(() => (slot.textContent = ''));
            }
        }
    }
}
