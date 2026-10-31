// One combobox or tag input: its wiring, its keys and the handle a page gets back.
import { createListbox } from '../listbox.js';
import { handles } from './handle.js';
import { ComboboxTags } from './tags.js';
/** @typedef {import('./types.js').ComboboxHandle} ComboboxHandle */

export class ComboboxControl extends ComboboxTags {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        /** The debounce timer of the next filter. */
        this.pending = 0;
        /** What a page gets back for this box. @type {ComboboxHandle} */
        this.handle = this.makeHandle();
    }

    connect() {
        const { host: box, input, list, tagList } = this;
        box.dataset.kpComboboxAttached = '';
        list.dataset.kpArrive = 'none';
        this.own(() => {
            handles.delete(box);
            delete box.dataset.kpComboboxAttached;
        });
        this.own(() => this.restore());
        this.claimStatus();
        this.addEmptyRow();
        this.readChosen();
        this.snapshot();
        this.setListbox(
            createListbox({ input, list, loop: this.flag('kpLoop', this.settings.loop), onChoose: (_, option) => this.take(option), onDismiss: () => this.close() }),
        );
        this.own(() => this.lower());
        this.own(() => clearTimeout(this.pending));
        this.listen(input, 'input', () => this.onInput());
        this.listen(input, 'keydown', (event) => this.onKeyDown(/** @type {KeyboardEvent} */ (event)));
        this.listen(input, 'focus', () => this.onFocus());
        this.listen(box, 'focusout', () => this.onFocusOut());
        // A press in the list keeps DOM focus in the input. Without this the press moved focus to the page, the focusout
        // closed the list a tick later, and the click that followed the release landed on a hidden list: choosing an option
        // with the mouse did nothing [note 2 of Kenny's second nostromo pass, 2026-09-13]. The React channel always did this
        // on its options.
        this.listen(list, 'mousedown', (event) => event.preventDefault());
        if (tagList) this.listen(tagList, 'click', (event) => this.onTagClick(/** @type {MouseEvent} */ (event)));
        this.showTags();
        this.filter();
        list.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        handles.set(box, this.handle);
    }

    /** The handle a page gets back: read the values, replace them, open, close, type, refresh and extend. @returns {ComboboxHandle} */
    makeHandle() {
        return {
            element: this.host,
            values: () => (this.isTags ? [...this.chosen] : [this.input.value]),
            set: (values) => this.setValues(values),
            open: () => this.open(),
            close: () => this.close(),
            query: (text) => {
                this.input.value = text;
                this.onInput();
            },
            refresh: () => void this.filter(),
            extend: (next) => this.extend(next),
        };
    }

    onInput() {
        clearTimeout(this.pending);
        const run = () => {
            const visible = this.filter();
            if (visible > 0 || (this.showsEmpty && this.input.value.trim() !== '')) this.open();
            else this.close();
        };
        if (this.debounce > 0) this.pending = window.setTimeout(run, this.debounce);
        else run();
    }

    /** @param {KeyboardEvent} event */
    onKeyDown(event) {
        if (this.list.hidden && (event.key === 'ArrowDown' || (event.altKey && event.key === 'ArrowDown'))) {
            event.preventDefault();
            if (this.filter() > 0) this.open();
            return;
        }
        if (!this.isTags) return;
        // The listbox runs first: an Enter that took a highlighted option is already spent, and the field is empty by now.
        if ((event.key === 'Enter' || event.key === ',') && !event.defaultPrevented && !event.isComposing) {
            if (event.key === 'Enter' && this.listbox.index !== -1) return;
            if (this.addTyped()) event.preventDefault();
            return;
        }
        // Backspace in an empty field removes the last tag only where the box opts in. It was the default until Kenny's
        // second nostromo pass (2026-09-13): one Backspace too many while correcting a typo took away a tag already chosen.
        // Each tag's own remove button is the way out, and it is in the tab order.
        if (!this.backspaces) return;
        const { chosen } = this;
        if (event.key === 'Backspace' && this.input.value === '' && chosen.length > 0) this.removeValue(chosen[chosen.length - 1] ?? '');
    }

    /** @param {MouseEvent} event */
    onTagClick(event) {
        const target = /** @type {HTMLElement} */ (event.target);
        const remove = target.closest('.kp-tag__remove, [data-kp-tag-remove]');
        if (remove === null) return;
        const tag = /** @type {HTMLElement | null} */ (remove.closest('.kp-tag'));
        this.removeValue(tag?.dataset.value ?? '');
        this.input.focus();
    }

    onFocus() {
        if (this.opens && this.filter() > 0) this.open();
    }

    onFocusOut() {
        if (!this.closes) return;
        // A tick, because focus moving from the input to an option is a focusout followed immediately by a focusin, and
        // closing on the first would make every mouse choice miss.
        setTimeout(() => {
            if (!this.destroyed && !this.host.contains(document.activeElement)) this.close();
        }, 0);
    }
}
