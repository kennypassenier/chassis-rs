// The swatch picker [parts-1102; the Habits todo app's colour of a project or a tag, one of twelve].
//
//   <div class="kp-swatches" data-kp-swatches aria-label="Project colour"></div>
//
//   setSwatches(el, [{ value: 'red', label: 'Red', colour: 1 }, { value: 'teal', label: 'Teal', colour: 6 }, …], 'teal');
//
// A grid of the theme's twelve categorical colours (`--kp-cat-1` … `--kp-cat-12`, the swatch's place when it names no `colour`; a
// `colour` that is not 1 to 12 is any CSS colour), six to a row (`data-kp-swatches-columns`), wrapping sooner on a narrow picker.
// Each swatch is a toggle button named by its label (and titled with it); the current one is pressed (`aria-pressed="true"`) and
// wears a check in the swatch's own ink; its name stands under the grid (`data-kp-swatches-name="off"` leaves it out). One tab stop:
// ← → walk along a row, ↑ ↓ across the rows, Home and End to the ends; Enter, Space or a press picks, fires
// `kp-swatch-change { value, label, source }` and keeps the focus on the swatch. Under a coarse pointer each swatch is 44 px.
// Every register paints the frame with its own radius and ring; the colours are the theme's own.
//
// Nothing runs on import; attachSwatches(root) returns a detach; setSwatches wires a picker that is not yet.

import { attachAll, attachOne, controllerOf } from './controller.js';
import { SWATCHES } from './swatches/constants.js';
import { SwatchesControl } from './swatches/controller.js';

export { SWATCHES, SWATCH_CHANGE_EVENT } from './swatches/constants.js';

/** @typedef {import('./swatches/constants.js').Swatch} Swatch */

/**
 * Wire every swatch picker under `root` (the root itself included). Idempotent.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachSwatches(root = document) {
    return attachAll(root, SWATCHES, SwatchesControl);
}

/**
 * Give a picker its swatches and the current value (none: `null`).
 * @param {Element} el
 * @param {readonly Swatch[]} swatches
 * @param {string | null} [current]
 */
export function setSwatches(el, swatches, current = null) {
    const c = controllerOf(el, SwatchesControl) ?? attachOne(/** @type {HTMLElement} */ (el), SwatchesControl);
    c?.set(swatches, current);
}

/**
 * The current value of a wired picker, or null.
 * @param {Element} el
 * @returns {string | null}
 */
export function getSwatchValue(el) {
    return controllerOf(el, SwatchesControl)?.current ?? null;
}
