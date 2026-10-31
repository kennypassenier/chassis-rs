// Attaches the week agendas of a page.
import { attachOne } from '../controller.js';
import { WEEK } from './constants.js';
import { weeks } from './state.js';
import { WeekControl } from './controller.js';
/** @typedef {import('./types.js').WeekOptions} WeekOptions */

/**
 * Attach every week agenda under `root` (below it: the root itself is not one of them).
 * @param {ParentNode} [root]
 * @param {WeekOptions} [options]
 * @returns {() => void} detach
 */
export function attachWeeks(root = document, options = {}) {
    // An agenda in the registry is wired already, by this call's controller or an earlier one.
    const made = /** @type {HTMLElement[]} */ ([...root.querySelectorAll(WEEK)])
        .filter((el) => !weeks.has(el))
        .map((el) => attachOne(el, WeekControl, options));
    return () => {
        for (const control of made.splice(0)) control?.destroy();
    };
}
