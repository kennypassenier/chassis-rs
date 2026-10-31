// The problem alert: what is wrong, why, and what to do now [kpadopt5].
//
// An alert with three fixed parts, the shape of `chassis::Error` (the error and its remedy): `.kp-alert__what`,
// `.kp-alert__why`, `.kp-alert__remedy`, and the fix beside them in `.kp-alert__actions`. The markup is plain CSS
// (css/components.css) and works without this module; `setProblems(el, items)` is for a page whose problems change, and
// it updates by key like `setAttention` (js/attention.js), so an alert that is still true is the same element, is not
// announced again and keeps the focus on its fix.
//
//   <div class="kp-problems" data-kp-problems data-kp-problems-mode="each"></div>
//   setProblems(el, [
//       { key: 'calendar', what: 'The calendar is not shared', why: 'Almanac cannot read it.', remedy: 'Share it with the service account.',
//         action: button },
//   ]);
//
// Kenny, 2026-10-17: "toon de verschillende opties in een demo", so the layout is an option, not a decision:
//
//   `each`  (default) one alert per problem, the worst first, each with its own fix
//   `list`  one alert holding every problem as a list, the tone of the worst
//   `fold`  one alert per problem below the threshold; from it (`data-kp-problems-fold-from`, default 5, at least 2) one
//           alert with the worst open and "Show the other N" for the rest
//
// Both are options with a default and switch at runtime (Kenny, 2026-10-17 22:09: "one per problem is default, the others
// are options that can be configured dynamically, so also the five can be changed"): change `data-kp-problems-mode` or
// `data-kp-problems-fold-from` on the container and it re-renders at once from the problems it was last given.
//
// A remedy that is a command (`command`) is set in code with a Copy button. A problem is dismissible only when its item
// says so; a real problem should not be closable until it is fixed. Nothing runs on import.
//
// A container is one ProblemsBoard controller, made by the first setProblems (js/problems/board.js over each.js and summary.js, on js/controller.js);
// attachProblems stamps the markup through ProblemsStamp. The parts are listed in js/README.md.

import { attachOne, controllerOf } from './controller.js';
import { ProblemsBoard } from './problems/board.js';
import { ProblemsStamp } from './problems/stamp.js';
import { PROBLEMS } from './problems/values.js';

export { PROBLEMS, PROBLEM_SEVERITIES, PROBLEM_MODES, PROBLEM_DISMISS_EVENT } from './problems/values.js';

/**
 * One problem.
 * @typedef {object} Problem
 * @property {string} key its stable id: the same key is the same element on every refresh
 * @property {string} what what is wrong, in one line
 * @property {string} [why] why it is
 * @property {string} [remedy] what to do now
 * @property {string} [command] a command that fixes it, set in code with a Copy button
 * @property {'critical' | 'warning' | 'info'} [severity] default `warning`: most problems are "could not use this", not outages
 * @property {Node | null} [action] the fix (a button or a link); a node equal in markup to the one shown keeps the one shown
 * @property {boolean} [dismissible] a close button on this problem (default off)
 */

/**
 * @typedef {object} ProblemsOptions
 * @property {'each' | 'list' | 'fold'} [mode] default: the container's `data-kp-problems-mode`, else `each`
 * @property {number} [foldFrom] with `fold`: the count from which the problems fold (default 5)
 * @property {string} [remedyLabel] the word before the remedy (default the dictionary's "What now")
 */

/**
 * Set a container's problems, by key. Worst first, in the given order within a severity.
 *
 * @param {Element} container a `[data-kp-problems]`
 * @param {Problem[]} items
 * @param {ProblemsOptions} [options]
 */
export function setProblems(container, items, options = {}) {
    const host = /** @type {HTMLElement} */ (container);
    const board = controllerOf(host, ProblemsBoard) ?? attachOne(host, ProblemsBoard);
    board?.track(items, options);
    board?.paint(items, options);
}

/**
 * Attach every container of problems under `root`: it stamps the layout and the count, so the markup is complete.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachProblems(root = document) {
    const made = /** @type {HTMLElement[]} */ ([...root.querySelectorAll(PROBLEMS)])
        .filter((el) => !el.hasAttribute('data-kp-problems-attached') && !controllerOf(el, ProblemsStamp))
        .map((el) => attachOne(el, ProblemsStamp))
        .filter((stamp) => stamp !== undefined);
    return () => {
        for (const stamp of made) stamp.destroy();
    };
}
