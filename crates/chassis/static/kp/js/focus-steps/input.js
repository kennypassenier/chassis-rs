// The keys, the swipe and Read aloud of one focus-steps view, and the two moves they share: next and back.
import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { SWIPE_DISTANCE } from './constants.js';
import { part, stateOf } from './dom.js';
import { answerReady, answering, lastIndex } from './resume.js';
import { goNext, takeAnswer } from './flow.js';
import { activeTrack, tracksOn } from './tracks.js';
import { trackPrev } from './track-nav.js';
import { goToStep, typing } from './api.js';

/** A swipe must run this many times further across than up or down to count as one. */
const SWIPE_SLOPE = 1.5;

/** The base of a focus-steps controller: its moves and the keyboard, touch and speech input on it. */
export class FocusStepsInput extends Controller {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options = {}) {
        super(host, options);
        /** The touch that may become a swipe. @type {{ x: number, y: number, id: number } | null} */
        this.touch = null;
    }

    /** The view's state, read fresh: build() lays it on connect. */
    get state() {
        return stateOf(this.host);
    }

    /** On to the next step; a question is answered first: a multi pick or a written line is taken now. */
    next() {
        const root = this.host;
        const state = this.state;
        const answer = state.steps[state.index]?.answer;
        if (answering(root) && answer && !state.answers[answer.id]) {
            if (!answerReady(root, answer)) return;
            const held = state.draft[answer.id];
            if (!takeAnswer(root, typeof held === 'string' ? held.trim() : (held ?? ''), 'tap')) return;
        }
        goNext(root);
    }

    /** Back one step, within the active track when there are tracks. */
    prev() {
        if (tracksOn(this.host)) trackPrev(this.host);
        else goToStep(this.host, this.state.index - 1);
    }

    /** @param {KeyboardEvent} event */
    onKey(event) {
        if (event.altKey || event.ctrlKey || event.metaKey || typing(event.target)) return;
        const onButton = event.target instanceof Element && event.target.closest('button, a, [role="button"]');
        if (onButton instanceof HTMLElement && (this.answerKey(event, onButton) || this.laneKey(event, onButton))) return;
        const act = this.flowAct(event.key, Boolean(onButton));
        if (!act) return;
        event.preventDefault();
        act();
    }

    /**
     * ArrowUp and ArrowDown walk the answers of a question.
     * @param {KeyboardEvent} event @param {HTMLElement} onButton
     * @returns {boolean} whether the key was the answers' own
     */
    answerKey(event, onButton) {
        if ((event.key !== 'ArrowUp' && event.key !== 'ArrowDown') || !onButton.closest('.kp-focus-steps__answer')) return false;
        const all = /** @type {HTMLElement[]} */ ([...this.host.querySelectorAll('.kp-focus-steps__answer button')]);
        const at = all.indexOf(onButton);
        const to = all[Math.max(0, Math.min(all.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))];
        if (at >= 0 && to) {
            event.preventDefault();
            to.focus();
        }
        return true;
    }

    /**
     * The tabs pattern on the lanes: ArrowUp and ArrowDown (Home, End) move the focus between them.
     * @param {KeyboardEvent} event @param {HTMLElement} onButton
     * @returns {boolean} whether the key was the lanes' own
     */
    laneKey(event, onButton) {
        if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || !onButton.classList.contains('kp-focus-steps__lane')) return false;
        const all = /** @type {HTMLElement[]} */ ([...this.host.querySelectorAll('.kp-focus-steps__lane')]);
        const at = all.indexOf(onButton);
        const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
        const to = event.key === 'Home' ? all[0] : event.key === 'End' ? all[all.length - 1] : all[(at + step + all.length) % all.length];
        if (at >= 0 && to) {
            event.preventDefault();
            to.focus();
        }
        return true;
    }

    /**
     * What a key does to the flow: next, back, first or last step, or nothing.
     * @param {string} key @param {boolean} onButton whether the focus is on a control, where Space is the control's
     * @returns {(() => void) | null}
     */
    flowAct(key, onButton) {
        const root = this.host;
        const state = this.state;
        const rtl = getComputedStyle(root).direction === 'rtl';
        if (key === 'PageDown' || key === (rtl ? 'ArrowLeft' : 'ArrowRight')) return () => this.next();
        if (key === 'PageUp' || key === (rtl ? 'ArrowRight' : 'ArrowLeft')) return () => this.prev();
        if (key === ' ' && !onButton) return () => this.next();
        if (key === 'Home') return () => goToStep(root, tracksOn(root) ? (activeTrack(state)?.order[0] ?? 0) : 0);
        if (key === 'End') return () => goToStep(root, tracksOn(root) ? (activeTrack(state)?.order.at(-1) ?? 0) : lastIndex(root));
        return null;
    }

    /** A touch on the body may start a swipe. @param {PointerEvent} event */
    onDown(event) {
        if (event.pointerType === 'mouse' || !(event.target instanceof Element) || !part(this.host, 'body').contains(event.target)) return;
        this.touch = { x: event.clientX, y: event.clientY, id: event.pointerId };
    }

    /** A swipe far enough across goes on or back, mirrored right to left. @param {PointerEvent} event */
    onUp(event) {
        const touch = this.touch;
        if (!touch || touch.id !== event.pointerId) return;
        const dx = event.clientX - touch.x;
        const dy = event.clientY - touch.y;
        this.touch = null;
        if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy) * SWIPE_SLOPE) return;
        const rtl = getComputedStyle(this.host).direction === 'rtl';
        if (dx < 0 !== rtl) this.next();
        else this.prev();
    }

    /** Read the step aloud, or stop reading. @param {HTMLButtonElement} button */
    speak(button) {
        const strings = getStrings();
        if (speechSynthesis.speaking) {
            speechSynthesis.cancel();
            return;
        }
        const step = this.state.steps[this.state.index];
        if (!step) return;
        const utterance = new SpeechSynthesisUtterance([step.text, step.note ?? ''].filter(Boolean).join('. '));
        utterance.lang = this.host.closest('[lang]')?.getAttribute('lang') ?? '';
        const word = /** @type {HTMLElement} */ (button.querySelector('.kp-focus-steps__speak-text'));
        word.textContent = strings.focusStopReading;
        button.setAttribute('aria-pressed', 'true');
        utterance.onend = utterance.onerror = () => {
            word.textContent = strings.focusReadAloud;
            button.setAttribute('aria-pressed', 'false');
        };
        speechSynthesis.speak(utterance);
    }
}
