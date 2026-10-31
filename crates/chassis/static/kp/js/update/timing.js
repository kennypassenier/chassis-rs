// The idea a register names for an update and the time and curve it plays on, from the theme's motion.

import { registerTime, themeMotion, withoutOvershoot } from '../motion.js';
import { UPDATE_STRETCH } from './values.js';

/**
 * The idea a register's `--kp-update` names, or '' for none.
 * @param {string | null | undefined} value the computed custom property
 * @returns {string}
 */
export function updateIdea(value) {
    const idea = String(value ?? '').trim();
    return idea === 'none' ? '' : idea;
}

/**
 * How long an update plays and on which curve, from the theme's motion: the
 * box's resize time or the dialog's close time, whichever is longer, times
 * 1.25; the entrance's curve without its overshoot. 0 without motion. A
 * register that knows its own update time says it with `--kp-update-time`
 * (`time`, in ms, read by updateTiming()): when set it is the time, whatever
 * the dialog's is; unset, the time above.
 * @param {{ size: number, close: number, ease: string, time?: number | null }} motion what themeMotion() returns, and the register's own time
 * @returns {{ duration: number, ease: string }}
 */
export function updateTimingOf({ size, close, ease, time = null }) {
    const duration = time !== null && Number.isFinite(time) && time >= 0 ? time : Math.max(size, close) * UPDATE_STRETCH;
    return { duration, ease: withoutOvershoot(ease) };
}

/**
 * The update timing of the theme at `scope`.
 * @param {Element} [scope]
 * @returns {{ duration: number, ease: string }}
 */
export function updateTiming(scope = document.documentElement) {
    return updateTimingOf({ ...themeMotion(scope), time: registerTime(scope, '--kp-update-time') });
}

/**
 * Whether an update with this idea plays anything: whenever the register
 * names one. Its timing may be 0 (reduced motion): a register that names an
 * idea there plays a still version on its own time.
 * @param {string} idea
 */
export const updatePlays = (idea) => idea !== '';
