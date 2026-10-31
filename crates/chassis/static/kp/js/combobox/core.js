// The core of one combobox: its parts and settings, the open state, the filter and the change event.
import { OPTION_SELECTOR } from '../listbox.js';
import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { raiseInPlace } from '../top-layer.js';
import { CHANGE_EVENT, EMPTY, INPUT, LIST, OPEN_EVENT, RESULTS_TEXT, STATUS, TAGS } from './constants.js';
import { slotStatus } from './helpers.js';
import { MATCHERS } from './matchers.js';
/** @typedef {import('./types.js').ComboboxHook} ComboboxHook */
/** @typedef {import('./types.js').Matcher} Matcher */
/** @typedef {ReturnType<typeof import('../listbox.js').createListbox>} Listbox */
/**
 * What `attachComboboxes` hands each combobox, its defaults already applied.
 * @typedef {object} ComboboxSettings
 * @property {keyof typeof MATCHERS | Matcher} match
 * @property {boolean} loop
 * @property {boolean} openOnFocus
 * @property {boolean} closeOnBlur
 * @property {boolean} backspaceRemoves
 * @property {boolean} stayOpen
 * @property {number} maxTags
 * @property {boolean} allowDuplicates
 * @property {number} debounceMs
 * @property {boolean} emptyRow
 * @property {boolean} creatable
 * @property {(value: string, label: string) => HTMLElement} [renderTag]
 * @property {string} removeGlyph
 */

