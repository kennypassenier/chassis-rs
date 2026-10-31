// One question card's state and what it paints from it: the state and its look, the time left, the outcome line, the countdown animation, the clock.

import { Controller } from '../controller.js';
import { humanDuration } from '../freshness.js';
import { getStrings } from '../strings.js';
import { MS_PER_SECOND } from './values.js';
import { paintTitle } from './title.js';

/** @typedef {'waiting' | 'urgent' | 'sending' | 'answered' | 'refused' | 'expired'} QuestionState */
/** @typedef {import('./spec.js').ResolvedQuestion} ResolvedQuestion */
/** @typedef {import('./build.js').CardParts} CardParts */

/**
 * What the run is given.
 * @typedef {object} QuestionInit
 * @property {HTMLElement} container
 * @property {import('../question-card.js').QuestionSpec} spec
 * @property {ResolvedQuestion} q
 * @property {CardParts} parts
 * @property {() => number} now
 * @property {boolean} frozen
 */

export class QuestionCore extends Controller {
    /**
     * @param {HTMLElement} host the card
     * @param {QuestionInit} init
     */
    constructor(host, init) {
        super(host, init);
        this.container = init.container;
        this.spec = init.spec;
        this.q = init.q;
        this.parts = init.parts;
        this.now = init.now;
        this.frozen = init.frozen;
        this.view = /** @type {Window} */ (host.ownerDocument.defaultView);
        /** @type {QuestionState} */
        this.state = 'waiting';
        this.announcedUrgent = false;
        /** The countdown's interval, 0 for none. */
        this.timer = 0;
        /** The answer that is being sent. */
        this.sentValue = '';
    }

    /** The dictionary as it stands now. */
    s() {
        return getStrings();
    }

    /** @param {string} value */
    setSent(value) {
        this.sentValue = value;
    }

    /** The card's look for its state. */
    flavour() {
        const card = this.host;
        const state = this.state;
        card.classList.toggle('kp-alert--warning', state === 'waiting' || state === 'sending');
        card.classList.toggle('kp-alert--destructive', state === 'urgent' || state === 'refused');
        card.classList.toggle('kp-alert--success', state === 'answered');
        card.classList.toggle('kp-alert--info', false);
    }

    /** @param {QuestionState} next */
    setState(next) {
        this.state = next;
        const card = this.host;
        card.setAttribute('data-kp-state', next);
        card.toggleAttribute('aria-busy', next === 'sending');
        this.flavour();
        const live = next === 'waiting' || next === 'urgent' || next === 'refused';
        for (const b of this.parts.buttons.values()) {
            b.disabled = !live;
            b.toggleAttribute('aria-busy', next === 'sending' && b.getAttribute('data-kp-value') === this.sentValue);
        }
        this.parts.dismiss.hidden = !(next === 'answered' || next === 'expired');
        paintTitle();
    }

    /** Show what the card says once it has an outcome. @param {string} text */
    say(text) {
        this.parts.outcome.textContent = text;
        this.parts.outcome.hidden = !text;
    }

    /** Say it to a screen reader as well. @param {string} text */
    speak(text) {
        this.parts.voice.textContent = text;
    }

    /** The time left in words; a card in its urgent last seconds is stronger, announced once; at zero it expires. */
    paintTime() {
        const s = this.s();
        const { left } = this.parts;
        const remaining = this.q.deadline - this.now();
        const text = humanDuration(Math.max(0, Math.ceil(remaining / MS_PER_SECOND)), s);
        if (this.state === 'answered' || this.state === 'expired') {
            left.textContent = '';
            return;
        }
        left.textContent = remaining > 0 ? s.questionLeft(text) : s.questionTimeUp;
        if ((this.state === 'waiting' || this.state === 'urgent') && remaining > 0) {
            if (remaining <= this.q.urgentAt && this.state === 'waiting') {
                this.setState('urgent');
                if (!this.announcedUrgent) this.announceUrgent(text);
            }
        }
        if (remaining <= 0 && (this.state === 'waiting' || this.state === 'urgent')) this.expire();
    }

    /** Announce the urgent state once. @param {string} text */
    announceUrgent(text) {
        this.announcedUrgent = true;
        this.speak(this.s().questionUrgent(text));
    }

    /** The shrinking measure is one CSS animation over the whole wait, started part-way in. */
    run() {
        const { deadline, asked } = this.q;
        const total = Math.max(1, deadline - asked);
        const elapsed = Math.min(total, Math.max(0, this.now() - asked));
        this.host.style.setProperty('--kp-question-total', `${total}ms`);
        this.host.style.setProperty('--kp-question-elapsed', `-${elapsed}ms`);
        this.host.toggleAttribute('data-kp-frozen', this.frozen);
    }

    /** Start the clock that repaints the time every second. */
    startClock() {
        this.timer = this.view.setInterval(() => this.paintTime(), MS_PER_SECOND);
    }

    /** Stop the clock. */
    stopClock() {
        this.view.clearInterval(this.timer);
    }

    /** The time ran out. The run overrides it. */
    expire() {}
}
