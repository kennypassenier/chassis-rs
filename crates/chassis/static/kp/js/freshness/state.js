// What every freshness attach on a page shares: the ticking lines, the one timer, and what has been measured.

/** @typedef {import('../freshness.js').AgoContext} AgoContext */
/** @typedef {import('../freshness.js').AgoState} AgoState */

/** Every ticking line on the page, with the context it ticks in. @type {Map<HTMLElement, AgoContext>} */
export const live = new Map();
/** What each line last painted. @type {WeakMap<HTMLElement, AgoState>} */
export const states = new WeakMap();
/** Reserved widths already measured, by text and face: one read serves every line that shares them. @type {Map<string, number>} */
export const widths = new Map();

/** The values the parts of this module change. */
export const engine = {
    /** The one timer for the whole page. @type {ReturnType<typeof setInterval> | null} */
    timer: null,
    /** Whether the live-region warning has been given. */
    warned: false,
    /** How many attaches listen for the tab being hidden and shown. */
    listening: 0,
};