export class ComboboxBase extends Controller {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        const settings = /** @type {ComboboxSettings} */ (options);
        /** The defaults and the page's options. */
        this.settings = settings;
        /** @type {HTMLInputElement} */
        this.input = /** @type {HTMLInputElement} */ (host.querySelector(INPUT));
        /** @type {HTMLElement} */
        this.list = /** @type {HTMLElement} */ (host.querySelector(LIST));
        /** @type {HTMLElement | null} */
        this.status = host.querySelector(STATUS);
        /** @type {HTMLElement | null} */
        this.tagList = host.querySelector(TAGS);
        this.isTags = host.dataset.kpTags !== undefined;
        this.opens = this.flag('kpOpenOnFocus', settings.openOnFocus);
        this.closes = this.flag('kpCloseOnBlur', settings.closeOnBlur);
        this.backspaces = this.flag('kpBackspaceRemoves', settings.backspaceRemoves);
        this.stays = this.flag('kpStayOpen', settings.stayOpen);
        this.duplicates = this.flag('kpDuplicates', settings.allowDuplicates);
        this.cap = Number.parseInt(host.dataset.kpMaxTags ?? '', 10) || settings.maxTags;
        this.debounce = Number.parseInt(host.dataset.kpDebounce ?? '', 10) || settings.debounceMs;
        const match = settings.match;
        /** @type {Matcher} */
        this.matcher = typeof match === 'function' ? match : (MATCHERS[host.dataset.kpMatch ?? match] ?? MATCHERS.substring);
        this.showsEmpty = this.flag('kpEmptyRow', settings.emptyRow);
        this.creates = this.flag('kpCreatable', settings.creatable);
        /** The row that says nothing matched: the server's own, or one built here. @type {HTMLElement | null} */
        this.empty = null;
        /** The server's own empty row, if it wrote one. @type {HTMLElement | null} */
        this.serverEmpty = null;
        /** Whether the server's empty row was hidden before we took it over. */
        this.emptyWasHidden = /** @type {HTMLElement['hidden']} */ (true);
        /** The values held: the tags the server rendered, then what was added. @type {string[]} */
        this.chosen = [];
        /** Whether a tag list written `hidden` is shown once it holds a tag. */
        this.tagsHidden = /** @type {HTMLElement['hidden']} */ (false);
        /** What the markup looked like before this controller touched it. */
        this.before = { expanded: /** @type {string | null} */ (null), listHidden: /** @type {HTMLElement['hidden']} */ (false), hidden: /** @type {HTMLElement['hidden'][]} */ ([]), tags: /** @type {Element[]} */ ([]), status: '' };
        /** Puts the status line back where it was. */
        this.unslot = () => {};
        /** Takes the open list out of the top layer again (js/top-layer.js). */
        this.lower = () => {};
        /** A layer on top of the combobox (js/usual-picker.js) decides what shows [kpadopt6]. @type {ComboboxHook | null} */
        this.hook = null;
        /** The virtual focus between the input and the list; set by `setListbox` before first use. @type {Listbox} */
        this.listbox = /** @type {Listbox} */ (/** @type {unknown} */ (null));
    }

    /** A boolean option: the box's `data-kp-…` attribute when it has one, else the default. @param {string} name @param {boolean} fallback */
    flag(name, fallback) {
        const box = this.host;
        return box.dataset[name] === undefined ? fallback : box.dataset[name] !== 'false';
    }

    /** Keep the listbox and undo it on destroy. @param {Listbox} listbox */
    setListbox(listbox) {
        this.listbox = listbox;
        this.own(() => listbox.destroy());
    }

    /** A layer on top of the combobox takes over (or lets go, with null). @param {ComboboxHook | null} next */
    extend(next) {
        this.hook = next;
        this.filter();
    }

    /** The status line moves into a form-grid row where there is one. */
    claimStatus() {
        this.unslot = slotStatus(this.host, this.status);
    }

    // The row that says nothing matched, inside the list and directly under the input [gap-11]. Filtering to nothing used to
    // close the list, and the only answer left was the status line. The server's own row is used when it wrote one (it may
    // offer "add this"); otherwise one is built, and taken away again at detach.
    addEmptyRow() {
        this.serverEmpty = /** @type {HTMLElement | null} */ (this.list.querySelector(EMPTY));
        this.empty = this.serverEmpty;
        if (this.showsEmpty && this.empty === null) {
            this.empty = document.createElement('li');
            this.empty.className = 'kp-combobox__empty';
            this.empty.setAttribute('role', 'presentation');
            this.empty.dataset.kpComboboxEmpty = '';
            this.list.append(this.empty);
        }
        this.emptyWasHidden = this.serverEmpty?.hidden ?? true;
    }

    /** Tags the server rendered are the starting set, not invisible. */
    readChosen() {
        const { tagList } = this;
        if (tagList)
            this.chosen.push(...[...tagList.querySelectorAll('.kp-tag')].map((t) => /** @type {HTMLElement} */ (t).dataset.value ?? (t.textContent ?? '').trim()));
        // A tag list written `hidden` is hidden while it holds no tag, and shown the moment one is added: the package
        // never un-hid it, so every pick of the usual picker's symptoms went into a list nobody could see (Kenny,
        // 2026-10-18 18:42: "MIJN SELECTIES KOMEN NIET IN DE LIJST TEVOORSCHIJN"). A list written without `hidden` is
        // left as it is.
        this.tagsHidden = tagList?.hidden ?? false;
    }

    /** Remember the markup as the server wrote it, for detach. */
    snapshot() {
        const { input, list, tagList, status } = this;
        this.before = {
            expanded: input.getAttribute('aria-expanded'),
            listHidden: list.hidden,
            hidden: [...list.querySelectorAll(OPTION_SELECTOR)].map((o) => /** @type {HTMLElement} */ (o).hidden),
            tags: tagList ? [...tagList.children] : [],
            status: status?.textContent ?? '',
        };
    }

    /** Put the markup back as the server wrote it. */
    restore() {
        const { input, list, tagList, status, before } = this;
        if (before.expanded === null) input.removeAttribute('aria-expanded');
        else input.setAttribute('aria-expanded', before.expanded);
        list.hidden = before.listHidden;
        [...list.querySelectorAll(OPTION_SELECTOR)].forEach((o, i) => {
            /** @type {HTMLElement} */ (o).hidden = before.hidden[i] ?? false;
        });
        if (tagList) {
            tagList.replaceChildren(...before.tags);
            tagList.hidden = this.tagsHidden;
        }
        if (status) status.textContent = before.status;
        this.unslot();
        if (this.empty !== null && this.empty !== this.serverEmpty) this.empty.remove();
        if (this.serverEmpty !== null) this.serverEmpty.hidden = this.emptyWasHidden;
    }

    /** @param {boolean} next */
    setOpen(next) {
        const { list, input, host } = this;
        const was = list.hidden === false;
        // Out of the top layer while still drawn, so the theme's close plays on its copy (js/motion.js), then hidden.
        if (!next && was) {
            this.lower();
            this.lower = () => {};
        }
        list.hidden = !next;
        // Above a container that clips — a card's cut corners hid every option in four themes — where it was drawn.
        if (next && !was) this.lower = raiseInPlace(list, host, input);
        input.setAttribute('aria-expanded', String(next));
        if (!next) this.listbox.clear();
        if (was !== next) host.dispatchEvent(new CustomEvent(OPEN_EVENT, { bubbles: true, detail: { open: next } }));
    }

    open() {
        this.setOpen(true);
    }

    close() {
        this.setOpen(false);
    }

    /** Show only the options whose text matches, and say how many are left. @returns {number} */
    filter() {
        const { list, hook } = this;
        const query = this.input.value.trim().toLowerCase();
        let visible = 0;
        for (const element of list.querySelectorAll(OPTION_SELECTOR)) {
            const option = /** @type {HTMLElement} */ (element);
            const text = (option.textContent ?? '').toLowerCase();
            const taken = this.isTags && !this.duplicates && this.chosen.includes(option.dataset.value ?? text);
            const matched = !taken && (query === '' || this.matcher(text, query));
            const shown = hook?.shown && !taken ? hook.shown(option, query, matched) : matched;
            option.hidden = !shown;
            if (shown) visible += 1;
        }
        hook?.after?.(query, visible);
        // The rows a layer added are options too: count what is shown now.
        if (hook?.after) visible = [...list.querySelectorAll(OPTION_SELECTOR)].filter((o) => !(/** @type {HTMLElement} */ (o).hidden)).length;
        this.listbox.refresh();
        if (this.status !== null) this.status.textContent = hook?.status?.(query, visible) ?? RESULTS_TEXT(visible);
        if (this.empty !== null) {
            this.empty.hidden = !this.showsEmpty || visible > 0;
            if (this.empty !== this.serverEmpty) this.empty.textContent = getStrings().noResults;
        }
        return visible;
    }

    /** The option whose value (or text) is `value`. @param {string} value @returns {HTMLElement | null} */
    optionFor(value) {
        for (const element of this.list.querySelectorAll(OPTION_SELECTOR)) {
            const option = /** @type {HTMLElement} */ (element);
            if ((option.dataset.value ?? (option.textContent ?? '').trim()) === value) return option;
        }
        return null;
    }

    /** @param {string} value @param {string} label @param {'add' | 'remove' | 'set'} action */
    announce(value, label, action) {
        const values = this.isTags ? [...this.chosen] : [value];
        this.host.dispatchEvent(new CustomEvent(CHANGE_EVENT, { bubbles: true, detail: { value, label, values, action } }));
    }
}
