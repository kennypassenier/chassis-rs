// Attaches the claim lists of a page.
import { attachOne, controllerOf } from '../controller.js';
import { CLAIM } from './constants.js';
import { ClaimList } from './controller.js';

/**
 * Wire every claim checklist under `root`: the buttons, the menu, the chips, the keys. Items come from the checklist's
 * setChecklistItems() with a `claim` on each; the viewer from setClaimViewer().
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachClaims(root = document) {
    const lists = /** @type {HTMLElement[]} */ ([
        ...(root instanceof HTMLElement && root.matches(CLAIM) ? [root] : []),
        ...root.querySelectorAll(CLAIM),
    ]);
    const made = lists.filter((list) => !controllerOf(list, ClaimList)).map((list) => attachOne(list, ClaimList));
    return () => {
        for (const control of made) control?.destroy();
    };
}
