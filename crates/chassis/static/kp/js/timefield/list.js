// The list of times: the presets above it, the options, the active option, and opening it on the overlay layer.

import { getStrings } from '../strings.js';
import { raiseOverlay } from '../top-layer.js';
import { motionAllowed } from '../calm.js';
import { NARROW_QUERY, POPUP_EDGE_PX, POPUP_GAP_PX, POPUP_MIN_WIDTH_PX } from './constants.js';
import { attr, entries, nearOf } from './attributes.js';
import { el } from './build.js';
import { timeMinutes } from './parse.js';

/** @typedef {import('./field.js').TimeField} TimeField */
/** @typedef {import('./constants.js').TimeEntry} TimeEntry */

/** The popover of one field. */
export class TimeList {
    /** @param {TimeField} field */
    constructor(field) {
        this.field = field;
        /** The popover element; set when the field is built. @type {HTMLElement} */
        this.popup = /** @type {HTMLElement} */ (/** @type {unknown} */ (null));
        this.open = false;
        /** The index of the active option, -1 for none. */
        this.active = -1;
        /** Puts the list back below the overlays it was raised over. @type {(() => void) | null} */
        this.lower = null;
    }

    /** The loading bar, the failed plate with its Retry, or the preset chips. @param {import('./constants.js').TimePresets} presets */
    buildPresets(presets) {
        const s = getStrings();
        const bar = el('kp-time__presets');
        bar.setAttribute('role', 'group');
        bar.setAttribute('aria-label', s.timePresets);
        if (presets === 'loading') {
            for (let i = 0; i < 3; i += 1) bar.append(el('kp-skeleton kp-time__preset-skeleton', 'span'));
            bar.setAttribute('aria-busy', 'true');
        } else if (presets === 'error') {
            const plate = el('kp-alert kp-alert--destructive kp-time__presets-error');
            plate.setAttribute('role', 'alert');
            const text = el('kp-time__presets-text', 'span');
            text.textContent = s.timePresetsFailed;
            const retry = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--sm', 'button'));
            retry.type = 'button';
            retry.setAttribute('data-kp-time-retry', '');
            retry.textContent = s.timeRetry;
            plate.append(text, retry);
            bar.append(plate);
        } else {
            for (const p of presets) {
                const chip = /** @type {HTMLButtonElement} */ (el('kp-time__preset kp-button kp-button--sm', 'button'));
                chip.type = 'button';
                chip.setAttribute('data-kp-time-pick', p.value);
                chip.textContent = p.label === p.value ? p.value : `${p.label} ${p.value}`;
                bar.append(chip);
            }
        }
        return bar;
    }

    /** One option of the list. @param {TimeEntry} item @param {number} index */
    buildOption(item, index) {
        const s = getStrings();
        const { field, popup } = this;
        const o = /** @type {HTMLElement} */ (el('kp-combobox__option kp-time__option', 'li'));
        o.id = `${popup.id}-o${index}`;
        o.setAttribute('role', 'option');
        o.setAttribute('data-kp-time-pick', item.value);
        o.setAttribute('aria-selected', String(item.value === field.value && item.kind === 'time'));
        o.tabIndex = -1;
        const t = el('kp-time__option-time', 'span');
        t.textContent = item.kind === 'clear' ? s.timeNone : item.value;
        o.append(t);
        if (item.kind === 'now') {
            const n = el('kp-time__option-note', 'span');
            n.textContent = s.timeNow;
            o.append(n);
        }
        const near = item.kind === 'time' ? nearOf(field.root, item.value) : null;
        if (near) {
            o.setAttribute('data-kp-time-near-mark', '');
            const n = el('kp-time__option-note', 'span');
            n.textContent = s.timeNear(near);
            o.append(n);
            o.setAttribute('aria-description', s.timeNear(near));
        }
        return o;
    }

    /** The index of the time entry nearest the value, or -1 when the value is no time. @param {TimeEntry[]} items */
    nearestIndex(items) {
        const now = timeMinutes(this.field.value);
        let best = -1;
        let bestDelta = Infinity;
        if (Number.isNaN(now)) return best;
        items.forEach((item, index) => {
            if (item.kind !== 'time') return;
            const d = Math.abs(timeMinutes(item.value) - now);
            if (d < bestDelta) {
                bestDelta = d;
                best = index;
            }
        });
        return best;
    }

