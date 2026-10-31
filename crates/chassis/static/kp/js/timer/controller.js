// One timer list: its buttons, the clock that keeps it counting, and the page's starters.
import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { parseDuration } from '../countdown.js';
import { TIMER_DONE_EVENT, TIMER_START } from './constants.js';
import { listOf, part, say } from './model.js';
import { addTimerTime, find, pauseTimer, resumeTimer, startTimer, stopTimer, targetOf } from './run.js';
import { stopRing } from './sound.js';
import { HANDLED, TICKERS } from './state.js';
import { sync, tick } from './sync.js';

/** One timer list: draws it, takes the presses of its cards and counts again when the page comes back. */
export class TimerList extends Controller {
    connect() {
        const list = this.host;
        // Registered first, so it runs last: the rings stop and the clock goes after the listeners.
        this.own(() => this.release());
        part(list, 'list');
        sync(list);
        this.listen(list, 'click', (event) => this.onClick(/** @type {MouseEvent} */ (event)));
        this.listen(document, 'visibilitychange', () => this.onVisible());
    }

    /** The clock stops and every ring on the list falls silent. */
    release() {
        const ticker = TICKERS.get(this.host);
        if (ticker) clearInterval(ticker);
        TICKERS.delete(this.host);
        for (const timer of listOf(this.host).values()) stopRing(timer);
    }

    /** Back on screen: show the time that really is left. */
    onVisible() {
        if (document.visibilityState === 'visible') tick(this.host);
    }

    /** A press on a card's button: pause or resume, stop, add a minute, or remove. @param {MouseEvent} event */
    onClick(event) {
        const list = this.host;
        const button = event.target instanceof Element ? event.target.closest('button') : null;
        const card = button?.closest('.kp-timer');
        if (!button || !card || !list.contains(card)) return;
        const id = card.getAttribute('data-kp-timer-id') ?? '';
        const timer = find(list, id);
        if (!timer) return;
        if (button.classList.contains('kp-timer__toggle')) {
            if (timer.state === 'running') pauseTimer(list, id);
            else if (timer.state === 'paused') resumeTimer(list, id);
            else {
                stopRing(timer);
                stopTimer(list, id);
            }
        } else if (button.classList.contains('kp-timer__more')) addTimerTime(list, id, 60);
        else if (button.classList.contains('kp-timer__remove')) {
            // The focus goes to the next card's first button, else the previous one's, so it is never lost.
            const next = card.nextElementSibling ?? card.previousElementSibling;
            stopTimer(list, id);
            /** @type {HTMLElement | null} */ (next?.querySelector('.kp-timer__toggle') ?? null)?.focus();
        }
    }
}

/** The starters anywhere under one root: one listener for all, and the mark that says which starter's timer runs. */
export class TimerStarters extends Controller {
    connect() {
        this.listen(this.host, 'click', (event) => this.onStart(/** @type {MouseEvent} */ (event)));
        this.listen(this.host, TIMER_DONE_EVENT, (event) => this.onDone(event));
    }

    /** A press on a starter: start its timer, or point at the one already running. @param {MouseEvent} event */
    onStart(event) {
        const starter = event.target instanceof Element ? event.target.closest(TIMER_START) : null;
        if (!starter || starter.closest('[aria-disabled="true"]') || HANDLED.has(event)) return;
        HANDLED.add(event);
        const list = targetOf(starter);
        if (!list) return;
        const seconds = parseDuration(starter.getAttribute('data-kp-timer-start') ?? '');
        const name = starter.getAttribute('data-kp-timer-name') ?? starter.textContent?.trim() ?? '';
        const id = starter.getAttribute('data-kp-timer-id') ?? `start:${name}`;
        const running = find(list, id);
        if (running && running.state !== 'done') {
            /** @type {HTMLElement | null} */ (running.card.querySelector('.kp-timer__toggle'))?.focus();
            say(list, getStrings().timerAlready(name));
            return;
        }
        const message = starter.getAttribute('data-kp-timer-say') ?? '';
        if (startTimer(list, { name, seconds, id, say: message })) starter.setAttribute('data-kp-timer-running', id);
    }

    /** A timer ended: its starter is free again. @param {Event} event */
    onDone(event) {
        const id = /** @type {CustomEvent} */ (event).detail?.timer?.id;
        if (!id) return;
        for (const starter of document.querySelectorAll(`${TIMER_START}[data-kp-timer-running="${CSS.escape(id)}"]`))
            starter.removeAttribute('data-kp-timer-running');
    }
}
