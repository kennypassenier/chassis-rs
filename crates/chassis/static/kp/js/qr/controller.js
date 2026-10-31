// One wired QR code: its buttons (copy, show all, download, show, hide, retry), Shift+C, and a draw again whenever one of
// its options changes.

import { Controller } from '../controller.js';
import { registerShortcuts } from '../shortcuts.js';
import { getStrings } from '../strings.js';
import { copyLink, download } from './actions.js';
import { render } from './render.js';
import { QR_RETRY_EVENT, QR_REVEAL_EVENT, stateOf, valueOf } from './state.js';

/** The options that are live: change the attribute and the code is drawn again. */
const LIVE_OPTIONS = ['value', 'ecc', 'size', 'quiet', 'look', 'modules', 'render', 'caption', 'copy', 'download', 'reveal', 'expires', 'label', 'max', 'narrow', 'retry'];

export class QrControl extends Controller {
    /** @param {HTMLElement} root */
    constructor(root) {
        super(root);
        /** The frame a queued draw waits for, so a burst of attribute changes draws once. */
        this.queued = 0;
    }

    connect() {
        const root = this.host;
        // Registered first, so it runs last: the expiry timer stops once nothing else listens.
        this.own(() => window.clearTimeout(stateOf(root).timer));
        this.listen(root, 'click', (event) => this.onClick(event));
        this.observe(
            new MutationObserver(() => {
                window.cancelAnimationFrame(this.queued);
                this.queued = window.requestAnimationFrame(() => render(root));
            }),
        ).observe(root, { attributes: true, attributeFilter: LIVE_OPTIONS.map((n) => `data-kp-qr-${n}`) });
        this.own(this.copyKey());
        render(root);
    }

    /** Shift+C copies the link while the focus is in the code. @returns {() => void} the stop */
    copyKey() {
        const root = this.host;
        const s = getStrings();
        return registerShortcuts(
            root,
            [
                {
                    keys: 'Shift C',
                    what: s.qrKey,
                    group: s.qrKeyGroup,
                    when: () => root.contains(document.activeElement) && valueOf(root) !== '' && !root.querySelector('.kp-qr__copy:disabled'),
                    reason: s.qrKeyReason,
                    run: () => void copyLink(root),
                },
            ],
            { layoutGuard: 'off' },
        );
    }

    /** @param {Event} event */
    onClick(event) {
        const root = this.host;
        const t = event.target instanceof Element ? event.target : null;
        if (!t) return;
        if (t.closest('.kp-qr__copy')) return void copyLink(root);
        if (t.closest('.kp-qr__more')) {
            const st = stateOf(root);
            st.open = !st.open;
            return render(root);
        }
        const dl = t.closest('[data-kp-qr-download-as]');
        if (dl) return void download(root, dl.getAttribute('data-kp-qr-download-as') === 'png' ? 'png' : 'svg');
        if (t.closest('[data-kp-qr-show]')) return this.reveal(true);
        if (t.closest('.kp-qr__hide')) return this.reveal(false);
        if (t.closest('[data-kp-qr-retry-action]')) root.dispatchEvent(new CustomEvent(QR_RETRY_EVENT, { bubbles: true }));
    }

    /** Show or hide a code behind its cover; the focus goes to the code, or back to the Show button. @param {boolean} shown */
    reveal(shown) {
        const root = this.host;
        stateOf(root).shown = shown;
        render(root);
        root.dispatchEvent(new CustomEvent(QR_REVEAL_EVENT, { bubbles: true, detail: { shown } }));
        if (shown) {
            root.querySelector('.kp-qr__plate')?.dispatchEvent(new Event('focus'));
            /** @type {HTMLElement | null} */ (root.querySelector('.kp-qr__plate[tabindex]'))?.focus();
        } else /** @type {HTMLElement | null} */ (root.querySelector('[data-kp-qr-show]'))?.focus();
    }
}
