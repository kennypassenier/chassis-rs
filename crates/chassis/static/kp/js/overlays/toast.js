// Toasts: the region, the stack and the toast that waits while it is attended.
import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { leave } from '../motion.js';
import { TOAST_HIDE_EVENT, TOAST_LINGER_MS, TOAST_MS, TOAST_PAUSE_EVENT, TOAST_SHOW_EVENT } from './constants.js';

/**
 * The page's toast region, created on first use.
 *
 * @param {{ region?: HTMLElement | null, role?: string, live?: 'polite' | 'assertive' | 'off', className?: string }} [options]
 * @returns {HTMLElement}
 */
export function toastRegion({ region = null, role = 'status', live = 'polite', className = 'kp-toasts' } = {}) {
    if (region) return region;
    let found = /** @type {HTMLElement | null} */ (document.querySelector(`.${className.split(/\s+/)[0]}`));
    if (!found) {
        found = document.createElement('div');
        found.className = className;
        found.setAttribute('role', role);
        found.setAttribute('aria-live', live);
        document.body.append(found);
    }
    return found;
}

/** The toasts dismissed and leaving now, which a stack's `max` no longer counts. @type {WeakSet<Element>} */
export const goingToasts = new WeakSet();

/**
 * Show a toast in the page's toast region, creating the region if it is
 * not there. role="status" rather than role="alert" by default: a toast
 * is an announcement, and alert interrupts whatever a screen reader was
 * saying. An error that must interrupt passes `live: 'assertive'` on its
 * own toast, which gets its own live region so the politeness is per
 * message rather than per page.
 *
 * A toast does not leave under a reader's eye: while the pointer is on it or
 * focus is inside it, its clock stops (`data-kp-paused` on the toast, and
 * TOAST_PAUSE_EVENT), and `linger` ms after both have gone it leaves. Esc on a
 * focused toast closes it. `pause: false` brings back the plain timer.
 * `close: true` adds a close button; `sticky: true` is `ms: 0` plus that
 * button, a toast that stays until it is closed (an undo that needs a
 * decision, an error to be read). The buttons sit at the toast's end.
 *
 * @param {string | Node} content text, or a node the consumer built
 * @param {{ ms?: number, region?: HTMLElement | null, live?: 'polite' | 'assertive', className?: string, action?: { label: string, onClick: () => void }, max?: number, pause?: boolean, linger?: number, close?: boolean, sticky?: boolean }} [options]
 *   ms: 0 keeps the toast until dismissed; max: drop the oldest beyond this many;
 *   pause: stop the clock while hovered or focused (default true); linger: ms left after both have gone (default TOAST_LINGER_MS);
 *   close: add a close button; sticky: stay until closed, with a close button
 * @returns {HTMLElement & { dismiss: () => void }} the toast, so a caller can remove it early
 */
export function toast(
    content,
    {
        ms = TOAST_MS,
        region = null,
        live,
        className = 'kp-toast',
        action,
        max,
        pause = true,
        linger = TOAST_LINGER_MS,
        close = false,
        sticky = false,
    } = {},
) {
    const host =
        live === 'assertive'
            ? toastRegion({ role: 'alert', live: 'assertive', className: 'kp-toasts kp-toasts--assertive' })
            : toastRegion({ region });
    const el = /** @type {HTMLElement & { dismiss: () => void }} */ (/** @type {unknown} */ (document.createElement('div')));
    el.className = className;
    // The words in their own box, so the buttons sit at the toast's end
    // whatever the text's length (second nostromo pass, 2026-09-13).
    const body = document.createElement('span');
    body.className = 'kp-toast__body';
    if (typeof content === 'string') body.textContent = content;
    else body.append(content);
    el.append(body);
    if (action) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'kp-button kp-button--ghost';
        button.textContent = action.label;
        button.addEventListener('click', action.onClick);
        el.append(button);
    }
    if (close || sticky) {
        const closer = document.createElement('button');
        closer.type = 'button';
        closer.className = 'kp-icon-button kp-toast__close';
        closer.setAttribute('aria-label', getStrings().close);
        closer.textContent = '×';
        // Wired here, so the toast closes without attachDismissals; the mark
        // keeps that one from closing it a second time.
        closer.setAttribute('data-kp-dismiss-owner', '');
        closer.addEventListener('click', () => el.dismiss());
        el.append(closer);
    }
    const clock = new ToastClock(el, host, { lasting: sticky ? 0 : ms, pause, linger });
    el.dismiss = () => clock.dismiss();
    host.append(el);
    if (max !== undefined) {
        // The oldest beyond `max`, not counting those already on their way out.
        const staying = [...host.children].filter((child) => !goingToasts.has(child));
        for (const old of staying.slice(0, Math.max(0, staying.length - max)))
            /** @type {HTMLElement & { dismiss?: () => void }} */ (old).dismiss?.();
    }
    host.dispatchEvent(
        new CustomEvent(TOAST_SHOW_EVENT, { bubbles: true, detail: { toast: el, text: typeof content === 'string' ? content : el.textContent } }),
    );
    clock.connect();
    return el;
}

