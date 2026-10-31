// The calls a page makes on a countdown: attach the timers and get a timer's clock to drive it.

import { attachAll, controllerOf } from '../controller.js';
import { COUNTDOWN } from './constants.js';
import { CountdownController } from './controller.js';

/** The clock of an attached countdown, to drive it from a script. @param {Element} el @returns {import('./constants.js').CountdownClock | null} */
export const countdownOf = (el) => controllerOf(/** @type {HTMLElement} */ (el), CountdownController)?.clock ?? null;

/**
 * Wire every countdown under `root`.
 * @param {ParentNode} [root]
 * @param {{ now?: () => number, wall?: () => number }} [options] `now` is the clock's (performance.now), `wall` the device's
 *   date and time (Date.now), which an `until` option is counted against
 * @returns {() => void} detach
 */
export const attachCountdowns = (root = document, options = {}) => attachAll(root, COUNTDOWN, CountdownController, options);
