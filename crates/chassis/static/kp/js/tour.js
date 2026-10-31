// A short guided tour over the page, and the help drawer it starts from [scope-143].
//
// The homelab dashboard's tour (port spec I.3), moved into the package.
// startTour(steps) walks the reader over the page, one card per step, beside
// the part it talks about:
//
//   startTour([
//       { target: '[data-area="nav"]', title: 'The areas', text: 'Five areas, always in the same place.' },
//       { target: () => document.querySelector('#search'), title: 'Search', text: 'Find a pump house by its name.' },
//   ], { remember: 'network', returnFocus: helpButton });
//
// What it keeps:
//   - The count is exact: a step whose target is not on the page (absent, or
//     hidden) is left out before counting, so six steps with one missing read
//     `1 of 5` … `5 of 5`. With no step left there is no tour (null).
//   - The card (`.kp-tour`) is a non-modal dialog: the page stays usable. It
//     sits 12 px under its target, or over it when the target is in the lower
//     half of the window, so it never covers what it talks about; 16 px from
//     the window's edges; and it follows the target when the page scrolls or
//     the window resizes. When the target is inside an open modal dialog, the
//     card goes into that dialog, or it would sit behind it, inert.
//   - The target gets `data-kp-tour-target`: a ring in the focus colour, and
//     the rest of the page dimmed around it.
//   - Back, Skip and Next (Done on the last step), ← and → on the card, and
//     Esc anywhere end or move it. When it ends, the focus goes back where it
//     was (or to `returnFocus`), and a finished or skipped tour is remembered
//     under `remember` through js/remember.js, if the browser lets it.
//
// shouldStartTour({ search, remembered, automated }) says whether a page
// starts it by itself: `?tour` (or `?tour=3`) always does; otherwise only a
// first visit by a person, not a browser driven by a script.
//
// `.kp-drawer` (the Help it starts from) and `.kp-help` are markup and CSS
// only. Every word is in the dictionary (`tour…` in js/strings.js).
// `decorate(part, info)` is called with the card's three buttons each time a
// tour builds them. Nothing runs on import.
//
// A running tour is one TourRun controller (js/tour/run.js over js/tour/core.js, on js/controller.js; the card is its host); the parts are listed in
// js/README.md.

import { attachOne } from './controller.js';
import { resolveStrings } from './strings.js';
import { buildCard } from './tour/build.js';
import { TourRun } from './tour/run.js';
import { resolveTarget, tourStepsOnPage } from './tour/place.js';

export { TOUR_GUTTER, TOUR_GAP, shouldStartTour, tourStepsOnPage, tourCardPlace } from './tour/place.js';
export { tourMemoryKey, tourRemembered, forgetTour } from './tour/memory.js';

/** @typedef {import('./strings.js').Strings} Strings */

/**
 * One step of a tour: the part of the page it is about (a selector, whose
 * first shown match is taken, or a function), and what the card says.
 * @typedef {object} TourStep
 * @property {string | (() => Element | null)} target
 * @property {string} title
 * @property {string} text
 */

/**
 * What `decorate` is told about the control it is handed: the same shape every kp module's `decorate` takes.
 * `kind` is `tour-next`, `tour-back` or `tour-skip`; `host` is the tour's card.
 * @typedef {{ kind: 'tour-next' | 'tour-back' | 'tour-skip', host: HTMLElement, key?: string, index?: number, label?: string, value?: string }} TourDecorateInfo
 */

/**
 * @typedef {object} TourOptions
 * @property {number} [start] the step to open on, counted from 0 among the steps that are on the page
 * @property {string} [remember] the name a finished or skipped tour is remembered under (js/remember.js, component `tour`)
 * @property {(part: HTMLElement, info: TourDecorateInfo) => void} [decorate] called with the card's buttons each time a tour builds them [R-DRIVE]
 * @property {HTMLElement | null} [returnFocus] where the focus goes when the tour ends; the focused element when it started, by default
 * @property {(finished: boolean) => void} [onEnd] called once when it ends: `true` when Done was pressed on the last step
 * @property {Partial<Strings>} [strings] any of the dictionary's `tour…` words, for this tour only
 */

/** What startTour hands back: end it, or go to a step (counted from 0 among the steps on the page). @typedef {{ end: () => void, goto: (i: number) => void }} TourHandle */

/**
 * Walk the reader over the page, one card per step, beside its target.
 * Steps whose target is not on the page are left out before counting, so the
 * count is exact. The card is a non-modal dialog: the page stays usable. Esc
 * or Skip ends it, the focus goes back where it was, and a tour that ended
 * is remembered (`remember`), if the browser lets it.
 * @param {TourStep[]} steps
 * @param {TourOptions} [options]
 * @returns {TourHandle | null} null when no step has a target on the page
 */
export function startTour(steps, { start = 0, remember, decorate, returnFocus, onEnd, strings: own } = {}) {
    TourRun.endRunning();
    const doc = document;
    const live = tourStepsOnPage(steps, (s) => resolveTarget(s, doc));
    if (!live.length) return null;
    const ui = buildCard(doc, resolveStrings(own));
    const run = attachOne(ui.card, TourRun, { live, start, ui, returnFocus, strings: own, remember, decorate, onEnd });
    return run?.handle() ?? null;
}
