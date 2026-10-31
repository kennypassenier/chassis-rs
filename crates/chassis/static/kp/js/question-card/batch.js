// The batch bar of a question list [homelab gap 22]: one press answers every open question that has a default answer with that
// default, the answer the card would take at zero anyway. Opt-in on the container:
//
//   data-kp-questions-batch       absent or "off" (default: no bar) | "on" (the bar answers at once) | "confirm" (the bar asks
//                                 "Answer 3 questions with their default now?" with Answer all and Cancel first)
//   data-kp-questions-batch-min   how many such questions must wait before the bar shows (default 2: one card already has its own
//                                 buttons)
//
// Each card is answered through its own run, so every card fires its own `kp-question-answer` and the app replies per card. Both
// attributes are read again when they change.

import { Controller, controllerOf } from '../controller.js';
import { getStrings } from '../strings.js';
import { QuestionRun } from './run.js';

/** The fewest open questions with a default before the bar shows. */
export const BATCH_MIN = 2;
/** The states in which a card still takes an answer. */
const OPEN = new Set(['waiting', 'urgent', 'refused']);

/** @param {Document} doc @param {string} tag @param {string} className @param {string} [text] */
const make = (doc, tag, className, text = '') => {
    const node = doc.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
};

/** The bar of one `[data-kp-questions]` container. */
export class QuestionBatch extends Controller {
    /** @param {HTMLElement} host the container */
    constructor(host) {
        super(host);
        /** The bar, made the first time it is needed. @type {HTMLElement | null} */
        this.bar = null;
        /** Whether the bar is asking to confirm. */
        this.asking = false;
    }

    connect() {
        const box = this.host;
        this.observe(new MutationObserver(() => this.paint())).observe(box, {
            childList: true,
            attributes: true,
            attributeFilter: ['data-kp-questions-batch', 'data-kp-questions-batch-min'],
        });
        this.observe(new MutationObserver(() => this.paint())).observe(box, { subtree: true, attributes: true, attributeFilter: ['data-kp-state'] });
        this.listen(box, 'click', (event) => this.onClick(event));
        this.own(() => this.bar?.remove());
        this.paint();
    }

    /** `off`, `on` or `confirm`, from the attribute. */
    mode() {
        const value = this.host.getAttribute('data-kp-questions-batch');
        if (value === null || value === 'off') return 'off';
        return value === 'confirm' ? 'confirm' : 'on';
    }

    /** The least count that shows the bar. */
    least() {
        const given = Number.parseInt(this.host.getAttribute('data-kp-questions-batch-min') ?? '', 10);
        return Number.isFinite(given) && given >= 1 ? given : BATCH_MIN;
    }

    /**
     * The runs of the open cards that have a default answer, oldest first.
     * @returns {QuestionRun[]}
     */
    runs() {
        /** @type {QuestionRun[]} */
        const open = [];
        for (const card of this.host.querySelectorAll(':scope > .kp-question')) {
            const run = controllerOf(card, QuestionRun);
            if (run && OPEN.has(run.state) && run.q.fallback) open.push(run);
        }
        return open;
    }

    /** Draw the bar for the questions open now, or take it away. */
    paint() {
        const n = this.runs().length;
        const show = this.mode() !== 'off' && n >= this.least();
        if (!show) {
            this.asking = false;
            if (this.bar && !this.bar.hidden) this.bar.hidden = true;
            return;
        }
        if (this.mode() !== 'confirm') this.asking = false;
        const bar = this.bar ?? this.build();
        if (bar.hidden) bar.hidden = false;
        if (bar.parentElement !== this.host || bar !== this.host.firstElementChild) this.host.prepend(bar);
        this.words(bar, n);
    }

    /** @returns {HTMLElement} */
    build() {
        const doc = this.host.ownerDocument;
        const bar = make(doc, 'div', 'kp-question__batch');
        bar.setAttribute('role', 'group');
        const note = make(doc, 'p', 'kp-question__batch-note');
        note.id = `${this.host.id || 'kp-questions'}-batch-note`;
        bar.setAttribute('aria-labelledby', note.id);
        const actions = make(doc, 'div', 'kp-question__batch-actions');
        const all = /** @type {HTMLButtonElement} */ (make(doc, 'button', 'kp-button kp-button--sm kp-question__batch-all'));
        all.type = 'button';
        const cancel = /** @type {HTMLButtonElement} */ (make(doc, 'button', 'kp-button kp-button--sm kp-button--ghost kp-question__batch-cancel'));
        cancel.type = 'button';
        actions.append(all, cancel);
        bar.append(note, actions);
        this.bar = bar;
        return bar;
    }

    /** The words for `n` questions, asking or not; written only when they change. @param {HTMLElement} bar @param {number} n */
    words(bar, n) {
        const s = getStrings();
        const set = (/** @type {Element | null} */ node, /** @type {string} */ text) => {
            if (node && node.textContent !== text) node.textContent = text;
        };
        set(bar.querySelector('.kp-question__batch-note'), this.asking ? s.questionBatchConfirm(n) : s.questionBatchNote(n));
        set(bar.querySelector('.kp-question__batch-all'), this.asking ? s.questionBatchYes : s.questionBatch(n));
        set(bar.querySelector('.kp-question__batch-cancel'), s.questionBatchCancel);
        const cancel = /** @type {HTMLElement | null} */ (bar.querySelector('.kp-question__batch-cancel'));
        if (cancel && cancel.hidden === this.asking) cancel.hidden = !this.asking;
        bar.toggleAttribute('data-kp-questions-asking', this.asking);
    }

    /** @param {Event} event */
    onClick(event) {
        const target = event.target instanceof Element ? event.target : null;
        if (!target || !this.bar?.contains(target)) return;
        if (target.closest('.kp-question__batch-cancel')) {
            this.asking = false;
            this.paint();
            /** @type {HTMLElement | null} */ (this.bar.querySelector('.kp-question__batch-all'))?.focus();
        } else if (target.closest('.kp-question__batch-all')) this.press();
    }

    /** Answer them all, or ask first. */
    press() {
        if (this.mode() === 'confirm' && !this.asking) {
            this.asking = true;
            this.paint();
            return;
        }
        this.asking = false;
        for (const run of this.runs()) if (run.q.fallback) run.choose(run.q.fallback.value);
        this.paint();
    }
}
