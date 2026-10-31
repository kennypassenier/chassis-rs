// Attaches the focus-steps views of a page.
import { attachOne } from '../controller.js';
import { FOCUS_STEPS, WIRED } from './constants.js';
import { FocusStepsControl } from './controller.js';

/**
 * Wire every focus-steps view under `root`: its buttons, keys, swipe, Read
 * aloud, and the screen kept on until the detach.
 * @param {ParentNode} [scope]
 * @returns {() => void} detach
 */
export function attachFocusSteps(scope = document) {
    const roots = /** @type {HTMLElement[]} */ ([
        ...(scope instanceof HTMLElement && scope.matches(FOCUS_STEPS) ? [scope] : []),
        ...scope.querySelectorAll(FOCUS_STEPS),
    ]);
    // A view in WIRED is wired already, by this call's controller or an earlier one; wake.js reads the same set.
    const made = roots.filter((root) => !WIRED.has(root)).map((root) => attachOne(root, FocusStepsControl));
    return () => {
        for (const control of made) control?.destroy();
    };
}
