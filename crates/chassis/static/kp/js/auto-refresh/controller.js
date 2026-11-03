// One automatic refresh control: the interval, the schedule with its back-off, what makes a refresh wait, and the events [kpadopt5-ops].

import { watchOptions } from '../live-options.js';
import { getStrings } from '../strings.js';
import { RefreshBase } from './base.js';
import { matchesKeySpec, resolveKeySpec } from '../key-spec.js';
import { REFRESH_DEFAULT, REFRESH_KEY, REFRESH_KEY_ATTRIBUTE, WATCHED_ATTRIBUTES } from './constants.js';
import { NARROW_ATTRIBUTE, isNarrow } from './narrow.js';

/** The controller of one `[data-kp-refresh]` control. */
export class RefreshController extends RefreshBase {
    connect() {
        const el = this.host;
        const { bar, count, custom, failure } = this.parts;
        el.classList.add('kp-refresh');
        el.toggleAttribute(NARROW_ATTRIBUTE, isNarrow(el));
        this.chooser.build();
        this.labels.paintLabel();
        this.labels.paintTitle();
        el.replaceChildren(bar, count, custom, failure);
        this.chooser.wire();
        this.own(() => this.chooser.unwire?.());
        this.own(() => this.view.clearTimeout(this.timer));
        this.wireEvents();
        this.own(watchOptions(el, WATCHED_ATTRIBUTES, (names) => this.onOptions(names)));
        if (typeof ResizeObserver !== 'undefined') this.observe(new ResizeObserver(() => this.fitNarrow())).observe(el);
        this.paintChoice();
        this.paintAgo();
        this.schedule();
    }

    /** Listen to the chooser, the custom form, the buttons, the R key and the tab's visibility. */
    wireEvents() {
        const { custom, now, retry } = this.parts;
        const picked = (/** @type {Event} */ event) => this.onPicked(/** @type {CustomEvent} */ (event));
        this.listen(this.host, 'kp-menu-select', picked);
        this.listen(this.host, 'kp-segmented-change', picked);
        this.listen(custom, 'submit', (event) => this.onCustomSubmit(/** @type {SubmitEvent} */ (event)));
        custom.addEventListener('keydown', (event) => this.onCustomKey(event));
        this.listen(now, 'click', () => this.refreshNow('now'));
        this.listen(retry, 'click', () => this.refreshNow('retry'));
        this.listen(this.doc, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(this.doc, 'visibilitychange', () => this.onVisible());
    }

    // --- Events. ---
    /** The chooser picked a value: "other" opens the custom form. @param {CustomEvent} event */
    onPicked(event) {
        const { custom, input } = this.parts;
        const value = event.detail?.value;
        if (value === undefined || value === null) return;
        if (value === 'other') {
            custom.hidden = false;
            input.value = String(this.interval || REFRESH_DEFAULT);
            input.focus();
            input.select();
            return;
        }
        custom.hidden = true;
        this.setInterval(Number(value), 'user');
    }

    /** @param {SubmitEvent} event */
    onCustomSubmit(event) {
        const { custom, input, problem } = this.parts;
        event.preventDefault();
        const n = Number(input.value);
        if (!Number.isInteger(n) || n < 1) {
            problem.textContent = getStrings().refreshInvalid;
            input.setAttribute('aria-invalid', 'true');
            input.focus();
            return;
        }
        problem.textContent = '';
        input.removeAttribute('aria-invalid');
        custom.hidden = true;
        this.setInterval(n, 'user');
    }

    /** Escape closes the custom form and gives the focus back to the chooser. @param {KeyboardEvent} event */
    onCustomKey(event) {
        if (event.key !== 'Escape') return;
        this.parts.custom.hidden = true;
        this.chooser.focusTarget()?.focus?.();
    }

    /** The refresh key (default R, `data-kp-refresh-key`) refreshes now, except inside a field. @param {KeyboardEvent} event */
    onKey(event) {
        if (!matchesKeySpec(event, resolveKeySpec(this.host, REFRESH_KEY_ATTRIBUTE, undefined, REFRESH_KEY), { anyShift: true })) return;
        const t = event.target;
        if (t instanceof HTMLElement && t.matches('input, textarea, select, [contenteditable]')) return;
        this.refreshNow('now');
    }

    /** Hidden: stop. Visible again: refresh once if one was due, else wait out the rest. */
    onVisible() {
        if (this.doc.visibilityState === 'hidden') {
            this.view.clearTimeout(this.timer);
            this.parts.count.removeAttribute('data-kp-run');
            return;
        }
        if (this.interval > 0 && !this.busy) {
            if (this.takeReturnDue()) this.fire();
            else this.schedule(Math.max(0, this.dueAt - this.clock()));
        }
    }

    /**
     * The options are read again when their attribute changes [live-options-1019]: the look redraws the chooser (segments or a
     * menu), the choices and the freshness line follow their attributes, and a new `data-kp-refresh` sets the interval.
     * @param {string[]} names
     */
    onOptions(names) {
        if (names.includes('data-kp-refresh-title')) this.labels.paintTitle();
        if (names.includes('data-kp-refresh-label')) this.labels.paintLabel();
        if (names.includes('data-kp-refresh-line') || names.includes('data-kp-refresh-stack')) this.fitNarrow();
        if (names.includes('data-kp-look') && this.chooser.look() !== this.chooser.drawnLook) this.chooser.redraw(this.choices(), this.interval);
        if (names.includes('data-kp-refresh-choices')) this.paintChoice();
        if (names.includes('data-kp-stale-after') || names.includes('data-kp-announce')) this.paintAgo();
        if (names.includes('data-kp-refresh')) {
            const next = Number(this.host.getAttribute('data-kp-refresh'));
            if (Number.isFinite(next) && next >= 0 && Math.round(next) !== this.interval) this.setInterval(next, 'script');
        }
    }

    /** The bar is narrow or not at the control's width now [ux-1101 round 2]: the attribute follows, the chooser turns into segments
     * (or back into the look it names) and the current choice is brought into view. */
    fitNarrow() {
        const narrow = isNarrow(this.host);
        if (narrow === this.host.hasAttribute(NARROW_ATTRIBUTE)) return;
        this.host.toggleAttribute(NARROW_ATTRIBUTE, narrow);
        if (this.chooser.look() !== this.chooser.drawnLook) this.chooser.redraw(this.choices(), this.interval);
        else this.chooser.showCurrent();
    }
}
