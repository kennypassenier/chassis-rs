// The bar's title and label cells: drawn while `data-kp-refresh-title` and `data-kp-refresh-label` have words [wish-1028, formgrid-notes-1019].

import { make } from './bar.js';

/** The title and label cells of one control. */
export class BarLabels {
    /**
     * @param {HTMLElement} el the control
     * @param {HTMLElement} bar the bar the cells go in
     */
    constructor(el, bar) {
        this.el = el;
        this.bar = bar;
        /** An authored title element, moved into the bar's first cell [wish-1028]. */
        this.slotted = /** @type {HTMLElement | null} */ (el.querySelector(':scope > [data-kp-refresh-slot="title"]'));
        /** The bar's title cell, drawn while `data-kp-refresh-title` has words or a slot was given. @type {HTMLElement | null} */
        this.titleCell = null;
        /** The bar's label cell, drawn while `data-kp-refresh-label` has words [formgrid-notes-1019; homelab 52]. @type {HTMLElement | null} */
        this.labelCell = null;
    }

    /** Draw, move or take away the title cell. */
    paintTitle() {
        const doc = this.el.ownerDocument;
        const slotted = this.slotted;
        const words = (this.el.getAttribute('data-kp-refresh-title') ?? '').trim();
        if (!words && !slotted) {
            this.titleCell?.remove();
            this.titleCell = null;
            return;
        }
        if (!this.titleCell) {
            this.titleCell = make(doc, 'span', 'kp-refresh__title kp-formgrid__label');
            this.bar.prepend(this.titleCell);
            if (this.labelCell) this.titleCell.after(this.labelCell);
            if (slotted) this.titleCell.append(slotted);
        }
        const cell = this.titleCell;
        if (words) {
            if (slotted?.parentElement === cell) slotted.hidden = true;
            cell.querySelector(':scope > .kp-refresh__title-words')?.remove();
            const text = make(doc, 'span', 'kp-refresh__title-words');
            text.textContent = words;
            cell.append(text);
        } else if (slotted) slotted.hidden = false;
    }

    /** Draw or take away the label cell. */
    paintLabel() {
        const words = (this.el.getAttribute('data-kp-refresh-label') ?? '').trim();
        if (!words) {
            this.labelCell?.remove();
            this.labelCell = null;
            return;
        }
        if (!this.labelCell) {
            this.labelCell = make(this.el.ownerDocument, 'span', 'kp-refresh__label kp-formgrid__label');
            // After the title, when there is one: the title is the first cell.
            this.bar.insertBefore(this.labelCell, this.titleCell ? this.titleCell.nextSibling : this.bar.firstChild);
        }
        this.labelCell.textContent = words;
    }
}
