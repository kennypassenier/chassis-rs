// One chip with its menu [forms-1102]: the menu button is a tab stop only beside the chip that is, ContextMenu or Shift+F10 on
// the chip opens it, and its Rename entry turns the chip into a field.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { MENU_SELECT_EVENT } from '../menu-button/constants.js';
import { openMenu } from '../menu-button/open.js';
import { attachMenuButtons } from '../menu-button/attach.js';
import { SEGMENTED_ITEM } from '../segmented/constants.js';
import { labelOf } from '../segmented/read.js';
import { RENAME_ENTRY, RENAMING } from './constants.js';
import { ChipRename } from './rename.js';

export class ChipMenu extends Controller {
    /** The chip this menu belongs to: the item right before it in the group. */
    get item() {
        const before = this.host.previousElementSibling;
        return before instanceof HTMLElement && before.matches(SEGMENTED_ITEM) ? before : null;
    }

    /** The menu button's wrapper (the host) and its button. */
    get menu() {
        return { wrapper: this.host, button: /** @type {HTMLButtonElement | null} */ (this.host.querySelector(':scope > button')) };
    }

    connect() {
        const { item } = this;
        if (!item) {
            console.warn('kp-segmented: a .kp-segmented__menu stands right after the chip it belongs to', this.host);
            return;
        }
        this.own(attachMenuButtons(/** @type {HTMLElement} */ (this.host.parentElement)));
        this.name();
        this.stop();
        this.observe(new MutationObserver(() => this.stop())).observe(item, { attributes: true, attributeFilter: ['tabindex', 'disabled'] });
        this.listen(item, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.host.classList.add('kp-segmented__menu');
        this.listen(this.host, MENU_SELECT_EVENT, (event) => {
            const picked = /** @type {CustomEvent} */ (event).detail?.item;
            // After the menu has closed and given the focus back, so the field keeps it.
            if (picked instanceof Element && picked.matches(RENAME_ENTRY)) requestAnimationFrame(() => this.rename());
        });
    }

    /** The menu button says whose menu it is, unless the page named it. */
    name() {
        const { button } = this.menu;
        const { item } = this;
        if (button && item && !button.hasAttribute('aria-label') && !button.hasAttribute('aria-labelledby')) button.setAttribute('aria-label', getStrings().segmentedMenuFor(labelOf(item)));
    }

    /** The menu button is a tab stop exactly when its chip is (one stop per group, plus the menu of the chip in hand). */
    stop() {
        const { button } = this.menu;
        const { item } = this;
        if (!button || !item) return;
        button.tabIndex = item.tabIndex === 0 && !item.hasAttribute('disabled') ? 0 : -1;
    }

    /** @param {KeyboardEvent} event */
    onKey(event) {
        if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
            event.preventDefault();
            openMenu(this.host, { focus: 'first' });
        } else if (event.key === 'F2') {
            event.preventDefault();
            this.rename();
        }
    }

    /** Turn the chip into a field, unless it already is one or cannot be renamed. */
    rename() {
        const { item } = this;
        if (!item || item.hasAttribute(RENAMING) || !this.host.querySelector(RENAME_ENTRY)) return;
        new ChipRename(item).start();
    }
}
