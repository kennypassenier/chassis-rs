// Running a timer: finishing, starting, pausing, resuming, adding time, stopping and restoring.
import { getStrings } from '../strings.js';
import { buildCard, paint } from './card.js';
import { TIMERS, TIMER_CHANGE_EVENT, TIMER_START, TIMER_START_EVENT, TIMER_STOP_EVENT } from './constants.js';
import { clockOf, leftOf, listOf, part, say, stateOf } from './model.js';
import { primeSound, stopRing } from './sound.js';
import { LISTS, timerState } from './state.js';
import { finish, sync } from './sync.js';
/** @typedef {import('./types.js').Timer} Timer */
/** @typedef {import('./types.js').TimerState} TimerState */

/**
 * Ask the browser for permission to show a system notification when a timer
 * ends. Call it from a press. Resolves with the answer.
 * @returns {Promise<NotificationPermission | 'unsupported'>}
 */
export async function askTimerNotifications() {
    if (typeof Notification === 'undefined') return 'unsupported';
    if (Notification.permission !== 'default') return Notification.permission;
    return Notification.requestPermission();
}

/** @param {HTMLElement} list @param {Timer} timer @param {string} type @param {object} [extra] */
const emit = (list, timer, type, extra = {}) =>
    list.dispatchEvent(new CustomEvent(type, { bubbles: true, detail: { timer: stateOf(timer), ...extra } }));

/** @param {Element} list @param {string} id */
export const find = (list, id) => LISTS.get(list)?.get(id) ?? null;

/**
 * Start a timer. With an `id` that already runs, nothing new starts and that
 * id is returned.
 * @param {Element} list
 * @param {{ name: string, seconds: number, id?: string, say?: string }} options  `say`: what is spoken when it ends
 * @returns {string | null} the timer's id
 */
export function startTimer(list, { name, seconds, id, say: message = '' }) {
    if (!(list instanceof HTMLElement) || !(seconds > 0)) return null;
    const timers = listOf(list);
    const key = id ?? `t${Date.now().toString(36)}${(timerState.serial += 1)}`;
    const existing = timers.get(key);
    if (existing && existing.state !== 'done') return key;
    if (existing) removeCard(list, existing, false);
    primeSound();
    const card = buildCard(key);
    /** @type {Timer} */
    const timer = {
        id: key,
        name,
        total: seconds * 1000,
        endsAt: Date.now() + seconds * 1000,
        left: seconds * 1000,
        state: 'running',
        warned: false,
        say: message,
        ring: null,
        card,
    };
    timers.set(key, timer);
    paint(timer);
    part(list, 'list').append(card);
    void import('../motion.js').then((m) => card.isConnected && m.arriveShown(card));
    sync(list);
    say(list, getStrings().timerStartedNamed(name, clockOf(timer, timer.total)));
    emit(list, timer, TIMER_START_EVENT);
    return key;
}

/** @param {Element} list @param {string} id */
export function pauseTimer(list, id) {
    const timer = find(list, id);
    if (!timer || timer.state !== 'running' || !(list instanceof HTMLElement)) return;
    timer.left = leftOf(timer);
    timer.endsAt = null;
    timer.state = 'paused';
    paint(timer);
    sync(list);
    emit(list, timer, TIMER_CHANGE_EVENT, { action: 'pause' });
}

/** @param {Element} list @param {string} id */
export function resumeTimer(list, id) {
    const timer = find(list, id);
    if (!timer || timer.state !== 'paused' || !(list instanceof HTMLElement)) return;
    primeSound();
    timer.endsAt = Date.now() + timer.left;
    timer.state = 'running';
    paint(timer);
    sync(list);
    emit(list, timer, TIMER_CHANGE_EVENT, { action: 'resume' });
}

/**
 * Add time to a timer; a done one starts again for that long.
 * @param {Element} list @param {string} id @param {number} [seconds]
 */
export function addTimerTime(list, id, seconds = 60) {
    const timer = find(list, id);
    if (!timer || !(list instanceof HTMLElement)) return;
    const ms = seconds * 1000;
    if (timer.state === 'done') {
        stopRing(timer);
        timer.total = ms;
        timer.endsAt = Date.now() + ms;
        timer.state = 'running';
        timer.warned = ms <= 60_000;
    } else if (timer.state === 'running' && timer.endsAt !== null) {
        timer.endsAt += ms;
        timer.total += ms;
        if (leftOf(timer) > 60_000) timer.warned = false;
    } else {
        timer.left += ms;
        timer.total += ms;
    }
    paint(timer);
    sync(list);
    emit(list, timer, TIMER_CHANGE_EVENT, { action: 'add' });
}

/** Stop a done timer's chime and let it rest on its done plate. @param {Element} list @param {string} id */
export function stopTimerRing(list, id) {
    const timer = find(list, id);
    if (!timer || !(list instanceof HTMLElement)) return;
    stopRing(timer);
    emit(list, timer, TIMER_CHANGE_EVENT, { action: 'stop-ring' });
}

/** @param {HTMLElement} list @param {Timer} timer @param {boolean} animate */
function removeCard(list, timer, animate) {
    stopRing(timer);
    listOf(list).delete(timer.id);
    const { card } = timer;
    if (animate) void import('../motion.js').then((m) => m.leave(card)).catch(() => card.remove());
    else card.remove();
}

/**
 * Remove a timer (Stop): its card leaves the theme's way.
 * @param {Element} list @param {string} id
 */
export function stopTimer(list, id) {
    const timer = find(list, id);
    if (!timer || !(list instanceof HTMLElement)) return;
    removeCard(list, timer, true);
    sync(list);
    for (const starter of document.querySelectorAll(`${TIMER_START}[data-kp-timer-running="${CSS.escape(id)}"]`))
        starter.removeAttribute('data-kp-timer-running');
    emit(list, timer, TIMER_STOP_EVENT);
}

/**
 * Put saved timers back (after a reload): a running one counts on from its
 * end time, one whose end has passed is shown done (and rings only when it
 * ended within the last minute).
 * @param {Element} list @param {TimerState[]} saved
 */
export function restoreTimers(list, saved) {
    if (!(list instanceof HTMLElement)) return;
    const timers = listOf(list);
    for (const s of saved) {
        if (timers.has(s.id)) continue;
        const card = buildCard(s.id);
        /** @type {Timer} */
        const timer = {
            id: s.id,
            name: s.name,
            total: s.seconds * 1000,
            endsAt: s.state === 'running' ? s.endsAt : null,
            left: s.remaining * 1000,
            state: s.state,
            warned: s.remaining <= 60,
            say: s.say ?? '',
            ring: null,
            card,
        };
        timers.set(s.id, timer);
        part(list, 'list').append(card);
        if (timer.state === 'running' && leftOf(timer) <= 0) finish(list, timer, { quiet: Date.now() - (s.endsAt ?? 0) > 60_000 });
        else paint(timer);
    }
    sync(list);
}

/** The list a starter speaks to. @param {Element} starter */
export const targetOf = (starter) => {
    const named = starter.getAttribute('data-kp-timer-for');
    const found = named ? document.getElementById(named) : document.querySelector(TIMERS);
    return found instanceof HTMLElement ? found : null;
};
