// One sentence form: its lines, the names of its controls, the phrases that come and go, the computed fields, the
// placing of wide fields, the spoken summary and Enter in the last field.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { CONTROLS, LINES, SENTENCE_EVENT, isButton, nameOf, reach, sentenceSummary, setSentenceComputed, valueOfControl, wordsBefore } from './fields.js';

/** @typedef {import('../sentence.js').ComputedFn} ComputedFn */
/** @typedef {import('../sentence.js').SentenceHandle} SentenceHandle */

/** Numbers the sentences of a page, for the ids of their lines. */
let seq = 0;

/** How long the summary waits after the last change before it is said and fired [ms]. */
const SAY_AFTER_MS = 500;
/** Under this width [px] a `data-kp-narrow="stack"` sentence puts every field on a line of its own. */
const STACK_BELOW_PX = 480;
/** The share of the line a field may take before it gets its own line: the default, and its bounds. */
const OWN_LINE_RATIO = 0.7;
const OWN_LINE_RATIO_MIN = 0.2;
/** The controls that get a name from the words before them. */
const NAMEABLE = 'input:not([type="hidden"]), select, textarea, [role="combobox"]';
/** The controls Enter walks to find the last field. */
const ENTERABLE = 'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])';
/** The events after which the sentence is read again. */
const CHANGE_EVENTS = ['input', 'change', 'kp-weekdays-change', 'kp-combobox-change'];

export class Sentence extends Controller {
    /** @param {HTMLElement} el @param {{ computed?: Record<string, ComputedFn> }} [options] */
    constructor(el, options = {}) {
        super(el, options);
        this.doc = el.ownerDocument;
        this.id = `kp-sentence-${++seq}`;
        const narrow = el.dataset.kpNarrow;
        /** What a narrow line does: `wrap` (a wide field takes its own line), `stack` or `flow`. */
        this.narrow = narrow === 'stack' || narrow === 'flow' ? narrow : 'wrap';
        this.ratio = Math.min(1, Math.max(OWN_LINE_RATIO_MIN, Number(el.dataset.kpOwnLineRatio) || OWN_LINE_RATIO));
        /** The functions behind the computed fields, by `data-kp-sentence-computed`. @type {Map<string, ComputedFn>} */
        this.fns = new Map(Object.entries(options.computed ?? {}));
        /** Whether a throwing computed function was already reported: once per sentence, not on every keystroke. */
        this.warnedComputed = false;
        this.timer = 0;
        /** The polite live region that reads the summary. */
        this.live = this.doc.createElement('p');
        /** @type {HTMLElement | null} */
        this.reasonLine = null;
        /** The line under the sentence. @type {HTMLElement} */
        this.line = /** @type {HTMLElement} */ (/** @type {unknown} */ (null));
        /** What sentence(el) hands the page. @type {SentenceHandle} */
        this.handle = {
            element: el,
            line: this.line,
            summary: () => sentenceSummary(el),
            refresh: () => this.refresh(),
            compute: (name, fn) => this.setCompute(name, fn),
        };
    }

