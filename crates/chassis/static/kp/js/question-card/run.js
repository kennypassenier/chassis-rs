// One running question: its place among the others, its answer and the app's reply, its time running out, and its going.

import { leave } from '../motion.js';
import { QUESTION_ANSWER_EVENT, QUESTION_DISMISS_EVENT, QUESTION_EXPIRE_EVENT } from './values.js';
import { paintTitle, trackOpen, untrackOpen } from './title.js';
import { QuestionCore } from './core.js';

export class QuestionRun extends QuestionCore {
    /**
     * @param {HTMLElement} host the card
     * @param {import('./core.js').QuestionInit} init
     */
    constructor(host, init) {
        super(host, init);
        /** What the page gets back, the same object every time. @type {import('../question-card.js').QuestionHandle & { stop: () => void }} */
        this.handle = this.makeHandle();
    }

    connect() {
        const card = this.host;
        this.listen(card, 'click', (event) => this.onClick(event));
        this.listen(card, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.place();
        trackOpen(card);
        this.setState('waiting');
        this.run();
        this.paintTime();
        if (!this.frozen) this.startClock();
        this.own(() => this.stop());
    }

    /** @returns {import('../question-card.js').QuestionHandle & { stop: () => void }} */
    makeHandle() {
        return {
            element: this.host,
            id: this.spec.id,
            state: () => this.state,
            answer: (value) => this.choose(value),
            dismiss: () => void this.remove(),
            stop: () => this.stop(),
        };
    }

    /** Oldest first: a card goes before the first one asked later. */
    place() {
        const asked = this.q.asked;
        const later = /** @type {HTMLElement[]} */ ([...this.container.querySelectorAll(':scope > .kp-question')]).find(
            (c) => Number(c.getAttribute('data-kp-asked')) > asked,
        );
        this.host.setAttribute('data-kp-asked', String(asked));
        if (later) later.before(this.host);
        else this.container.append(this.host);
    }

    /** The clock stops and the card stops counting for the tab title. */
    stop() {
        this.stopClock();
        untrackOpen(this.host);
    }

    /** @param {Event} event */
    onClick(event) {
        const target = event.target instanceof Element ? event.target : null;
        const button = target?.closest('.kp-question__button');
        if (button instanceof HTMLButtonElement && !button.disabled) this.choose(button.getAttribute('data-kp-value') ?? '');
        else if (target?.closest('.kp-question__dismiss')) {
            this.host.dispatchEvent(new CustomEvent(QUESTION_DISMISS_EVENT, { bubbles: true, detail: { id: this.spec.id } }));
            void this.remove();
        }
    }

    /** The keys 1 to n answer. @param {KeyboardEvent} event */
    onKey(event) {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const n = Number(event.key);
        const answers = this.q.answers;
        if (Number.isInteger(n) && n >= 1 && n <= answers.length && !(event.target instanceof HTMLInputElement)) {
            const a = answers[n - 1];
            if (a) {
                event.preventDefault();
                this.choose(a.value);
            }
        }
    }

    /** The time ran out: the default answer's outcome, the buttons off. */
    expire() {
        if (this.state === 'expired' || this.state === 'answered') return;
        this.stopClock();
        const a = this.q.fallback;
        const s = this.s();
        this.setSent('');
        this.setState('expired');
        this.say(a ? (a.outcome ? `${s.questionNobody} ${a.outcome}` : s.questionNobodyDefault(a.label)) : s.questionNobody);
        this.host.dispatchEvent(
            new CustomEvent(QUESTION_EXPIRE_EVENT, { bubbles: true, detail: { id: this.spec.id, defaultAnswer: a?.value ?? null } }),
        );
        if (this.q.expiredMode === 'remove') void this.remove();
    }

    /** The card goes: the clock stops, the title is repainted, the controller is undone and the card leaves. */
    async remove() {
        this.stop();
        paintTitle();
        this.destroy();
        await leave(this.host);
    }

    /** An answer was chosen: sending, and the app is asked through the event. @param {string} value */
    choose(value) {
        if (this.state !== 'waiting' && this.state !== 'urgent' && this.state !== 'refused') return;
        const picked = this.q.answers.find((a) => a.value === value);
        if (!picked) return;
        this.setSent(value);
        this.say('');
        this.setState('sending');
        let responded = false;
        const respond = (/** @type {boolean} */ ok, /** @type {string} */ why = '') => {
            if (responded || this.state !== 'sending') return;
            responded = true;
            this.reply(picked, ok, why);
        };
        this.host.dispatchEvent(new CustomEvent(QUESTION_ANSWER_EVENT, { bubbles: true, detail: { id: this.spec.id, value, respond } }));
    }

    /** The app's reply: answered, or refused until the person answers again. @param {import('./spec.js').ResolvedQuestion['answers'][number]} picked @param {boolean} ok @param {string} why */
    reply(picked, ok, why) {
        const s = this.s();
        if (ok) {
            this.stopClock();
            this.setState('answered');
            this.say(picked.outcome ?? s.questionAnswered(picked.label));
            this.speak(this.parts.outcome.textContent ?? '');
            this.paintTime();
        } else {
            // Refused is the card's own state until the person answers again.
            this.setState('refused');
            this.say(s.questionRefused(why));
            this.speak(this.parts.outcome.textContent ?? '');
            paintTitle();
        }
    }
}
