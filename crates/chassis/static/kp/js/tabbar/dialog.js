// The More tab of a bar: a tab that opens a dialog says so, follows whether the dialog is open and holds the current page, and closes the drawer on a press outside or on an entry.

/** @typedef {import('./controller.js').TabbarController} TabbarController */

export class TabbarDialog {
    /**
     * @param {TabbarController} bar the bar this tab belongs to
     * @param {HTMLElement} tab the tab that opens the dialog
     * @param {HTMLDialogElement} dialog
     */
    constructor(bar, tab, dialog) {
        this.bar = bar;
        this.tab = tab;
        this.dialog = dialog;
        /** Whether it was this script that marked the tab current, so it takes back only that. */
        this.marked = false;
    }

    connect() {
        const { bar, tab, dialog } = this;
        tab.setAttribute('aria-haspopup', 'dialog');
        tab.setAttribute('aria-controls', dialog.id);
        this.sync();
        // The way back, four ways [Kenny, kpadopt-nav, 2026-10-16: More "opened full screen on the right side and there
        // was no way to go back"]: the close button and Escape are the dialog's own; a press outside the panel (the
        // strip of page the drawer leaves on a phone) and a press on one of its entries are this bar's. An entry that
        // is a link still follows its link: the drawer is closed after the press, not instead of it.
        dialog.setAttribute('data-kp-tabbar-drawer', '');
        bar.own(() => this.release());
        bar.listen(dialog, 'click', (event) => this.onPress(/** @type {MouseEvent} */ (event)));
        bar.observe(new MutationObserver(() => this.sync())).observe(dialog, { attributes: true, attributeFilter: ['open', 'aria-current'], subtree: true });
        bar.listen(dialog, 'close', () => this.sync());
    }

    /** Take the marks this tab and its dialog got off again. */
    release() {
        const { tab, dialog } = this;
        dialog.removeAttribute('data-kp-tabbar-drawer');
        tab.removeAttribute('aria-haspopup');
        tab.removeAttribute('aria-controls');
        tab.removeAttribute('aria-expanded');
        if (this.marked) tab.removeAttribute('aria-current');
    }

    /** The tab says whether the dialog is open, and reads as current while the dialog holds the current page. */
    sync() {
        const { tab, dialog } = this;
        tab.setAttribute('aria-expanded', String(dialog.open));
        const held = dialog.querySelector('[aria-current]:not([aria-current="false"])') !== null;
        if (held && !tab.hasAttribute('aria-current')) {
            tab.setAttribute('aria-current', 'true');
            this.marked = true;
        } else if (!held && this.marked) {
            tab.removeAttribute('aria-current');
            this.marked = false;
        }
    }

    /** @param {MouseEvent} event */
    onPress(event) {
        const { dialog, bar } = this;
        if (!dialog.open) return;
        const target = event.target;
        if (target === dialog) {
            const box = dialog.getBoundingClientRect();
            const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
            if (outside) dialog.close();
            return;
        }
        if (target instanceof Element && target.closest('a[href], .kp-menu__item') !== null && target.closest('[data-kp-dialog-close]') === null)
            bar.view.setTimeout(() => dialog.close(), 0);
    }
}
