// One drawn select: the list laid over the native select, its keys and presses.
import { Controller } from '../controller.js';
import { createListbox } from '../listbox.js';
import { layoutRect, placeBlockSide, raiseOverlay, raised } from '../top-layer.js';
import { OPEN_EVENT } from './constants.js';
import { selectHandles } from './handle.js';
import { comboboxState } from './state.js';
/** @typedef {import('./types.js').SelectHandle} SelectHandle */
/** @typedef {ReturnType<typeof createListbox>} Listbox */

/** The keys that open a closed drawn list. */
const OPENING_KEYS = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'F4'];
/** The widest gap in px between the select and its list. */
const MAX_GAP = 8;

export class SelectControl extends Controller {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        /** The native select, which stays the control. */
        this.select = /** @type {HTMLSelectElement} */ (host);
        /** The drawn list, a sibling directly after the select. */
        this.list = document.createElement('ul');
        /** The label that names the list; its id is ours only if we gave it. @type {HTMLLabelElement | undefined} */
        this.labelled = undefined;
        /** What the select's attributes were before. */
        this.before = { expanded: /** @type {string | null} */ (null), controls: /** @type {string | null} */ (null) };
        /** Takes the open list out of the top layer again (js/top-layer.js). */
        this.lower = () => {};
        /** The virtual focus between the select and the list; set in `connect()` before first use. @type {Listbox} */
        this.listbox = /** @type {Listbox} */ (/** @type {unknown} */ (null));
        /** What a page gets back. @type {SelectHandle} */
        this.handle = { element: this.select, list: this.list, open: () => this.open(), close: () => this.close(), refresh: () => this.build() };
    }

    connect() {
        const { select, list } = this;
        this.own(() => {
            selectHandles.delete(select);
            delete select.dataset.kpSelectAttached;
        });
        this.before = { expanded: select.getAttribute('aria-expanded'), controls: select.getAttribute('aria-controls') };
        this.drawList();
        this.own(() => this.restore());
        this.listbox = createListbox({
            input: select,
            list,
            loop: this.options.loop === true,
            typeahead: true,
            typeaheadMs: /** @type {number} */ (this.options.typeaheadMs),
            onChoose: (_, option) => this.take(option),
            onDismiss: () => this.close(),
        });
        this.own(() => this.listbox.destroy());
        this.own(() => this.lower());
        // Capture on the select itself runs before the listbox's bubble-phase listener, which is what lets a closed box open
        // without the listbox also moving the highlight.
        this.listen(select, 'keydown', (event) => this.onKeyDownCapture(/** @type {KeyboardEvent} */ (event)), { capture: true });
        this.listen(select, 'mousedown', (event) => this.onMouseDown(/** @type {MouseEvent} */ (event)));
        this.listen(select, 'focusout', () => this.onFocusOut());
        this.listen(select, 'change', () => this.onChange());
        // A press in the list must not take focus from the select.
        this.listen(list, 'mousedown', (event) => event.preventDefault());
        this.build();
        selectHandles.set(select, this.handle);
        select.dataset.kpSelectAttached = '';
    }

    /** Make the list, name it after the select's label, and put it right after the select. */
    drawList() {
        const { select, list } = this;
        comboboxState.selectCount += 1;
        list.className = 'kp-combobox__list';
        list.id = `${select.id || 'kp-select'}-drawn-${comboboxState.selectCount}`;
        list.setAttribute('role', 'listbox');
        list.dataset.kpSelectList = '';
        list.dataset.kpArrive = 'none';
        list.hidden = true;
        this.labelled = /** @type {HTMLLabelElement | undefined} */ (select.labels?.[0]);
        if (this.labelled) {
            if (!this.labelled.id) this.labelled.id = `${list.id}-label`;
            list.setAttribute('aria-labelledby', this.labelled.id);
        }
        select.after(list);
        select.setAttribute('aria-controls', list.id);
        select.setAttribute('aria-expanded', 'false');
    }

    /** Take the list away and give the select back its attributes. */
    restore() {
        const { select, list, labelled, before } = this;
        list.remove();
        if (labelled && labelled.id === `${list.id}-label`) labelled.removeAttribute('id');
        for (const [name, value] of /** @type {const} */ ([
            ['aria-expanded', before.expanded],
            ['aria-controls', before.controls],
        ])) {
            if (value === null) select.removeAttribute(name);
            else select.setAttribute(name, value);
        }
        select.removeAttribute('aria-activedescendant');
    }

    /** Rebuild the options from the select's own, and mark the chosen one. */
    build() {
        const { select, list } = this;
        list.replaceChildren(
            ...[...select.options].map((native, i) => {
                const option = document.createElement('li');
                option.className = 'kp-combobox__option';
                option.id = `${list.id}-option-${i}`;
                option.setAttribute('role', 'option');
                option.setAttribute('aria-selected', 'false');
                option.dataset.kpOption = '';
                option.dataset.value = native.value;
                option.textContent = native.label || native.text;
                if (native.disabled) option.setAttribute('aria-disabled', 'true');
                if (native.selected) option.dataset.kpChosen = '';
                return option;
            }),
        );
        this.listbox.refresh();
    }

    /**
     * Put the open list under the select and as wide as it. A first guess from the offsets both siblings share, then one
     * correction measured against the paint, because a register may give the list a margin or the page a containing block the
     * offsets do not see. The gap under the select is the list's own top margin, held to at most 0.5rem.
     */
    place() {
        const { select, list } = this;
        list.style.left = `${select.offsetLeft}px`;
        list.style.top = `${select.offsetTop + select.offsetHeight}px`;
        list.style.width = `${select.offsetWidth}px`;
        const box = select.getBoundingClientRect();
        const drawn = layoutRect(list);
        const margin = Math.min(Math.max(Number.parseFloat(getComputedStyle(list).marginTop) || 0, 0), MAX_GAP);
        list.style.left = `${select.offsetLeft + (box.left - drawn.left)}px`;
        list.style.top = `${select.offsetTop + select.offsetHeight + (box.bottom + margin - drawn.top)}px`;
        list.style.width = `${box.width}px`;
        // Above the select when the window has no room under it [fix-30].
        if (raised(list)) placeBlockSide(list, box);
    }

    isOpen() {
        return this.list.hidden === false;
    }

    open() {
        const { select, list } = this;
        if (select.disabled) return;
        this.build();
        list.hidden = false;
        // Above a container that clips, placed by the same measurement as before; it follows the select while open.
        this.lower();
        this.lower = raiseOverlay(list, () => this.place());
        select.setAttribute('aria-expanded', 'true');
        const chosen = this.listbox.options.findIndex((option) => option.dataset.kpChosen !== undefined);
        this.listbox.highlight(Math.max(chosen, 0));
        select.dispatchEvent(new CustomEvent(OPEN_EVENT, { bubbles: true, detail: { open: true } }));
    }

    close() {
        if (!this.isOpen()) return;
        const { select } = this;
        this.lower();
        this.lower = () => {};
        this.list.hidden = true;
        select.setAttribute('aria-expanded', 'false');
        this.listbox.clear();
        select.dispatchEvent(new CustomEvent(OPEN_EVENT, { bubbles: true, detail: { open: false } }));
    }

    /** @param {HTMLElement} option */
    take(option) {
        const { select } = this;
        const value = option.dataset.value ?? '';
        const changed = select.value !== value;
        select.value = value;
        this.close();
        select.focus();
        // The events a person choosing in the native list would have caused, so a form library, React's onChange and forms.js
        // all hear it.
        if (changed) {
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    /**
     * What the listbox does not do: open from a closed box, and keep the browser's own select behaviour — its popup, its arrow
     * keys and letters changing the value directly — out of the way.
     * @param {KeyboardEvent} event
     */
    onKeyDownCapture(event) {
        if (event.ctrlKey || event.metaKey) return;
        const printable = event.key.length === 1 && !event.altKey;
        if (!this.isOpen()) {
            if (OPENING_KEYS.includes(event.key) || printable) {
                event.preventDefault();
                this.open();
                // Arrows and Enter only open; the listbox must not also move.
                if (!printable) event.stopImmediatePropagation();
                else if (event.key === ' ') event.stopImmediatePropagation();
            }
            return;
        }
        if (event.key === 'Tab') {
            this.close();
            return;
        }
        if (event.key === ' ' && this.listbox.index !== -1) {
            event.preventDefault();
            event.stopImmediatePropagation();
            this.listbox.choose();
            return;
        }
        if (event.key === 'Escape') event.preventDefault();
        if (printable || event.key === 'Enter') event.preventDefault();
    }

    /** A press on the box opens the drawn list instead of the browser's. @param {MouseEvent} event */
    onMouseDown(event) {
        if (event.button !== 0 || this.select.disabled) return;
        event.preventDefault();
        this.select.focus();
        if (this.isOpen()) this.close();
        else this.open();
    }

    onFocusOut() {
        setTimeout(() => {
            if (!this.destroyed && document.activeElement !== this.select) this.close();
        }, 0);
    }

    /** The page changed the value: the mark follows at once if the list is open. */
    onChange() {
        if (this.isOpen()) this.build();
    }
}
