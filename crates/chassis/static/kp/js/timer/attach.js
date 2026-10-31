// Attaches the timer lists of a page.
import { attachOne, controllerOf } from '../controller.js';
import { TIMERS } from './constants.js';
import { TimerList, TimerStarters } from './controller.js';

/**
 * Wire every timer list under `root` (its buttons) and every starter in the
 * page. Counting goes on from the end time when the page comes back.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachTimers(root = document) {
    const lists = /** @type {HTMLElement[]} */ ([
        ...(root instanceof HTMLElement && root.matches(TIMERS) ? [root] : []),
        ...root.querySelectorAll(TIMERS),
    ]);
    const made = lists.filter((list) => !controllerOf(list, TimerList)).map((list) => attachOne(list, TimerList));
    // The starters belong to the root, not to a list; every call listens on its own, as before.
    const starters = new TimerStarters(/** @type {HTMLElement} */ (root));
    starters.connect();
    return () => {
        for (const control of [...made, starters]) control?.destroy();
    };
}
