// A quantity with minus and plus [kpadopt4; the AuDHD recipe app's servings and shopping amounts].
//
// A number between a minus and a plus button, with its unit after it: "2
// portions" becoming "6 portions", "500 g" on a shopping list. The number is
// also a field to type in.
//
//   <div class="kp-quantity" data-kp-quantity data-kp-quantity-min="1" data-kp-quantity-max="12"
//        data-kp-quantity-unit="portions" data-kp-quantity-unit-one="portion" data-kp-quantity-label="Portions">
//       <input class="kp-quantity__input" value="2" />
//   </div>
//
// The module writes what the markup leaves out: the two buttons
// (`.kp-button.kp-quantity__step`, `data-kp-quantity-by="-1|1"`), the unit
// (`.kp-quantity__unit`) and the field box around the number and the unit
// (`.kp-quantity__field`). A page may write them itself.
//
// Attributes on the root:
//   data-kp-quantity-min / -max   the bounds (none: open)
//   data-kp-quantity-step         the step a press moves by (1); its decimals are the number's decimals
//   data-kp-quantity-unit         the unit after the number; -unit-one is its singular, used for exactly 1
//   data-kp-quantity-label        what the number is, for the buttons' and the field's names ("Portions")
//   data-kp-quantity-locale       the language of the decimal mark (else the nearest `lang`)
//   data-kp-quantity-disabled     the whole control, unreachable
//
// What it does:
//   - The field is a spin button (`role="spinbutton"`, `aria-valuenow`,
//     `aria-valuetext` "6 portions"): ArrowUp and ArrowDown step, PageUp and
//     PageDown step ten times, Home and End go to the bounds.
//   - Typing is read in the page's language, with a comma or a point as the
//     decimal mark; the value is taken on Enter or when the field is left,
//     kept inside the bounds and on a step. A text that is not a number is
//     marked invalid while it stands and put back when the field is left.
//   - A button held down repeats, slowly first and then faster; a press at a
//     bound does nothing and the button says so (`aria-disabled`, dimmed),
//     but it keeps the focus, so a keyboard is never thrown out.
//   - The field is as wide as the widest value it can hold, and the unit as
//     wide as its longest form, so nothing moves while the number changes.
//
// Events (bubbling, on the root):
//   kp-quantity-change   { value, previous, source: 'button' | 'key' | 'typed' }
//
// Every word it adds is in js/strings.js. Nothing runs on import.
//
// Each control is one QuantityControl (js/quantity/controller.js, on js/controller.js); the parts, and the pure number helpers, are listed in js/README.md.

import { attachAll } from './controller.js';
import { QUANTITY } from './quantity/values.js';
import { QuantityControl } from './quantity/controller.js';
import { rulesOf, settleQuantity } from './quantity/math.js';
import { paint } from './quantity/paint.js';

export { QUANTITY, QUANTITY_EVENT, HOLD_DELAY, HOLD_SLOW, HOLD_FAST } from './quantity/values.js';
export { decimalsOf, formatQuantity, parseQuantity, settleQuantity } from './quantity/math.js';
export { getQuantity } from './quantity/read.js';

/** @typedef {{ min: number, max: number, step: number, decimals: number, locale: string }} QuantityRules */

/**
 * Set the value without firing the event (a page that moves it because
 * something else moved), kept inside the bounds and on a step.
 * @param {Element} root @param {number} value
 */
export function setQuantity(root, value) {
    if (!(root instanceof HTMLElement)) return;
    paint(root, settleQuantity(value, rulesOf(root)));
}

/**
 * Wire every quantity under `root`: its parts, its buttons (a held button
 * repeats), its keys and its typing.
 * @param {ParentNode} [scope]
 * @returns {() => void} detach
 */
export function attachQuantities(scope = document) {
    return attachAll(scope, QUANTITY, QuantityControl);
}
