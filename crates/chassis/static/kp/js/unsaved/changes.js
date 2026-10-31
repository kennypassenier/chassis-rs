// Tracks what is changed: the baseline of every control, the rows marked `data-kp-changed`, and the list of changes.

import { CONTROL, ROW } from './config.js';
import { readDefault, readValue } from './values.js';

/** @typedef {import('./config.js').UnsavedChange} UnsavedChange */

/** Follows the controls of one bar's scope against the values they had when the bar looked. */
export class ChangeTracker {
    /**
     * @param {HTMLElement} el the bar
     * @param {HTMLElement} scope the form or area to watch
     * @param {import('../strings.js').Strings} s
     */
    constructor(el, scope, s) {
        this.el = el;
        this.scope = scope;
        this.s = s;
        /** What each tracked control held when the bar looked (the markup's value). @type {Map<HTMLElement, string>} */
        this.baseline = new Map();
    }

    /** The controls in the scope that count, the bar's own and the `data-kp-untracked` ones left out. */
    tracked() {
        return /** @type {HTMLInputElement[]} */ ([...this.scope.querySelectorAll(CONTROL)]).filter(
            (c) => !this.el.contains(c) && !c.hasAttribute('data-kp-untracked'),
        );
    }

    /** Take the markup's values as the baseline. */
    capture() {
        this.baseline.clear();
        for (const c of this.tracked()) this.baseline.set(c, readDefault(c));
    }

    /** Take the values the controls hold now as the baseline (after a save). */
    adoptCurrent() {
        this.baseline.clear();
        for (const c of this.tracked()) this.baseline.set(c, readValue(c));
    }

    /** @param {Element} control @returns {HTMLElement} the row that stands for it */
    rowOf(control) {
        return /** @type {HTMLElement} */ (control.closest(ROW) ?? control);
    }

    /** The controls of a row. @param {HTMLElement} row */
    controlsOf(row) {
        return /** @type {HTMLInputElement[]} */ (row.matches(CONTROL) ? [row] : [...row.querySelectorAll(CONTROL)]);
    }

    /** The name a row goes by in the list: its `data-kp-name`, its label, else what its control is called. @param {HTMLElement} row */
    labelOf(row) {
        if (row.dataset.kpName) return row.dataset.kpName;
        const node = row.querySelector('.kp-formrow__label, dt, .kp-kv__key');
        if (node) {
            const copy = /** @type {HTMLElement} */ (node.cloneNode(true));
            copy.querySelectorAll('small, .kp-sr-only').forEach((n) => n.remove());
            const text = copy.textContent?.replace(/\s+/g, ' ').trim();
            if (text) return text;
        }
        const c = row.matches(CONTROL) ? row : row.querySelector(CONTROL);
        return c?.getAttribute('aria-label') ?? c?.getAttribute('name') ?? c?.id ?? this.s.unsavedUnnamed;
    }

    /** What a value reads as in the list. @param {HTMLElement} control @param {string} value */
    show(control, value) {
        const s = this.s;
        if (control instanceof HTMLInputElement && control.type === 'password') return s.unsavedSecret;
        if (control.matches('[data-kp-secret]')) return s.unsavedSecret;
        if (control instanceof HTMLInputElement && control.type === 'checkbox') return value === 'on' ? s.unsavedOn : s.unsavedOff;
        if (control instanceof HTMLSelectElement) return [...control.options].find((o) => o.value === value)?.textContent?.trim() ?? value;
        return value === '' ? s.unsavedEmpty : value;
    }

    /** Mark and unmark the row of one control, as it is edited. @param {HTMLInputElement} control */
    track(control) {
        if (!this.baseline.has(control)) this.baseline.set(control, readDefault(control));
        const row = this.rowOf(control);
        const mine = this.controlsOf(row).filter((c) => this.baseline.has(c));
        const differs = mine.filter((c) => readValue(c) !== this.baseline.get(c));
        if (differs.length === 0) {
            row.removeAttribute('data-kp-changed');
            row.removeAttribute('data-kp-was');
            if (row.getAttribute('data-kp-state') === 'error') row.removeAttribute('data-kp-state');
        } else {
            row.setAttribute('data-kp-changed', '');
            const c = differs[0];
            row.setAttribute('data-kp-was', this.show(c, this.baseline.get(c) ?? ''));
        }
    }

    /** The changes now, one per marked row. @returns {UnsavedChange[]} */
    changes() {
        return /** @type {HTMLElement[]} */ ([...this.scope.querySelectorAll('[data-kp-changed]')])
            .filter((r) => !this.el.contains(r))
            .map((row) => {
                const controls = this.controlsOf(row);
                const c = controls.find((x) => this.baseline.has(x) && readValue(x) !== this.baseline.get(x)) ?? controls[0];
                return {
                    key: this.labelOf(row),
                    was: row.dataset.kpWas ?? (c ? this.show(c, this.baseline.get(c) ?? '') : ''),
                    now: row.dataset.kpNow ?? (c ? this.show(c, readValue(c)) : ''),
                    row,
                };
            });
    }

    /** Stop counting a row: its marks go. @param {HTMLElement} row */
    clearRow(row) {
        row.removeAttribute('data-kp-changed');
        row.removeAttribute('data-kp-was');
        row.removeAttribute('data-kp-now');
    }
}
