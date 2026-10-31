// Attaches the availability grids of a page.
import { attachOne, controllerOf } from '../controller.js';
import { ensureParts } from './api.js';
import { AVAILABILITY } from './constants.js';
import { STATE } from './facts.js';
import { AvailabilityControl } from './controller.js';

/**
 * Wire every availability grid under `root`: presses, painting, keys, the switch, Choose.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachAvailability(root = document) {
    const roots = /** @type {HTMLElement[]} */ ([
        ...(root instanceof HTMLElement && root.matches(AVAILABILITY) ? [root] : []),
        ...root.querySelectorAll(AVAILABILITY),
    ]);
    for (const el of roots) {
        // Every grid gets its parts and a state, wired or not: the setters read the state before and after attach.
        ensureParts(el);
        if (!STATE.has(el)) STATE.set(el, { spec: {}, set: { columns: [], answers: {} }, unit: 'range', refused: new Map(), saving: new Set(), menu: null });
    }
    const made = roots.filter((el) => !controllerOf(el, AvailabilityControl)).map((el) => attachOne(el, AvailabilityControl));
    return () => {
        for (const control of made) control?.destroy();
    };
}
