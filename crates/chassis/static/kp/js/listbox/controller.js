// One wired listbox: the keys that move the highlight, the click and hover on an option, and the way it is taken down again.

import { ListboxCore } from './core.js';

export class ListboxController extends ListboxCore {
    connect() {
        // Registered first, so they run last on detach: what was stamped is taken back after the highlight is cleared.
        this.own(() => this.takeBackStamps());
        this.own(() => this.clear());
        this.listen(this.input, 'keydown', (event) => this.onKeyDown(/** @type {KeyboardEvent} */ (event)));
        this.listen(this.list, 'click', (event) => this.onClick(/** @type {MouseEvent} */ (event)));
        this.listen(this.list, 'mouseover', (event) => this.onOver(/** @type {MouseEvent} */ (event)));
        this.own(() => clearTimeout(this.bufferTimer));
    }

    /** Take back what was stamped: an id the consumer did not write, an aria-selected the option did not have. */
    takeBackStamps() {
        for (const option of this.stampedIds) option.removeAttribute('id');
        for (const option of this.stampedSelected) option.removeAttribute('aria-selected');
        this.stampedIds.clear();
        this.stampedSelected.clear();
    }

    /** @param {KeyboardEvent} event */
    onKeyDown(event) {
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.move(1);
                break;
            case 'ArrowUp':
                event.preventDefault();
                this.move(-1);
                break;
            case 'Home':
                this.jump(event, () => 0);
                break;
            case 'End':
                this.jump(event, (count) => count - 1);
                break;
            case 'Enter':
                // Only swallow Enter when it actually chose something; otherwise a combobox inside a form would stop the form
                // from submitting, which is a trap rather than a feature.
                if (this.choose()) event.preventDefault();
                break;
            case 'Escape':
                if (this.o.dismissOnEscape) this.o.onDismiss?.();
                break;
            default:
                this.typeahead(event);
                break;
        }
    }

    /** Home and End: highlight an end of the list, when it has options. @param {KeyboardEvent} event @param {(count: number) => number} target */
    jump(event, target) {
        const count = this.visibleOptions().length;
        if (count === 0) return;
        event.preventDefault();
        this.highlight(target(count));
    }

    /** A letter jumps to the next option that starts with what was typed. @param {KeyboardEvent} event */
    typeahead(event) {
        if (!this.o.typeahead || event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
        this.typed(event.key.toLowerCase());
        const all = this.visibleOptions();
        const from = this.buffer.length > 1 ? 0 : this.index + 1;
        const order = [...all.slice(from), ...all.slice(0, from)];
        const found = order.find((o) => (o.textContent ?? '').trim().toLowerCase().startsWith(this.buffer));
        if (found) this.highlight(all.indexOf(found));
    }

    /** The index of the enabled option under an event, or -1. @param {Event} event */
    optionAt(event) {
        const target = /** @type {HTMLElement} */ (event.target);
        const option = target.closest(this.o.optionSelector);
        if (!(option instanceof HTMLElement)) return -1;
        return this.visibleOptions().indexOf(option);
    }

    /** @param {MouseEvent} event */
    onClick(event) {
        const target = /** @type {HTMLElement} */ (event.target);
        const option = target.closest(this.o.optionSelector);
        if (!(option instanceof HTMLElement) || option.matches(this.o.disabledSelector)) return;
        const at = this.visibleOptions().indexOf(option);
        if (at === -1) return;
        this.highlight(at);
        this.choose();
    }

    /**
     * Hover moves the highlight so the mouse and the keyboard cannot
     * disagree about which option Enter would take.
     *
     * @param {MouseEvent} event
     */
    onOver(event) {
        if (!this.o.hoverHighlights) return;
        const at = this.optionAt(event);
        if (at !== -1) this.highlight(at);
    }
}
