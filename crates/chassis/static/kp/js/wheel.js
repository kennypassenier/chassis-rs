// A wheel that picks for you [kpadopt4; the AuDHD recipe app's "what do we eat tonight"].
//
// A round wheel with a segment per choice. It takes the weight of choosing
// away: the wheel picks, the person says yes or spins again. Weights make a
// segment larger or smaller (long not eaten: larger; yesterday: smaller).
//
//   <div class="kp-wheel" data-kp-wheel aria-label="Tonight's dinner"></div>
//
//   setWheelItems(wheel, [{ id: 'curry', label: 'Chicken curry', weight: 3 }, …]);
//   wheel.addEventListener('kp-wheel-result', (e) => offer(e.detail.item));
//
// Parts, made by the module: the stage (`__stage`) holding the disc
// (`__disc`, an SVG of `__segment`s and `__label`s that turns), the pointer
// at the top (`__pointer`, still) and the Spin button in the middle
// (`__spin`, the theme's primary button); under it the result (`__result`:
// `__caption` and `__outcome`, a status region).
//
// What it does:
//   - The outcome is drawn first, by the weights (pickWeighted()), and the
//     wheel then turns to it: the motion is honest, never decides.
//   - Spin again never lands on the same choice twice in a row while there
//     is another (`data-kp-wheel-repeat="true"` allows it).
//   - Segments are as large as their odds: a segment's angle is its weight's
//     share of the total (a weight of 4 beside 1 and 1 is two thirds of the
//     disc, and two thirds likely). The weights are the whole of "how we
//     divide the chances"; setWheelItems() again with new weights glides the
//     segments to their new size.
//   - It turns a number of whole turns plus the way to the outcome, and the
//     number varies per spin: a whole number drawn between
//     `data-kp-wheel-turns-min` (3) and `data-kp-wheel-turns-max` (6) alike,
//     so no two spins feel the same. `data-kp-wheel-turns="4"` fixes it (min
//     and max both 4). The time follows the travel: `data-kp-wheel-duration`
//     ms (3600) is the time of the mean travel, a longer travel takes
//     proportionally longer (never under 60% nor over 140% of it), so the
//     speed stays alike. The turns only vary the travel: the outcome is drawn
//     by the weights first, and the landing is always on it. It slows on
//     `--kp-wheel-ease` (a long, even settle; a theme may answer its own). For
//     a reader who asked for less motion it takes the short way in
//     `data-kp-wheel-reduced-ms` (600; 0 places it at once), with no whole turn.
//   - Space or Enter on Spin spins it; the outcome is said, once.
//   - A name is never cut: on its segment it takes the largest type the room allows, goes onto two lines when that reads
//     larger, and gives way to the item's `short` form (`{ label: 'Chicken curry with rice', short: 'Curry' }`) when
//     neither fits; a name that fits in no form is not drawn on the disc, it is the segment's tooltip and whole in the
//     result. Segments take
//     the theme's chart colours, soft, and the chosen one is filled deeper
//     while the others step back.
//   - When the choices change (a filter), the segments grow and shrink to
//     their new size in the theme's size time; the wheel keeps its size, so
//     nothing on the page moves. One choice: no spin, the outcome at once. No
//     choice: the empty sentence.
//
// States: setWheelState(wheel, 'loading' | 'error' | 'ready', message):
// loading lays the busy card over the wheel; error says the message where the
// outcome goes.
//
// Events (bubbling, on the root):
//   kp-wheel-spin    { item, index, turns }        the outcome is drawn and the wheel starts (turns: whole turns it will make)
//   kp-wheel-result  { item, index, source }       'spin' | 'only'
//
// Kiosk, tags and the answer card [hover-wheel-1019; the AuDHD recipes app's page for Kenny's parents]:
//   - `data-kp-wheel-kiosk`: no controls. The Spin button in the hub is gone and the wheel itself is the one control: a
//     tap (or Enter / Space with the focus on it) on the disc or on the answer spins it. The hub stays as a quiet plate.
//     A page with only the wheel over a chosen list needs nothing else. Live: set or remove it at any time.
//   - `tag` on an item (`{ label: 'Lasagne', tag: 'Oven, 45 min' }`): a short line about the choice. It stands under the
//     name in the answer card and in the segment's tooltip.
//   - `resting: true` on an item: it stays on the disc so the list is whole, but it is stepped back (faded, dashed edge,
//     its name in italics, "resting" in its tooltip) and the wheel never lands on it while another choice is not resting.
//   - `data-kp-wheel-answer`: the answer card. The caption, the name and the tag stand in one bordered card of reserved
//     size (a tag line is kept even when the choice has none), so nothing under it moves.
//
// Every word it adds is in js/strings.js. Nothing runs on import.
//
// Each wired wheel is one WheelControl controller (js/wheel/controller.js, on js/controller.js); the state stays a registry
// (js/wheel/state.js) so the setters work before wiring. The parts are listed in js/README.md.

import { attachAll } from './controller.js';
import { WheelControl } from './wheel/controller.js';
import { WHEEL } from './wheel/state.js';

export { WHEEL, WHEEL_SPIN_EVENT, WHEEL_RESULT_EVENT, pickWeighted, wheelAngles } from './wheel/state.js';
export { setWheelItems, setWheelState, getWheelResult, spinWheel } from './wheel/spin.js';

/**
 * @typedef {object} WheelItem
 * @property {string} id
 * @property {string} label
 * @property {number} [weight]  1 by default; larger is likelier and a larger segment
 * @property {string} [tag]  a short line about the choice, shown in the answer card and the segment's tooltip
 * @property {boolean} [resting]  stays on the wheel, marked, and is never drawn while another choice is not resting
 * @property {string} [short]  a shorter name for the wheel's face, used when the whole label does not fit a thin segment
 */

/**
 * Wire every wheel under `scope`: its parts and its Spin button.
 * @param {ParentNode} [scope]
 * @returns {() => void} detach
 */
export function attachWheels(scope = document) {
    return attachAll(scope, WHEEL, WheelControl);
}
