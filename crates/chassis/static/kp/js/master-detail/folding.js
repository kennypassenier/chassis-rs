// Folding: the layout's own width decides when the panes fold to one and the aside moves under them, and which pane a phone shows.

import { PANE_ASIDE_FOLD_AT, PANE_FOLD_AT } from './constants.js';

/** The fold state of one layout. */
export class Folding {
    /** @param {HTMLElement} root @param {boolean} [listless] the detail + aside variant: the detail never gives way to a list */
    constructor(root, listless = false) {
        this.root = root;
        this.listless = listless;
        this.foldAt = root.getAttribute('data-kp-fold-at') ?? PANE_FOLD_AT;
        this.asideFoldAt = root.getAttribute('data-kp-aside-fold-at') ?? PANE_ASIDE_FOLD_AT;
        // The panes fold by the layout's own width, not the window's: a master-detail in a drawer, or a phone-width frame on a wide
        // page, folds when it is that narrow. The lengths are read as the page's rem.
        this.probe = root.ownerDocument.createElement('div');
        this.probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;block-size:0;overflow:hidden';
        this.narrow = false;
        this.asideNarrow = false;
        /** The pane a phone shows: `list` or `detail`. */
        this.shown = 'list';
    }

    /** What `data-kp-narrow` says a phone shows: `one-pane` (default), `stack` or `sheet`. */
    mode() {
        return this.root.getAttribute('data-kp-narrow') ?? 'one-pane';
    }

    /** A length as pixels, read as the page's rem. @param {string} length */
    px(length) {
        this.probe.style.inlineSize = length;
        this.root.append(this.probe);
        const width = this.probe.getBoundingClientRect().width;
        this.probe.remove();
        return width;
    }

    widthNow() {
        return this.root.getBoundingClientRect().width;
    }

    /** Read the layout's width and decide whether the panes and the aside are folded. */
    measure() {
        const width = this.widthNow();
        this.narrow = width > 0 && width < this.px(this.foldAt);
        this.asideNarrow = width > 0 && width < this.px(this.asideFoldAt);
    }

    /** The layout changed size: decide again; a layout that stopped folding shows the list. */
    resize() {
        const width = this.widthNow();
        if (width <= 0) return;
        const was = this.narrow;
        this.narrow = width < this.px(this.foldAt);
        this.asideNarrow = width < this.px(this.asideFoldAt);
        if (was && !this.narrow) this.shown = 'list';
    }

    /** Whether the detail replaces the list now (folded, and not stacked). */
    oneAtATime() {
        return this.narrow && !this.listless && this.mode() !== 'stack';
    }
}