    /** Draw the list for the current value. */
    draw() {
        const s = getStrings();
        const { field, popup } = this;
        popup.replaceChildren();
        const sheetTitle = el('kp-time__sheet-title', 'p');
        sheetTitle.textContent = field.input.getAttribute('aria-label') ?? s.timeChoose;
        popup.append(sheetTitle);
        const presets = field.presets;
        if (presets === 'loading' || presets === 'error' || (Array.isArray(presets) && presets.length)) popup.append(this.buildPresets(presets));
        const list = el('kp-time__list', 'ul');
        list.setAttribute('role', 'listbox');
        list.setAttribute('aria-label', s.timeList);
        list.id = `${popup.id}-list`;
        const items = entries(field.root);
        items.forEach((item, index) => list.append(this.buildOption(item, index)));
        popup.append(list);
        const best = this.nearestIndex(items);
        this.active = best >= 0 ? best : items.findIndex((i) => i.kind === 'time');
        this.markActive(false);
    }

    /** Mark the active option and, when asked or on the first time, scroll it to the middle. @param {boolean} [scroll] */
    markActive(scroll = true) {
        const { field, popup } = this;
        const options = /** @type {HTMLElement[]} */ ([...popup.querySelectorAll('.kp-time__option')]);
        options.forEach((o, i) => {
            o.toggleAttribute('data-kp-active', i === this.active);
            o.classList.toggle('is-active', i === this.active);
        });
        const at = options[this.active];
        if (!at) {
            field.input.removeAttribute('aria-activedescendant');
            return;
        }
        field.input.setAttribute('aria-activedescendant', at.id);
        const list = /** @type {HTMLElement} */ (popup.querySelector('.kp-time__list'));
        if (scroll || !list.hasAttribute('data-kp-time-placed')) {
            list.setAttribute('data-kp-time-placed', '');
            const top = at.offsetTop - list.clientHeight / 2 + at.offsetHeight / 2;
            list.scrollTo({ top: Math.max(0, top), behavior: scroll && motionAllowed(field.root) ? 'smooth' : 'auto' });
        }
    }

    /** Place the list: a sheet at the foot of a narrow screen, else under (or over) the field. @param {HTMLElement} popup */
    place(popup) {
        const { input } = this.field;
        const r = input.closest('.kp-time__control')?.getBoundingClientRect() ?? input.getBoundingClientRect();
        if (window.matchMedia(NARROW_QUERY).matches) {
            popup.style.setProperty('left', '0px');
            popup.style.setProperty('right', '0px');
            popup.style.setProperty('bottom', '0px');
            popup.style.setProperty('top', 'auto');
            popup.style.setProperty('width', 'auto');
            return;
        }
        const h = popup.offsetHeight;
        const below = window.innerHeight - r.bottom;
        const top = below >= h + POPUP_EDGE_PX || below >= r.top ? r.bottom + POPUP_GAP_PX : r.top - h - POPUP_GAP_PX;
        popup.style.setProperty('left', `${Math.max(POPUP_EDGE_PX, Math.min(r.left, window.innerWidth - popup.offsetWidth - POPUP_EDGE_PX))}px`);
        popup.style.setProperty('top', `${Math.max(POPUP_EDGE_PX, top)}px`);
        popup.style.setProperty('right', 'auto');
        popup.style.setProperty('bottom', 'auto');
        popup.style.setProperty('width', `${Math.max(r.width, POPUP_MIN_WIDTH_PX)}px`);
    }

    show() {
        const { field, popup } = this;
        if (this.open || attr(field.root, 'popup', 'list') === 'none' || field.input.disabled) return;
        this.open = true;
        this.draw();
        popup.hidden = false;
        field.input.setAttribute('aria-expanded', 'true');
        field.root.setAttribute('data-kp-open', '');
        this.lower = raiseOverlay(popup, (p) => this.place(p));
        this.markActive(false);
    }

    /** @param {{ focus?: boolean }} [options] */
    close({ focus = false } = {}) {
        const { field, popup } = this;
        if (!this.open) return;
        this.open = false;
        this.lower?.();
        this.lower = null;
        popup.hidden = true;
        field.input.setAttribute('aria-expanded', 'false');
        field.input.removeAttribute('aria-activedescendant');
        field.root.removeAttribute('data-kp-open');
        if (focus) field.input.focus();
    }
}
