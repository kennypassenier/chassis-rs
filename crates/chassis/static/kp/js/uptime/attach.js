// Attaches the uptime strips of a page.
import { attachOne, controllerOf, hostsOf } from '../controller.js';
import { attachHoverCards } from '../hovercard.js';
import { UPTIME } from './constants.js';
import { UptimeControl } from './controller.js';
/** @typedef {import('./types.js').UptimePeriod} UptimePeriod */
/** @typedef {import('./types.js').UptimeSpec} UptimeSpec */

/**
 * Wire every strip under `root`: draw the waiting state of a strip not yet given its periods, follow its width, and
 * take its keys and presses.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachUptimes(root = document) {
    const strips = hostsOf(root, UPTIME);
    const made = strips
        .filter((el) => !(el.dataset.kpUptimeAttached !== undefined || controllerOf(el, UptimeControl)))
        .map((el) => attachOne(el, UptimeControl))
        .filter((control) => control !== undefined);
    const doc = root instanceof Document ? root : (root.ownerDocument ?? document);
    if (strips.length > 0) attachHoverCards(doc);
    return () => {
        for (const control of made) control.destroy();
    };
}
