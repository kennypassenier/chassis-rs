// Warns before the page is left with unsaved changes: the browser's own prompt, and a confirmation on in-page links.

import { openConfirmation } from '../components.js';
import { UNSAVED_LEAVE_EVENT } from './config.js';

/** Guards one bar's page against being left by accident. */
export class LeaveGuard {
    /** @param {import('./controller.js').UnsavedController} ctl */
    constructor(ctl) {
        this.ctl = ctl;
        /** Whether the visitor confirmed leaving; the browser's prompt then stays quiet. */
        this.leaving = false;
    }

    connect() {
        const { doc, win } = this.ctl;
        this.ctl.listen(doc, 'click', (event) => this.onLink(/** @type {MouseEvent} */ (event)), true);
        this.ctl.listen(win, 'beforeunload', (event) => this.onBeforeUnload(/** @type {BeforeUnloadEvent} */ (event)));
    }

    /** @param {BeforeUnloadEvent} event */
    onBeforeUnload(event) {
        const { warn } = this.ctl.settings;
        if ((warn === 'browser' || warn === 'both') && this.ctl.tracker.changes().length > 0 && !this.leaving) {
            event.preventDefault();
            event.returnValue = '';
        }
    }

    /** Whether a click is a plain primary click that may follow a link. @param {MouseEvent} event */
    static isPlainClick(event) {
        return !(event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey);
    }

    /** @param {MouseEvent} event */
    onLink(event) {
        const { el, win, s, settings, tracker } = this.ctl;
        if (!(settings.warn === 'app' || settings.warn === 'both') || !LeaveGuard.isPlainClick(event)) return;
        const a = event.target instanceof Element ? event.target.closest('a[href]') : null;
        if (
            !(a instanceof HTMLAnchorElement) ||
            el.contains(a) ||
            a.target === '_blank' ||
            a.hasAttribute('download') ||
            tracker.changes().length === 0
        )
            return;
        const to = new URL(a.href, win.location.href);
        if (to.origin === win.location.origin && to.pathname === win.location.pathname && to.search === win.location.search) return;
        event.preventDefault();
        const asked = el.dispatchEvent(new CustomEvent(UNSAVED_LEAVE_EVENT, { bubbles: true, cancelable: true, detail: { href: a.href } }));
        if (!asked) return;
        const n = tracker.changes().length;
        openConfirmation(a, {
            phrase: s.unsavedLeaveTitle,
            strings: { confirmAccept: s.unsavedLeaveAccept, confirmCancel: s.unsavedLeaveStay, confirmDescription: s.unsavedLeaveText(n) },
            initialFocus: 'cancel',
            onAccept: () => {
                this.leaving = true;
                win.location.href = a.href;
            },
        });
    }
}
