// Attaches the run timelines of a page.
import { attachOne } from '../controller.js';
import { GANTT, gantts } from './constants.js';
import { GanttControl } from './controller.js';
/** @typedef {import('./constants.js').GanttOptions} GanttOptions */

/**
 * Attach every run timeline under `root` (below it: the root itself is not one of them).
 * @param {ParentNode} [root]
 * @param {GanttOptions} [options]
 * @returns {() => void} detach
 */
export function attachGantts(root = document, options = {}) {
    // A timeline in the registry is wired already, by this call's controller or an earlier one.
    const made = /** @type {HTMLElement[]} */ ([...root.querySelectorAll(GANTT)])
        .filter((el) => !gantts.has(el))
        .map((el) => attachOne(el, GanttControl, options));
    return () => {
        for (const control of made.splice(0)) control?.destroy();
    };
}
