// One quantity: its first paint, a held button that repeats, the keys of the spin button, and the typing that is read on Enter or when the field is left.

import { Controller } from '../controller.js';
import { HOLD_DELAY, HOLD_FAST, HOLD_SLOW, HOLD_SLOW_REPEATS, PAGE_STEPS } from './values.js';
import { parseQuantity, rulesOf } from './math.js';
import { change, paint } from './paint.js';
import { getQuantity, inputOf, isDisabled } from './read.js';

/** The events that end a held button, listened to in the capture phase. */
const RELEASE_EVENTS = ['pointerup', 'pointerleave', 'pointercancel', 'blur'];

export class QuantityControl extends Controller {
    /**
     * @param {HTMLElement} host
     * @param {Record<string, unknown>} [options]
     */
    constructor(host, options) {
        super(host, options);
        /** @type {ReturnType<typeof setTimeout> | null} */
        this.timer = null;
        /** The button a pointer pressed (it stepped on the way down), until its click. @type {HTMLElement | null} */
        this.pressed = null;
    }

    connect() {
        const root = this.host;
        paint(root, getQuantity(root));
        this.listen(root, 'pointerdown', (event) => this.down(/** @type {PointerEvent} */ (event)));
        this.listen(root, 'click', (event) => this.click(/** @type {MouseEvent} */ (event)));
        this.listen(root, 'keydown', (event) => this.key(/** @type {KeyboardEvent} */ (event)));
        this.listen(root, 'input', () => this.typing());
        this.listen(root, 'focusout', () => this.commit());
        for (const type of RELEASE_EVENTS) this.listen(root, type, () => this.stop(), true);
        // Registered last, so it runs first on detach: a held button stops before the listeners go.
        this.own(() => this.stop());
    }

    /** Stop the repeat of a held button. */
    stop() {
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
    }

    /** Remember the button a pointer pressed, or forget it. @param {HTMLElement | null} button */
    press(button) {
        this.pressed = button;
    }

    /** The step button an event happened on, if it is one of this quantity's. @param {Event} event @returns {HTMLElement | null} */
    stepButton(event) {
        const b = event.target instanceof Element ? /** @type {HTMLElement | null} */ (event.target.closest('.kp-quantity__step')) : null;
        return b && this.host.contains(b) ? b : null;
    }

    /** One step of a button. @param {HTMLElement} b @returns {boolean} whether the value moved */
    stepOnce(b) {
        if (b.getAttribute('aria-disabled') === 'true') return false;
        const by = Number(b.getAttribute('data-kp-quantity-by')) || 0;
        return change(this.host, getQuantity(this.host) + by * rulesOf(this.host).step, 'button');
    }

    /** A pointer went down on a button: step now, and again while it is held, slowly first and then faster. @param {PointerEvent} event */
    down(event) {
        const b = this.stepButton(event);
        if (!b || event.button !== 0 || isDisabled(this.host)) return;
        this.press(b);
        this.stepOnce(b);
        let repeats = 0;
        const again = () => {
            repeats += 1;
            if (!this.stepOnce(b)) return this.stop();
            this.timer = setTimeout(again, repeats > HOLD_SLOW_REPEATS ? HOLD_FAST : HOLD_SLOW);
        };
        this.stop();
        this.timer = setTimeout(again, HOLD_DELAY);
    }

    /** @param {MouseEvent} event */
    click(event) {
        const b = this.stepButton(event);
        if (!b) return;
        // A pointer press already stepped on its way down; a key's click (no pointer, `detail` 0) steps here.
        if (event.detail > 0 && this.pressed === b) {
            this.press(null);
            return;
        }
        this.press(null);
        this.stepOnce(b);
    }

    /**
     * Where a key moves the value to, or null when the key means nothing here.
     * @param {string} key
     * @param {number} now
     * @returns {number | null}
     */
    target(key, now) {
        const rules = rulesOf(this.host);
        if (key === 'ArrowUp') return now + rules.step;
        if (key === 'ArrowDown') return now - rules.step;
        if (key === 'PageUp') return now + rules.step * PAGE_STEPS;
        if (key === 'PageDown') return now - rules.step * PAGE_STEPS;
        if (key === 'Home' && Number.isFinite(rules.min)) return rules.min;
        if (key === 'End' && Number.isFinite(rules.max)) return rules.max;
        return null;
    }

    /** @param {KeyboardEvent} event */
    key(event) {
        if (event.target !== inputOf(this.host) || event.altKey || event.ctrlKey || event.metaKey) return;
        const now = getQuantity(this.host);
        if (event.key === 'Enter') return this.commit();
        if (event.key === 'Escape') return paint(this.host, now);
        const to = this.target(event.key, now);
        if (to === null) return;
        event.preventDefault();
        change(this.host, to, 'key');
    }

    /** Mark a text that is not a number while it stands. */
    typing() {
        const input = inputOf(this.host);
        if (!input) return;
        const read = parseQuantity(input.value);
        if (input.value.trim() === '' || !Number.isFinite(read)) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
    }

    /** Take what is typed: change to it, or put the last value back. */
    commit() {
        const input = inputOf(this.host);
        if (!input) return;
        const read = parseQuantity(input.value);
        if (!Number.isFinite(read)) paint(this.host, getQuantity(this.host));
        else change(this.host, read, 'typed');
    }
}