/**
 * One toast's clock: the timer that dismisses it, and whether a pointer or the focus holds it. Its listeners go with the toast,
 * which leaves the page on its own, so nothing detaches it.
 */
class ToastClock extends Controller {
    /**
     * @param {HTMLElement} el the toast
     * @param {HTMLElement} region the region it sits in, which hears TOAST_HIDE_EVENT
     * @param {{ lasting: number, pause: boolean, linger: number }} options lasting 0: until dismissed
     */
    constructor(el, region, options) {
        super(el, options);
        this.region = region;
        this.lasting = options.lasting;
        this.pause = options.pause;
        this.linger = options.linger;
        this.timer = 0;
        /** Whether a mouse or a pen is on the toast, whether the focus is inside it, and whether the clock is stopped. */
        this.pointer = false;
        this.focus = false;
        this.held = false;
    }

    connect() {
        const el = this.host;
        if (this.lasting > 0) {
            this.timer = window.setTimeout(() => this.dismiss(), this.lasting);
            if (this.pause) this.holdWhileAttended();
        }
        // Esc on a toast with focus in it closes it, with or without a clock.
        this.listen(el, 'keydown', (event) => {
            if (/** @type {KeyboardEvent} */ (event).key !== 'Escape' || event.defaultPrevented) return;
            event.preventDefault();
            this.dismiss();
        });
    }

    /**
     * It leaves the theme's way (js/motion.js), the way it arrived turned around where the theme opens so: it popped out at once
     * while it came in with the theme's motion (Kenny, 2026-10-05). The event comes once it is gone.
     */
    dismiss() {
        const el = this.host;
        clearTimeout(this.timer);
        if (!el.isConnected || goingToasts.has(el)) return;
        goingToasts.add(el);
        void leave(el).then(() => this.region.dispatchEvent(new CustomEvent(TOAST_HIDE_EVENT, { bubbles: true, detail: { toast: el } })));
    }

    /**
     * Stop the clock while a pointer is on the toast or focus is inside it, and start `linger` ms after both are gone. A touch is
     * not "hovering": its pointerenter comes with the tap and its leave with the lift, so only a mouse or a pen holds a toast, and
     * focus does for the rest.
     */
    holdWhileAttended() {
        const el = this.host;
        this.listen(el, 'pointerenter', (event) => {
            if (/** @type {PointerEvent} */ (event).pointerType === 'touch') return;
            this.pointer = true;
            this.settle();
        });
        this.listen(el, 'pointerleave', () => {
            this.pointer = false;
            this.settle();
        });
        this.listen(el, 'focusin', () => {
            this.focus = true;
            this.settle();
        });
        this.listen(el, 'focusout', (event) => {
            // Focus moving to another part of the same toast is still attended.
            const to = /** @type {FocusEvent} */ (event).relatedTarget;
            if (to instanceof Node && el.contains(to)) return;
            this.focus = false;
            this.settle();
        });
    }

    settle() {
        const el = this.host;
        const attended = this.pointer || this.focus;
        if (attended === this.held) return;
        this.held = attended;
        clearTimeout(this.timer);
        el.toggleAttribute('data-kp-paused', this.held);
        if (!this.held) this.timer = window.setTimeout(() => this.dismiss(), this.linger);
        el.parentElement?.dispatchEvent(new CustomEvent(TOAST_PAUSE_EVENT, { bubbles: true, detail: { toast: el, paused: this.held } }));
    }
}
