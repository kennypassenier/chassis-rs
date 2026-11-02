// One swipe [parts-1102]: a press on a row that runs sideways locks after LOCK_PX (and clearly more sideways than up or down);
// before that a vertical move is the browser's scroll and the swipe lets go. While it runs, the row's parts follow the finger and
// the room they leave is the action's plate (js/swipe/plate.js); past the threshold the plate arms and the phone ticks once; let
// go there, the row fires `kp-swipe`; either way it slides home.

import { CLICK_GUARD_MS, HAPTIC_MS, LOCK_PX, LOCK_RATIO, THRESHOLD_MAX_PX, THRESHOLD_SHARE } from './constants.js';
import { clearPlate, paintPlate } from './plate.js';

/** @typedef {import('./constants.js').SwipeAction} SwipeAction */

/**
 * @typedef {object} Gesture
 * @property {HTMLElement} row
 * @property {number} pointer
 * @property {number} x0
 * @property {number} y0
 * @property {number} dx
 * @property {boolean} locked
 * @property {boolean} armed
 * @property {SwipeAction | null} action
 */

/** The side a move shows: toward the row's end reveals the start action, and the other way round; a right-to-left row flips. @param {HTMLElement} row @param {number} dx */
export const sideOf = (row, dx) => {
    const rtl = getComputedStyle(row).direction === 'rtl';
    return (dx > 0) !== rtl ? 'start' : 'end';
};

/** @param {PointerEvent} e @param {HTMLElement} row @returns {Gesture} */
export const begin = (e, row) => ({ row, pointer: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, locked: false, armed: false, action: null });

/**
 * A move of the pointer: false when the press turned out to be a scroll (the gesture ends), else true.
 * @param {Gesture} g @param {PointerEvent} e @param {(side: 'start' | 'end') => SwipeAction | null} actionOf
 */
export function moveTo(g, e, actionOf) {
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (!g.locked) {
        if (Math.abs(dy) > LOCK_PX && Math.abs(dy) >= Math.abs(dx)) return false;
        if (Math.abs(dx) < LOCK_PX || Math.abs(dx) < Math.abs(dy) * LOCK_RATIO) return true;
        g.locked = true;
        try {
            g.row.setPointerCapture(e.pointerId);
        } catch (error) {
            console.warn('kp-swipe: the pointer could not be captured; the swipe follows the row’s own moves', error);
        }
    }
    e.preventDefault();
    follow(g, dx, actionOf);
    return true;
}

/** The row's parts follow, the plate shows the action of the side, armed past the threshold. @param {Gesture} g @param {number} dx @param {(side: 'start' | 'end') => SwipeAction | null} actionOf */
function follow(g, dx, actionOf) {
    const width = g.row.getBoundingClientRect().width;
    const action = actionOf(sideOf(g.row, dx));
    g.dx = action ? Math.max(-width, Math.min(width, dx)) : Math.sign(dx) * Math.min(Math.abs(dx), LOCK_PX * 2);
    const armed = action !== null && Math.abs(g.dx) >= Math.min(THRESHOLD_MAX_PX, width * THRESHOLD_SHARE);
    if (armed && !g.armed) navigator.vibrate?.(HAPTIC_MS);
    g.armed = armed;
    g.action = action;
    paintPlate(g.row, g.dx, action, armed);
}

/** The lift: the row slides home (at once under reduced motion); returns the action to run, or null. @param {Gesture} g @param {boolean} lifted a pointerup, not a cancel */
export function finish(g, lifted) {
    if (!g.locked) return null;
    swallowNextClick(g.row);
    clearPlate(g.row);
    return lifted && g.armed ? g.action : null;
}

/** Drop the one click the browser sends after a swipe's lift, and only that one. A browser that sends none (a touch drag past the
 * slop, a cancel) leaves the eater to the next press on the row or a moment later, so a real tap is never eaten. @param {HTMLElement} row */
function swallowNextClick(row) {
    const stop = (/** @type {Event} */ e) => {
        e.preventDefault();
        e.stopPropagation();
    };
    const done = () => {
        clearTimeout(timer);
        row.removeEventListener('click', stop, { capture: true });
        row.removeEventListener('pointerdown', done, { capture: true });
    };
    const timer = setTimeout(done, CLICK_GUARD_MS);
    row.addEventListener('click', stop, { capture: true, once: true });
    row.addEventListener('pointerdown', done, { capture: true });
}