    connect() {
        const el = this.host;
        el.classList.add('kp-sentence');
        this.drawSelects();
        this.mountLines();
        this.nameControls();
        // Registered first, so it runs last: the lines this module added go once the listeners are gone.
        this.own(() => {
            clearTimeout(this.timer);
            this.live.remove();
            this.reasonLine?.remove();
            LINES.delete(this.host);
        });
        for (const type of CHANGE_EVENTS) this.listen(el, type, () => this.onChange());
        this.listen(el, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        if (typeof ResizeObserver !== 'undefined') this.observe(new ResizeObserver(() => this.place())).observe(el);
        void this.doc.fonts?.ready.then(() => this.place());
        // A computed field with no text yet shows its dash, and one with authored text keeps it until its function speaks.
        for (const output of el.querySelectorAll('[data-kp-sentence-computed]'))
            setSentenceComputed(el, output.getAttribute('data-kp-sentence-computed') ?? '', output.textContent);
        this.refresh();
        this.live.textContent = sentenceSummary(el);
    }

    /**
     * A select in a sentence opens the package's drawn list (the combobox's own plate, js/combobox.js), not the browser's,
     * which Firefox paints from the transparent field: almost black in formal [Kenny, 2026-10-17 22:09].
     * `data-kp-select="native"` on a select keeps the browser's.
     */
    drawSelects() {
        const el = this.host;
        const drawn = [...el.querySelectorAll('.kp-sentence__field > select:not([multiple]):not([data-kp-select])')];
        for (const select of drawn) select.setAttribute('data-kp-select', '');
        if (drawn.length) void import('../combobox.js').then((m) => m.attachSelects(el));
    }

    /** The line under the sentence, the reason a disabled one is off, and the summary a screen reader hears. */
    mountLines() {
        const el = this.host;
        let line = /** @type {HTMLElement | null} */ (el.querySelector(':scope > .kp-sentence__why'));
        if (!line) {
            line = this.doc.createElement('p');
            line.className = 'kp-field__error kp-sentence__why';
            el.append(line);
        }
        line.id ||= `${this.id}-why`;
        line.hidden = !line.textContent?.trim();
        line.setAttribute('role', 'alert');
        this.line = line;
        this.handle.line = line;
        LINES.set(el, line);
        const reason = el.dataset.kpDisabledReason;
        if (reason && el.hasAttribute('disabled')) {
            this.reasonLine = this.doc.createElement('p');
            this.reasonLine.className = 'kp-sentence__reason';
            this.reasonLine.textContent = reason;
            el.append(this.reasonLine);
        }
        this.live.className = 'kp-sr-only kp-sentence__live';
        this.live.setAttribute('role', 'status');
        this.live.setAttribute('aria-live', 'polite');
        el.append(this.live);
    }

    /** Every control has a name of its own: the words before it when the page gave none. */
    nameControls() {
        for (const field of this.host.querySelectorAll('.kp-sentence__field')) {
            for (const control of field.querySelectorAll(NAMEABLE)) {
                if (nameOf(control) || (control.id && this.doc.querySelector(`label[for="${CSS.escape(control.id)}"]`))) continue;
                control.setAttribute('aria-label', wordsBefore(field).join(' ') || getStrings().sentenceField);
            }
        }
    }

    /** Show the phrases whose condition holds, hide the others and take their controls out of reach. */
    phrases() {
        for (const phrase of this.host.querySelectorAll('[data-kp-show-when]')) {
            if (!(phrase instanceof HTMLElement)) continue;
            const [name, wanted = ''] = (phrase.dataset.kpShowWhen ?? '').split('=');
            const held = valueOfControl(this.host, name.trim());
            const show = held !== null && wanted.split(',').map((v) => v.trim()).includes(held);
            if (phrase.hidden === !show) continue;
            phrase.hidden = !show;
            phrase.toggleAttribute('inert', !show);
            for (const c of phrase.querySelectorAll(CONTROLS)) if (c instanceof HTMLElement) reach(c, show);
        }
    }

    /** A field that is more of the line than it may be takes a line of its own. */
    place() {
        const text = this.host.querySelector('.kp-sentence__text') ?? this.host;
        const room = (text instanceof HTMLElement ? text : this.host).clientWidth;
        for (const field of this.host.querySelectorAll('.kp-sentence__field')) {
            if (!(field instanceof HTMLElement) || field.closest('[hidden]')) continue;
            let own = false;
            if (field.hasAttribute('data-kp-block')) own = true;
            else if (this.narrow === 'stack') own = room < STACK_BELOW_PX;
            else if (this.narrow === 'wrap' && room > 0) {
                field.removeAttribute('data-kp-own-line');
                const was = field.style.inlineSize;
                field.style.inlineSize = 'max-content';
                own = field.getBoundingClientRect().width > room * this.ratio;
                field.style.inlineSize = was;
            }
            field.toggleAttribute('data-kp-own-line', own);
        }
    }

    /** Work every computed field out from the controls as they stand. */
    compute() {
        if (this.fns.size === 0) return;
        /** @type {Record<string, string | null>} */
        const values = {};
        for (const control of this.host.querySelectorAll('[name]')) {
            const name = control.getAttribute('name') ?? '';
            if (name && !(name in values)) values[name] = valueOfControl(this.host, name);
        }
        for (const [name, fn] of this.fns) setSentenceComputed(this.host, name, this.run(name, fn, values));
    }

    /** One computed function; one that throws is reported once and its field shows the dash. @param {string} name @param {ComputedFn} fn @param {Record<string, string | null>} values */
    run(name, fn, values) {
        try {
            return fn(values, this.host);
        } catch (error) {
            if (!this.warnedComputed) {
                this.warnedComputed = true;
                console.warn(`kp-sentence: the computed field "${name}" threw`, error);
            }
            return null;
        }
    }

    refresh() {
        this.phrases();
        this.compute();
        this.place();
    }

    /** @param {string} name @param {ComputedFn | null} fn */
    setCompute(name, fn) {
        if (fn) this.fns.set(name, fn);
        else this.fns.delete(name);
        this.refresh();
        this.live.textContent = sentenceSummary(this.host);
    }

    say() {
        const summary = sentenceSummary(this.host);
        this.live.textContent = summary;
        this.host.dispatchEvent(new CustomEvent(SENTENCE_EVENT, { bubbles: true, detail: { summary } }));
    }

    onChange() {
        this.refresh();
        clearTimeout(this.timer);
        this.timer = window.setTimeout(() => this.say(), SAY_AFTER_MS);
    }

    /** Enter in the last field submits the form the sentence is (or is in). @param {KeyboardEvent} event */
    onKey(event) {
        if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing) return;
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || isButton(target) || target.closest('[aria-expanded="true"]')) return;
        const el = this.host;
        const form = el instanceof HTMLFormElement ? el : el.closest('form');
        if (!form) return;
        const controls = [...el.querySelectorAll(ENTERABLE)].filter((c) => !c.closest('[hidden]') && !isButton(c));
        if (controls.at(-1) !== target) return;
        event.preventDefault();
        form.requestSubmit();
    }
}
