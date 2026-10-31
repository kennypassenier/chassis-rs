// The next times: what a repetition really does [kpadopt5-time; homelab's `.sch-preview`].
//
// Under a schedule's settings a short list says when it will run next, so the person sees what the setting means
// ("Mon 20/10/2026 03:00 · in 2 days"). The app owns the rule and computes the times; the package draws them:
//
//   <div class="kp-runs" data-kp-runs data-kp-runs-count="3"></div>
//   setRuns(el, [Date.parse('2026-10-20T03:00:00+02:00'), …]);
//
// A time is a number (ms), an ISO string or a Date, or `{ at, conflict }` where `conflict` is a sentence the app words
// ("Overlaps the backup of vault"); the row then carries it as a warning mark. Times are written as rule 52 does,
// with the weekday, in Europe/Brussels unless `data-kp-time-zone` names another zone; beside each stands how far away it
// is ("in 2 days"). A run that comes after the clock was turned (summer or winter time) carries the mark "Clock goes
// back 1 h": the wall time is the schedule's, the moment is not the same distance from the run before.
//
// Options (markup, then the option of attachRuns()), each with a default [KT6]:
//   data-kp-runs-count     how many rows                         3
//   data-kp-runs-relative  "false" leaves the "in 2 days" out    shown
//   data-kp-runs-warn      "false" leaves the marks out          shown
//   data-kp-runs-more      N: a "Show N more" for times past the count   off
//   data-kp-runs-title     the heading over the list             "Next times"
//   data-kp-time-zone      an IANA zone                          Europe/Brussels
//   data-kp-now            an ISO moment: a fixed clock for a demo or a test   the real clock
//
// States, all in the same footprint (the height of `count` rows, so nothing under it moves):
//   ready    the rows;
//   empty    the app's reason, centred at heading size in the package's empty plate: `setRuns(el, [], { reason })`;
//   loading  the theme's busy card over placeholder rows (setRunsState(el, 'loading'));
//   error    "Could not work out the next times" with a Try again, which fires `kp-runs-retry`.
//
// A status region says the first run only when it changes. The relative words are refreshed every minute unless the
// clock is fixed. Nothing runs on import; attachRuns(root) returns a detach.

import { attachAll, controllerOf } from './controller.js';
import { RunsList } from './runs/controller.js';
import { RUNS } from './runs/values.js';

export { RUNS, RUNS_RETRY_EVENT, RUNS_STATES } from './runs/values.js';
export { runsRelative, zoneOffset, runMoment, clockShift } from './runs/time.js';

/**
 * @typedef {number | string | Date | { at: number | string | Date, conflict?: string }} RunInput
 * @typedef {object} Run
 * @property {number} at ms
 * @property {string} [conflict]
 * @typedef {'ready' | 'empty' | 'loading' | 'error'} RunsState
 * @typedef {object} RunsOptions
 * @property {string} [reason] the sentence an empty list shows ("Pick a time")
 * @property {string} [title] an error's first line
 * @property {string} [text] an error's sentence
 */

/**
 * @typedef {object} RunsHandle
 * @property {HTMLElement} element
 * @property {(times: readonly RunInput[], options?: RunsOptions) => void} set the times; none is the empty state
 * @property {(state: RunsState, options?: RunsOptions) => void} setState
 * @property {() => Run[]} runs
 * @property {() => RunsState} state
 */

/** The handle of an attached list. @param {Element} element @returns {RunsHandle | null} */
export function runs(element) {
    return controllerOf(element, RunsList)?.handle ?? null;
}

/**
 * Give a list its times (none: the empty state, with `reason`).
 * @param {Element} element @param {readonly RunInput[]} times @param {RunsOptions} [options]
 */
export function setRuns(element, times, options) {
    runs(element)?.set(times, options);
}

/**
 * Put a list in a state: ready, empty, loading or error.
 * @param {Element} element @param {RunsState} state @param {RunsOptions} [options]
 */
export function setRunsState(element, state, options) {
    runs(element)?.setState(state, options);
}

/**
 * Wire every next-times list under `root`.
 * @param {ParentNode} [root]
 * @param {{ now?: () => number }} [options]
 * @returns {() => void} detach
 */
export function attachRuns(root = document, options = {}) {
    return attachAll(root, RUNS, RunsList, options);
}
