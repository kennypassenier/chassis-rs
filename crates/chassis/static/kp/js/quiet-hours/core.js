// One control's value and what shows it: the value, the severities as ticks, the paint of the switch, the line in words and the problem, and the event.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { setTime } from '../timefield.js';
import { setWeekdays } from '../weekdays.js';
import { buildQuiet, make } from './parts.js';
import { quietSummary, readQuiet, severityWord } from './value.js';
import { DEFAULT, QUIET_EVENT, QUIET_SEVERITIES } from './values.js';

/** @typedef {import('./values.js').QuietValue} QuietValue */

/** Gives each control without an id one of its own. */
let serial = 0;

export class QuietCore extends Controller {
    /**
     * @param {HTMLElement} host
     * @param {Record<string, unknown>} [options]
     */
    constructor(host, options) {
        super(host, options);
        this.s = getStrings();
        this.id = host.id || `kp-quiet-${(serial += 1)}`;
        this.parts = buildQuiet(host.ownerDocument, this.id, this.s);
        /** @type {QuietValue} */
        this.value = readQuiet(host.getAttribute('data-kp-value') ?? DEFAULT);
    }

    /** The severities the page names (`key` or `key=Words`), or the four. */
    severities() {
        return (this.host.getAttribute('data-kp-quiet-severities') || QUIET_SEVERITIES.join(','))
            .split(/\s*,\s*/)
            .filter(Boolean)
            .map((part) => {
                const [key, ...words] = part.split('=');
                return { key: key.trim(), label: words.join('=').trim() || severityWord(key.trim()) };
            });
    }

    checks() {
        return /** @type {HTMLInputElement[]} */ ([...this.parts.through.querySelectorAll('input[type="checkbox"]')]);
    }

    drawSeverities() {
        const doc = this.host.ownerDocument;
        this.parts.through.replaceChildren(
            ...this.severities().map(({ key, label }) => {
                const row = make(doc, 'kp-field__option kp-quiet__severity', 'label');
                const box = /** @type {HTMLInputElement} */ (make(doc, 'kp-field__check', 'input'));
                box.type = 'checkbox';
                box.value = key;
                box.checked = this.value.through.includes(key);
                const words = make(doc, 'kp-field__option-title', 'span');
                words.textContent = label;
                row.append(box, words);
                return row;
            }),
        );
    }

    valid() {
        return !this.value.on || this.value.from !== this.value.to;
    }

    paint() {
        const root = this.host;
        const { s, value } = this;
        const { onWords, onInput, body, problem, summary, reason, wait } = this.parts;
        onWords.textContent = root.getAttribute('data-kp-quiet-label') ?? s.quietLabel;
        root.setAttribute('aria-label', onWords.textContent);
        onInput.checked = value.on;
        body.toggleAttribute('inert', !value.on);
        root.toggleAttribute('data-kp-quiet-on', value.on);
        for (const box of this.checks()) box.checked = value.through.includes(box.value);
        problem.hidden = this.valid();
        problem.textContent = this.valid() ? '' : s.quietSame;
        summary.textContent = this.valid() ? quietSummary(value, { severities: this.severities() }) : '';
        const why = root.getAttribute('data-kp-disabled');
        const state = root.getAttribute('data-kp-state');
        root.toggleAttribute('inert', why !== null && why !== undefined && root.hasAttribute('data-kp-disabled'));
        reason.hidden = !root.hasAttribute('data-kp-disabled') || !why;
        reason.textContent = why ?? '';
        wait.hidden = state !== 'loading';
        root.toggleAttribute('aria-busy', state === 'loading');
    }

    /** A person changed something: the value follows, the control repaints and the page hears. @param {Partial<QuietValue>} patch */
    change(patch) {
        this.value = { ...this.value, ...patch };
        this.paint();
        this.emit();
    }

    emit() {
        this.host.dispatchEvent(new CustomEvent(QUIET_EVENT, { bubbles: true, detail: { value: { ...this.value }, summary: this.parts.summary.textContent, valid: this.valid() } }));
    }

    /** The page set the value (or the first one): the fields follow, the control repaints. @param {QuietValue} next @param {boolean} fire */
    write(next, fire) {
        const { fromBox, toBox, dayBox } = this.parts;
        this.value = next;
        setTime(fromBox, next.from);
        setTime(toBox, next.to);
        setWeekdays(dayBox, next.days);
        this.paint();
        if (fire) this.emit();
    }
}
