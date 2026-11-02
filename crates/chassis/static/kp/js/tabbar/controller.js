// One wired tab bar: its height published on the root while it is on the screen, and its More tab wired to the dialog it opens.

import { Controller } from '../controller.js';
import { TABBAR_HEIGHT_PROPERTY } from './badge.js';
import { TabbarDialog } from './dialog.js';
import { fitTabbar, TABBAR_FIT_ATTRIBUTE } from './fit.js';

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
        /** The More tabs wired so far, so a redraw wires only a tab that is new. @type {WeakSet<HTMLElement>} */
        this.wired = new WeakSet();
        this.publishHeight();
        this.fitLabels();
        this.wireDialogs();
        this.watchDialogs();
    }

    /** The labels tighten before any is cut (js/tabbar/fit.js): measured on a resize, a redraw of the tabs and the fonts' arrival. */
    fitLabels() {
        const { host: bar, doc, view } = this;
        const fit = () => fitTabbar(bar);
        if (typeof ResizeObserver !== 'undefined') this.observe(new ResizeObserver(fit)).observe(bar);
        this.observe(new view.MutationObserver(fit)).observe(bar, { childList: true, subtree: true, characterData: true });
        this.own(() => bar.removeAttribute(TABBAR_FIT_ATTRIBUTE));
        void doc.fonts?.ready.then(() => this.host.isConnected && fit());
        fit();
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

    /** A tab that opens a dialog: say so, and follow the dialog. A tab already wired is left as it is. */
    wireDialogs() {
        for (const el of this.host.querySelectorAll('.kp-tabbar__tab[data-kp-dialog]')) {
            const tab = /** @type {HTMLElement} */ (el);
            if (this.wired.has(tab)) continue;
            const dialog = this.doc.getElementById(tab.dataset.kpDialog ?? '');
            if (!(dialog instanceof HTMLDialogElement)) continue;
            this.wired.add(tab);
            new TabbarDialog(this, tab, dialog).connect();
        }
    }

    /**
     * A More tab drawn after the bar was wired is wired too [medicine-1102, Medicine Cabinet gap 29]. The bundle wires every bar
     * on the page when it loads, so an app that draws its tabs afterwards found its later attachTabbars() call a no-op: the
     * drawer was the whole window on a phone and did not close on a link the app routes in place. A redraw of the bar wires the
     * new tab; a press on a tab whose drawer arrived after the tab wires it before the drawer opens (capture, ahead of the
     * page's own data-kp-dialog wiring).
     */
    watchDialogs() {
        this.observe(new this.view.MutationObserver(() => this.wireDialogs())).observe(this.host, { childList: true, subtree: true });
        this.listen(this.host, 'click', () => this.wireDialogs(), { capture: true });
    }
}
