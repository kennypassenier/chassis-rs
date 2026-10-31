// Wires one time field: its typing, keys, paste, clicks, focus, outside presses and the attributes it follows.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { attachDisabledReasons } from '../reason.js';
import { memoryFor } from '../remember.js';
import { BARE_DIGITS, NARROW_QUERY, TIME_RETRY_EVENT } from './constants.js';
import { hasSeconds, presetsFromAttribute } from './attributes.js';
import { fieldFor } from './field.js';
import { onKey } from './keys.js';
import { parseTimeOfDay, timeMinutes } from './parse.js';

/** The attributes that change what the field shows: all of them live. */
const WATCHED = [
    'disabled',
    'data-kp-disabled',
    'data-kp-disabled-reason',
    'data-kp-state',
    ...['look', 'zone', 'popup', 'required', 'step', 'min', 'max', 'presets', 'now', 'clear', 'near', 'near-width', 'seconds'].map(
        (n) => `data-kp-time-${n}`,
    ),
];

/** A time field on a page. */
export class TimeController extends Controller {
    /** @param {HTMLElement} host */
    constructor(host) {
        super(host);
        this.field = /** @type {import('./field.js').TimeField} */ (/** @type {unknown} */ (null));
    }

    connect() {
        const root = this.host;
        const initial = root.getAttribute('data-kp-value') ?? '';
        const field = (this.field = fieldFor(root));
        const remembered = memoryFor(root, 'time')?.read('value', null);
        const start = initial || (typeof remembered === 'string' ? remembered : '');
        const parsed = start ? parseTimeOfDay(start, { seconds: hasSeconds(root) }) : null;
        field.write(parsed ? parsed.value : '', { silent: true });
        field.sync();
        this.own(attachDisabledReasons(root));
        this.own(() => field.list.close());
        this.watchAttributes();
        const doc = root.ownerDocument;
        this.listen(doc, 'pointerdown', (event) => this.onOutside(/** @type {PointerEvent} */ (event)), true);
        this.listen(field.list.popup, 'pointerdown', (event) => this.onPopupDown(/** @type {PointerEvent} */ (event)));
        this.listen(root, 'focusin', () => this.onFocusIn());
        this.listen(root, 'focusout', (event) => this.onFocusOut(/** @type {FocusEvent} */ (event)));
        this.listen(root, 'click', (event) => this.onClick(/** @type {MouseEvent} */ (event)));
        this.listen(field.input, 'paste', (event) => this.onPaste(/** @type {ClipboardEvent} */ (event)));
        this.listen(field.input, 'keydown', (event) => onKey(field, /** @type {KeyboardEvent} */ (event)));
        this.listen(field.input, 'input', () => this.onInput());
    }

    /** Every option is live: presets and the list's entries follow their attributes. */
    watchAttributes() {
        const { field, host } = this;
        const observer = this.observe(
            new MutationObserver(() => {
                field.sync();
                if (Array.isArray(field.presets) || field.presets.length === 0) field.presets = presetsFromAttribute(host);
                if (field.list.open) field.list.draw();
            }),
        );
        observer.observe(host, { attributes: true, attributeFilter: WATCHED });
    }

    /** Digits typed fast: 0230 becomes 02:30 as the fourth digit arrives; an open list follows the typed time. */
    onInput() {
        const { field, host } = this;
        const { input, list } = field;
        const v = input.value;
        if (new RegExp(`^\\d{${BARE_DIGITS}}$`).test(v)) input.value = `${v.slice(0, 2)}:${v.slice(2)}`;
        if (field.invalid) field.setInvalid('');
        if (!list.open) return;
        const p = parseTimeOfDay(input.value, { seconds: hasSeconds(host) });
        if (!p) return;
        list.active = this.nearestOption(timeMinutes(p.value));
        list.markActive();
    }

    /** The index of the option closest to a time; the active one when none has a time. @param {number} t */
    nearestOption(t) {
        const { list } = this.field;
        const options = /** @type {HTMLElement[]} */ ([...list.popup.querySelectorAll('.kp-time__option')]);
        let best = list.active;
        let delta = Infinity;
        options.forEach((o, i) => {
            const v = o.getAttribute('data-kp-time-pick') ?? '';
            if (!v) return;
            const d = Math.abs(timeMinutes(v) - t);
            if (d < delta) {
                delta = d;
                best = i;
            }
        });
        return best;
    }

    onBlur() {
        const { field, host } = this;
        if (field.list.open) return;
        if (field.input.value.trim() !== field.value || field.invalid) field.commitText(field.input.value);
        else if (field.input.value.trim() === '' && host.hasAttribute('data-kp-time-required') && host.hasAttribute('data-kp-time-touched'))
            field.setInvalid(getStrings().timeRequired);
        host.setAttribute('data-kp-time-touched', '');
    }

    /** @param {MouseEvent} event */
    onClick(event) {
        const { field, host } = this;
        const { list, input } = field;
        const t = event.target instanceof Element ? event.target : null;
        if (!t) return;
        if (t.closest('.kp-time__toggle')) {
            if (list.open) list.close({ focus: true });
            else {
                input.focus();
                list.show();
            }
            return;
        }
        const choice = t.closest('[data-kp-time-pick]');
        if (choice && list.popup.contains(choice)) return field.pick(choice.getAttribute('data-kp-time-pick') ?? '');
        if (t.closest('[data-kp-time-retry]')) {
            host.dispatchEvent(new CustomEvent(TIME_RETRY_EVENT, { bubbles: true }));
            return;
        }
        if (t === input && !list.open && window.matchMedia(NARROW_QUERY).matches) list.show();
    }

    /** @param {FocusEvent} event */
    onFocusOut(event) {
        const next = /** @type {Node | null} */ (event.relatedTarget);
        if (next && this.host.contains(next)) return;
        if (this.field.list.open) this.field.list.close();
        this.onBlur();
    }

    onFocusIn() {
        const { input } = this.field;
        if (!input.disabled) requestAnimationFrame(() => document.activeElement === input && input.select());
    }

    /** A paste is read as a time, whole: `2:30 PM` is converted. @param {ClipboardEvent} event */
    onPaste(event) {
        const text = event.clipboardData?.getData('text') ?? '';
        if (!text) return;
        event.preventDefault();
        this.field.input.value = text.trim();
        this.field.commitText(text);
    }

    /** A press on the list keeps the focus where it was, so the field does not commit half-way. @param {PointerEvent} event */
    onPopupDown(event) {
        if (event.target instanceof Element && this.field.list.popup.contains(event.target) && !event.target.closest('button'))
            event.preventDefault();
    }

    /** @param {PointerEvent} event */
    onOutside(event) {
        const { list } = this.field;
        if (list.open && event.target instanceof Node && !this.host.contains(event.target) && !list.popup.contains(event.target)) list.close();
    }
}
