// A picker's preview: a theme shown while the pointer or the keyboard rests on its button, never chosen by it, and taken back afterwards.

import { endPreview, previewTheme } from '../theme-core.js';
import { Controller } from '../controller.js';
import { OPTION, PREVIEW_EVENT, PREVIEW_LEAVE_MS } from './values.js';
import { previewRoot, registerFirst } from './register.js';

export class PickerPreview extends Controller {
    /**
     * @param {HTMLElement} host the picker
     * @param {Record<string, unknown>} [options]
     */
    constructor(host, options) {
        super(host, options);
        /** The element wearing a preview now (undefined: the theme root). @type {Element | undefined} */
        this.shownOn = undefined;
        /** Whether this picker has a preview on. */
        this.showing = false;
        this.leaveTimer = 0;
        /** Counts the asks, so an answer that arrives after a newer ask (or after the preview ended) does nothing. */
        this.ask = 0;
    }

    /** Whether previews are on: the `preview` option, else the picker's `data-kp-theme-preview="hover"`. */
    wantsPreview() {
        return this.options.preview ?? this.host.getAttribute('data-kp-theme-preview') === 'hover';
    }

    /** @param {string | null} theme */
    say(theme) {
        this.host.dispatchEvent(new CustomEvent(PREVIEW_EVENT, { bubbles: true, detail: { theme } }));
    }

    /** End the preview and say so. */
    stopPreview() {
        this.ask += 1;
        window.clearTimeout(this.leaveTimer);
        if (this.showing && endPreview({ root: this.shownOn })) this.say(null);
        this.showing = false;
        this.shownOn = undefined;
    }

    /** A choice ends the look: a preview on a sample element is taken off it, one on the root is made real by applyTheme itself. */
    settlePreview() {
        this.ask += 1;
        window.clearTimeout(this.leaveTimer);
        if (this.showing && this.shownOn !== undefined && endPreview({ root: this.shownOn })) this.say(null);
        this.showing = false;
        this.shownOn = undefined;
    }

    /** Go back after a short wait, so crossing the gap between two buttons is not a leave. */
    leaveSoon() {
        window.clearTimeout(this.leaveTimer);
        this.leaveTimer = window.setTimeout(() => this.stopPreview(), PREVIEW_LEAVE_MS);
    }

    /** Show a theme once its register is there. @param {string} theme */
    async startPreview(theme) {
        window.clearTimeout(this.leaveTimer);
        const mine = ++this.ask;
        const on = previewRoot(this.host);
        try {
            await registerFirst(this.host.ownerDocument, theme);
        } catch {
            // A register that failed to load is the page's own fault to report; the preview is simply not shown.
            return;
        }
        if (mine !== this.ask || !this.wantsPreview()) return;
        if (this.showing && this.shownOn !== on) endPreview({ root: this.shownOn });
        this.shownOn = on;
        this.showing = true;
        if (previewTheme(theme, { root: on })) this.say(theme);
    }

    /** The option button an event happened on, if it is one of this picker's. @param {Event} event @returns {HTMLElement | null} */
    optionOf(event) {
        const option = event.target instanceof Element ? event.target.closest(OPTION) : null;
        return option && this.host.contains(option) ? /** @type {HTMLElement} */ (option) : null;
    }
}
