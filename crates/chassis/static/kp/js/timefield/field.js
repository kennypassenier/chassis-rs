// A time field's value and its words: writing the value, the invalid line, committing typed text, and the sync with its attributes.

import { getStrings } from '../strings.js';
import { memoryFor } from '../remember.js';
import { TIME_EVENT, SAY_DELAY_MS } from './constants.js';
import { attr, hasSeconds } from './attributes.js';
import { buildParts, el } from './build.js';
import { FIELDS } from './state.js';
import { parseTimeOfDay, timeInWindow } from './parse.js';
import { TimeList } from './list.js';

/** One time field, built into its root. */
export class TimeField {
    /** @param {HTMLElement} root */
    constructor(root) {
        this.root = root;
        /** The text box. @type {HTMLInputElement} */
        this.input = /** @type {HTMLInputElement} */ (/** @type {unknown} */ (null));
        /** The hidden input that posts `HH:MM`. @type {HTMLInputElement} */
        this.hidden = /** @type {HTMLInputElement} */ (/** @type {unknown} */ (null));
        /** The value as `HH:MM`, or '' while empty or invalid. */
        this.value = '';
        /** The presets above the list. @type {import('./constants.js').TimePresets} */
        this.presets = [];
        /** The invalid message now shown, or ''. */
        this.invalid = '';
        /** The list of times. */
        this.list = new TimeList(this);
    }

    /** Build the parts into the root. Idempotent through `fieldFor`. */
    build() {
        const parts = buildParts(this.root);
        this.input = parts.input;
        this.hidden = parts.hidden;
        this.list.popup = parts.popup;
        this.presets = parts.presets;
    }

    /** Say something through the polite status region, unless the root turns announcing off. @param {string} message */
    say(message) {
        const { root } = this;
        if (root.getAttribute('data-kp-announce') === 'off') return;
        let region = /** @type {HTMLElement | null} */ (root.querySelector(':scope > .kp-time__live'));
        if (!region) {
            region = el('kp-sr-only kp-time__live', 'span');
            region.setAttribute('role', 'status');
            root.append(region);
        }
        const target = region;
        target.textContent = '';
        setTimeout(() => (target.textContent = message), SAY_DELAY_MS);
    }

    /** The why line. */
    get why() {
        return /** @type {HTMLElement} */ (this.root.querySelector('.kp-time__why'));
    }

    /** Show or clear the why line and the invalid mark. @param {string} message */
    setInvalid(message) {
        const { why, input } = this;
        this.invalid = message;
        why.hidden = message === '';
        why.textContent = message;
        why.setAttribute('role', message ? 'alert' : 'note');
        why.removeAttribute('data-kp-time-note');
        input.toggleAttribute('aria-invalid', message !== '');
        if (message) {
            input.setAttribute('aria-invalid', 'true');
            input.setAttribute('aria-describedby', why.id);
        } else {
            input.removeAttribute('aria-describedby');
        }
        input.setCustomValidity(message);
        this.root.toggleAttribute('data-kp-invalid', message !== '');
    }

    /** A quiet note in the why line (a 12-hour paste that was converted). @param {string} message */
    note(message) {
        const { why } = this;
        why.hidden = false;
        why.textContent = message;
        why.setAttribute('role', 'status');
        why.setAttribute('data-kp-time-note', '');
    }

    /**
     * Set the value, the text and the hidden input; fire the event when it changed.
     * @param {string} value @param {{ text?: string, silent?: boolean, converted?: boolean }} [options]
     */
    write(value, { text, silent = false, converted = false } = {}) {
        const { root, input } = this;
        const changed = this.value !== value;
        this.value = value;
        this.hidden.value = value;
        input.value = text ?? value;
        root.setAttribute('data-kp-value', value);
        root.toggleAttribute('data-kp-empty', value === '');
        if (!changed || silent) return;
        memoryFor(root, 'time')?.write('value', value);
        if (value) this.say(getStrings().timeSaid(value));
        root.dispatchEvent(new CustomEvent(TIME_EVENT, { bubbles: true, detail: { value, text: input.value, converted } }));
    }

    /** Refuse the typed text: no value, and the message. @param {string} message */
    refuse(message) {
        this.value = '';
        this.hidden.value = '';
        this.setInvalid(message);
        return false;
    }

    /**
     * Take a typed text as the value, or say why not.
     * @param {string} text @param {{ silent?: boolean }} [options]
     * @returns {boolean} whether the field now holds a valid value (or is validly empty)
     */
    commitText(text, { silent = false } = {}) {
        const { root } = this;
        const s = getStrings();
        const trimmed = text.trim();
        if (trimmed === '') {
            this.write('', { text: '', silent });
            this.setInvalid(root.hasAttribute('data-kp-time-required') ? s.timeRequired : '');
            return !root.hasAttribute('data-kp-time-required');
        }
        const parsed = parseTimeOfDay(trimmed, { seconds: hasSeconds(root) });
        if (!parsed) return this.refuse(s.timeInvalid);
        const min = root.getAttribute('data-kp-time-min');
        const max = root.getAttribute('data-kp-time-max');
        if ((min || max) && !timeInWindow(parsed.value, min, max)) return this.refuse(s.timeOutside(min ?? '00:00', max ?? '23:59'));
        this.setInvalid('');
        this.write(parsed.value, { silent, converted: parsed.converted });
        if (parsed.converted) {
            this.note(s.timeConverted(parsed.value));
            this.say(s.timeConverted(parsed.value));
        }
        return true;
    }

    /** Choose a value from the list or a chip. @param {string} value */
    pick(value) {
        this.setInvalid('');
        this.write(value);
        this.list.close();
        this.input.focus();
        this.input.select();
    }

    /** Show or hide the zone line and the look, and follow disabled and loading. */
    sync() {
        const { root, input } = this;
        const s = getStrings();
        const zone = /** @type {HTMLElement} */ (root.querySelector('.kp-time__zone'));
        const z = attr(root, 'zone', '');
        zone.hidden = z === '';
        zone.textContent = z ? s.timeZoneNote(z) : '';
        root.classList.toggle('kp-time--inline', attr(root, 'look', 'field') === 'inline');
        const loading = root.getAttribute('data-kp-state') === 'loading';
        const off = root.hasAttribute('disabled') || root.hasAttribute('data-kp-disabled') || loading;
        input.disabled = off;
        const toggle = /** @type {HTMLButtonElement} */ (root.querySelector('.kp-time__toggle'));
        const noPopup = attr(root, 'popup', 'list') === 'none';
        toggle.disabled = off || noPopup;
        toggle.hidden = noPopup;
        input.toggleAttribute('required', root.hasAttribute('data-kp-time-required'));
        const reason = root.getAttribute('data-kp-disabled-reason');
        if (off && reason && !loading) input.setAttribute('data-kp-disabled-reason', reason);
        else input.removeAttribute('data-kp-disabled-reason');
        root.toggleAttribute('aria-busy', loading);
    }
}

/** The field of a root, built on first need. @param {HTMLElement} root @returns {TimeField} */
export function fieldFor(root) {
    const known = FIELDS.get(root);
    if (known) return known;
    const field = new TimeField(root);
    field.build();
    FIELDS.set(root, field);
    return field;
}
