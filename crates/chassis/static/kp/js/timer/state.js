// What the timer parts share: the lists, tickers, the audio context and the id counter.
/** @typedef {import('./types.js').Timer} Timer */

/** Per list: its timers, in the order they were started. @type {WeakMap<Element, Map<string, Timer>>} */
export const LISTS = new WeakMap();
/** Per list: its ticker. @type {WeakMap<Element, ReturnType<typeof setInterval>>} */
export const TICKERS = new WeakMap();
/** Starter presses already handled, when two attached roots hear the same one. @type {WeakSet<Event>} */
export const HANDLED = new WeakSet();
/** The mutable values the parts of this module share. */
export const timerState = {
    /** @type {AudioContext | null} */
    audio: null,
    serial: 0,
};
