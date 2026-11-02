// Attaches the focus-steps views of a page.
import { attachOne, controllerOf } from '../controller.js';
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

/**
 * Go on, exactly as the Next button does: a question is answered first, the last step ends the flow with Done.
 * @param {Element} root a focus-steps view that is attached
 */
export function nextStep(root) {
    controllerOf(root, FocusStepsControl)?.next();
}

/**
 * Go back, exactly as the Back button does (within the active track when there are tracks).
 * @param {Element} root a focus-steps view that is attached
 */
export function prevStep(root) {
    controllerOf(root, FocusStepsControl)?.prev();
}
