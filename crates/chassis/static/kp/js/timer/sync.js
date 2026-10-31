// Syncs the list with its timers: the busy state, the cards, the tick and the finish of a timer.
import { getStrings } from '../strings.js';
import { openBusyCard } from '../busy-card.js';
import { hostStatePlate } from '../state-plate.js';
import { paint } from './card.js';
import { TIMERS_RETRY_EVENT, TIMER_DONE_EVENT, TIMER_TICK_MS } from './constants.js';
import { leftOf, listOf, part, say, stateOf } from './model.js';
import { playTimerSound, speakTimerMessage, stopRing } from './sound.js';
import { TICKERS } from './state.js';
/** @typedef {import('./types.js').Timer} Timer */

/** Per list: the busy card while loading. @type {WeakMap<Element, import('../busy-card.js').BusyCard>} */
const BUSY = new WeakMap();
/** Per empty line: the plate drawn in it (its kind and words), so a draw that changes nothing leaves it alone. @type {WeakMap<Element, string>} */
const PLATE = new WeakMap();

/** Show or hide the state plate (empty or failed), start or stop the ticker. @param {HTMLElement} list */
export function sync(list) {
    const timers = listOf(list);
    const empty = part(list, 'empty');
    const strings = getStrings();
    const error = list.getAttribute('data-kp-timers-error');
    const loading = list.hasAttribute('aria-busy');
    // A list without timers is the state `empty`, written like every other data component's, so the footprint
    // (js/footprint.js) holds the height the list had; `loading` and `error` are the page's to set [r6r8-1019].
    const shown = list.getAttribute('data-kp-state');
    if (shown === null || shown === 'ready' || shown === 'empty') {
        if (timers.size === 0) list.setAttribute('data-kp-state', 'empty');
        else if (shown === 'empty') list.setAttribute('data-kp-state', 'ready');
    }
    // Empty and failed are the package's state plate over the whole box a row of timers fills, a failure with its Retry
    // (`kp-timers-retry`); loading is the busy card over that box. The empty part is the plate itself (the themes dress it).
    const title = error ?? list.getAttribute('data-kp-timers-empty') ?? strings.timerEmpty;
    const plateKey = loading ? 'loading' : `${error !== null ? 'error' : 'empty'}|${title}`;
    if (PLATE.get(empty) !== plateKey) {
        PLATE.set(empty, plateKey);
        if (loading) {
            empty.replaceChildren();
            empty.classList.remove('kp-alert', 'kp-alert--destructive', 'kp-empty', 'kp-stateplate', 'kp-stateplate--error', 'kp-stateplate--empty');
        } else hostStatePlate(list, { kind: error !== null ? 'error' : 'empty', title, retryEvent: TIMERS_RETRY_EVENT, into: empty });
    }
    empty.hidden = !(error !== null || timers.size === 0);
    empty.toggleAttribute('data-kp-timers-failed', error !== null);
    list.toggleAttribute('data-kp-timers-covered', error !== null || timers.size === 0);
    const running = [...timers.values()].some((t) => t.state === 'running');
    const ticker = TICKERS.get(list);
    if (running && !ticker)
        TICKERS.set(
            list,
            setInterval(() => tick(list), TIMER_TICK_MS),
        );
    else if (!running && ticker) {
        clearInterval(ticker);
        TICKERS.delete(list);
    }
}

/**
 * The list's state: `loading` lays the busy card over the box the timers fill (and keeps it at its height), `error` says
 * `message` on the failed plate with a Retry where the timers were (they keep running underneath), `ready` is neither
 * [r6r8-1019; audhd-recepten gap 30].
 * @param {Element} list @param {'loading' | 'error' | 'ready'} state @param {string} [message]
 */
export function setTimersState(list, state, message) {
    if (!(list instanceof HTMLElement)) return;
    list.setAttribute('data-kp-state', state);
    if (state === 'error') list.setAttribute('data-kp-timers-error', message ?? getStrings().timersFailed);
    else list.removeAttribute('data-kp-timers-error');
    const card = BUSY.get(list);
    if (state === 'loading') {
        list.setAttribute('aria-busy', 'true');
        if (!card)
            BUSY.set(list, openBusyCard(list, { words: message ?? getStrings().timersLoading, area: () => [list], className: 'kp-timers__busy' }));
    } else {
        list.removeAttribute('aria-busy');
        if (card) {
            BUSY.delete(list);
            void card.close();
        }
    }
    sync(list);
}

/** @param {HTMLElement} list */
export function tick(list) {
    for (const timer of listOf(list).values()) {
        if (timer.state !== 'running') continue;
        const left = leftOf(timer);
        if (left <= 0) finish(list, timer);
        else {
            if (!timer.warned && left <= 60_000 && timer.total > 90_000) {
                timer.warned = true;
                say(list, getStrings().timerLastMinute(timer.name));
            }
            paint(timer);
        }
    }
    sync(list);
}

/**
 * A timer has ended: the done plate, the chime, a buzz, a notification, the
 * alert and the event.
 * @param {HTMLElement} list @param {Timer} timer @param {{ quiet?: boolean }} [options]
 */
export function finish(list, timer, { quiet = false } = {}) {
    timer.state = 'done';
    timer.endsAt = null;
    timer.left = 0;
    paint(timer);
    const strings = getStrings();
    say(list, strings.timerDone(timer.name), 'alert');
    if (!quiet) {
        const sound = list.getAttribute('data-kp-timers-sound') ?? 'chime';
        const speak = list.getAttribute('data-kp-timers-speak') === 'on';
        /** The sound, then (once it has played) the sentence. */
        const announce = () => {
            const length = playTimerSound(sound);
            if (speak)
                setTimeout(
                    () =>
                        listOf(list).get(timer.id) === timer &&
                        timer.state === 'done' &&
                        speakTimerMessage(timer.say || strings.timerSpoken(timer.name)),
                    length * 1000,
                );
        };
        if (sound !== 'off' || speak) {
            announce();
            const ring = Number(list.getAttribute('data-kp-timers-ring') ?? 60);
            if (ring > 0) {
                const until = Date.now() + ring * 1000;
                timer.card.setAttribute('data-kp-timer-ringing', '');
                timer.ring = setInterval(() => {
                    if (Date.now() >= until || timer.state !== 'done') return stopRing(timer);
                    announce();
                }, 4000);
            }
        }
        navigator.vibrate?.([300, 150, 300]);
        if (list.getAttribute('data-kp-timers-notify') !== 'false' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
                new Notification(strings.timerDone(timer.name), { tag: `kp-timer-${timer.id}` });
            } catch {
                // A page that may not raise one from here (a phone's tab): the card says it.
            }
        }
    }
    list.dispatchEvent(new CustomEvent(TIMER_DONE_EVENT, { bubbles: true, detail: { timer: stateOf(timer) } }));
}
