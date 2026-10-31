// The chooser: segments or a menu, whichever `data-kp-look` names, built, wired, redrawn and filled with the choices.

import { attachMenuButtons, setMenu } from '../menu-button.js';
import { attachSegmented, setSegmentedItems, setSegmentedValues } from '../segmented.js';
import { getStrings } from '../strings.js';
import { make } from './bar.js';
import { wordsFor } from './words.js';

/** The chooser of one control. */
export class Chooser {
    /**
     * @param {HTMLElement} el the control
     * @param {HTMLElement} holder the element the chooser parts go in
     */
    constructor(el, holder) {
        this.el = el;
        this.holder = holder;
        /** @type {HTMLElement | null} */
        this.menuHost = null;
        /** @type {HTMLElement | null} */
        this.segHost = null;
        /** @type {HTMLButtonElement | null} */
        this.menuButton = null;
        /** The look the chooser is drawn in now; `data-kp-look` changes it at runtime [live-options-1019]. @type {'menu' | 'segmented' | null} */
        this.drawnLook = null;
        /** The detach of the menu or segmented wiring of the look drawn now. @type {(() => void) | null} */
        this.unwire = null;
    }

    /** The look the attribute names. @returns {'menu' | 'segmented'} */
    look() {
        return this.el.getAttribute('data-kp-look') === 'menu' ? 'menu' : 'segmented';
    }

    /** Build the chooser parts of the look the attribute names (segments or a menu) and put them in the bar. */
    build() {
        const doc = this.el.ownerDocument;
        const label = getStrings().refreshLabel;
        this.drawnLook = this.look();
        this.menuHost = null;
        this.segHost = null;
        this.menuButton = null;
        if (this.drawnLook === 'menu') {
            const host = make(doc, 'div', 'kp-menu-button kp-refresh__menu');
            host.setAttribute('data-kp-menu-button', '');
            const button = /** @type {HTMLButtonElement} */ (make(doc, 'button', 'kp-button kp-refresh__button'));
            button.type = 'button';
            button.setAttribute('aria-label', label);
            const menu = make(doc, 'div', 'kp-menu kp-menu--rich');
            menu.setAttribute('role', 'menu');
            menu.setAttribute('aria-label', label);
            host.append(button, menu);
            this.menuHost = host;
            this.menuButton = button;
            this.holder.replaceChildren(host);
        } else {
            const host = make(doc, 'div', 'kp-segmented kp-refresh__segments');
            host.setAttribute('data-kp-segmented', 'single');
            host.setAttribute('role', 'radiogroup');
            host.setAttribute('aria-label', label);
            this.segHost = host;
            this.holder.replaceChildren(host);
        }
    }

    /** Wire the menu or the segments of the look drawn now. */
    wire() {
        this.unwire = this.menuHost ? attachMenuButtons(this.el) : this.segHost ? attachSegmented(this.el) : null;
    }

    /** Fill the chooser with the choices, the current interval marked. @param {number[]} choices @param {number} interval */
    paint(choices, interval) {
        const s = getStrings();
        const list = [...new Set([...choices, interval])].sort((a, b) => (a === 0 ? -1 : b === 0 ? 1 : a - b));
        if (this.menuHost && this.menuButton) {
            this.menuButton.textContent = `${wordsFor(interval)} ▾`;
            const items = list.map((n) => ({
                label: wordsFor(n),
                value: String(n),
                attrs: { 'aria-checked': String(n === interval), role: 'menuitemradio' },
            }));
            setMenu(this.menuHost, [{ group: '', items: [...items, { label: s.refreshOther, value: 'other' }] }]);
        } else if (this.segHost) {
            setSegmentedItems(this.segHost, [...list.map((n) => ({ value: String(n), label: wordsFor(n) })), { value: 'other', label: s.refreshOther }]);
            setSegmentedValues(this.segHost, [String(interval)]);
        }
    }

    /** Draw the chooser again in a new look, keeping the focus inside it. @param {number[]} choices @param {number} interval */
    redraw(choices, interval) {
        const hadFocus = this.holder.contains(this.el.ownerDocument.activeElement);
        this.unwire?.();
        this.build();
        this.wire();
        this.paint(choices, interval);
        if (hadFocus) this.holder.querySelector('button')?.focus();
    }

    /** The element Escape in the custom form gives the focus back to. */
    focusTarget() {
        return this.menuButton ?? this.segHost;
    }
}
