// One wired tab bar: its height published on the root while it is on the screen, and its More tab wired to the dialog it opens.

import { Controller } from '../controller.js';
import { TABBAR_HEIGHT_PROPERTY } from './badge.js';
import { TabbarDialog } from './dialog.js';

export class TabbarController extends Controller {
    /** @param {HTMLElement} bar */
    constructor(bar) {
        super(bar);
        this.doc = bar.ownerDocument;
        /** @type {Window & typeof globalThis} */
        this.view = /** @type {Window & typeof globalThis} */ (this.doc.defaultView);
    }

    connect() {
        if (!this.view) return;
        this.publishHeight();
        this.wireDialogs();
    }

    /** The height, published while the bar is on the screen. A static bar sits in the page's flow and gives nobody room to keep. */
    publishHeight() {
        const { host: bar, doc, view } = this;
        if (bar.classList.contains('kp-tabbar--static')) return;
        const root = doc.documentElement;
        const publish = () => {
            const shown = view.getComputedStyle(bar).display !== 'none';
            root.style.setProperty(TABBAR_HEIGHT_PROPERTY, shown ? `${bar.offsetHeight}px` : '0px');
        };
        if (typeof ResizeObserver !== 'undefined') this.observe(new ResizeObserver(publish)).observe(bar);
        this.listen(view, 'resize', publish);
        publish();
        this.own(() => root.style.removeProperty(TABBAR_HEIGHT_PROPERTY));
    }

    /** A tab that opens a dialog: say so, and follow the dialog. */
    wireDialogs() {
        for (const el of this.host.querySelectorAll('.kp-tabbar__tab[data-kp-dialog]')) {
            const tab = /** @type {HTMLElement} */ (el);
            const dialog = this.doc.getElementById(tab.dataset.kpDialog ?? '');
            if (dialog instanceof HTMLDialogElement) new TabbarDialog(this, tab, dialog).connect();
        }
    }
}
