// What a timer list reads: the clock face, the time left, its state and its parts.
import { formatCountdown } from '../countdown.js';
import { LISTS } from './state.js';
/** @typedef {import('./types.js').Timer} Timer */
/** @typedef {import('./types.js').TimerState} TimerState */

/** @param {Timer} timer @param {number} ms */
export const clockOf = (timer, ms) => formatCountdown(ms, timer.total >= 3_600_000);

/** @param {Timer} timer */
export const leftOf = (timer) => (timer.state === 'running' && timer.endsAt !== null ? Math.max(0, timer.endsAt - Date.now()) : timer.left);

/** @param {Timer} timer @returns {TimerState} */
export const stateOf = (timer) => ({
    id: timer.id,
    name: timer.name,
    seconds: Math.round(timer.total / 1000),
    remaining: Math.ceil(leftOf(timer) / 1000),
    endsAt: timer.state === 'running' ? timer.endsAt : null,
    state: timer.state,
    ...(timer.say ? { say: timer.say } : {}),
});

/** @param {Element} list @returns {TimerState[]} */
export function getTimers(list) {
    return [...(LISTS.get(list)?.values() ?? [])].map(stateOf);
}

/** @param {string} className @param {string} [tag] */
export const el = (className, tag = 'div') => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};

/** @param {Element} list @param {string} name @returns {HTMLElement} */
export function part(list, name) {
    let node = /** @type {HTMLElement | null} */ (list.querySelector(`:scope > .kp-timers__${name}`));
    if (node) return node;
    if (name === 'list') {
        node = el('kp-timers__list', 'ul');
        list.prepend(node);
    } else if (name === 'empty') {
        node = el('kp-timers__empty', 'div');
        part(list, 'list').after(node);
    } else {
        node = el(`kp-sr-only kp-timers__${name}`, 'span');
        node.setAttribute('role', name === 'alert' ? 'alert' : 'status');
        list.append(node);
    }
    return node;
}

/** @param {Element} list @param {string} message @param {'live' | 'alert'} [where] */
export function say(list, message, where = 'live') {
    const region = part(list, where);
    region.textContent = '';
    setTimeout(() => (region.textContent = message), 60);
}

/** @param {Element} list */
export const listOf = (list) => {
    let timers = LISTS.get(list);
    if (!timers) {
        timers = new Map();
        LISTS.set(list, timers);
    }
    return timers;
};
