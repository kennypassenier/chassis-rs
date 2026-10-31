// A button whose words follow a quantity [mc-r2; Kenny's verdict on the add-stock dialog of the Medicine Cabinet, 2026-10-31].
//
// "When increasing/decreasing the amount with the controls, the text on the button should reflect that change." The accept button of a
// dialog or confirmation that holds a quantity says what will happen with the amount chosen, and follows the stepper live:
//
//   <div class="kp-field">
//       <div class="kp-quantity" id="stock-qty" data-kp-quantity data-kp-quantity-min="0" data-kp-quantity-unit="boxes" data-kp-quantity-unit-one="box">
//           <input class="kp-quantity__input" value="3" />
//       </div>
//   </div>
//   <button type="button" class="kp-button kp-button--primary" data-kp-accept-follows="stock-qty" data-kp-accept-verb="Add">Add</button>
//
// reads "Add 3 boxes", then "Add 1 box" after two presses of minus, and "Add boxes" at 0, where the button is off and a line under the
// quantity says why ("Choose how many boxes first."). The unit and its plural come from the quantity (`data-kp-quantity-unit-one`,
// `data-kp-quantity-unit`); a typed amount is followed while it is typed.
//
// Attributes on the button:
//   data-kp-accept-follows   the id of the quantity it follows (required)
//   data-kp-accept-verb      what the button does, "Add" (default: the dictionary's `acceptVerb`)
//   data-kp-accept-min       the least amount that makes sense (default: anything above zero)
//
// `openConfirmation(button, { acceptFollows: '<quantity id>', acceptVerb })` writes these two attributes on its Confirm button; the page then
// calls `attachAcceptFollows(dialog)` next to `attachQuantities(dialog)` for the dialog it built. Every word is in js/strings.js
// (`acceptFollowsLabel`, `acceptFollowsNone`, `acceptFollowsReason`, `acceptVerb`), so a Dutch page changes the order of the words there.
// Nothing runs on import.

import { Controller, attachAll } from './controller.js';
import { watchOptions } from './live-options.js';
import { formatQuantity, parseQuantity, rulesOf, settleQuantity } from './quantity/math.js';
import { getQuantity, inputOf, unitFor } from './quantity/read.js';
import { QUANTITY_EVENT } from './quantity/values.js';
import { acceptState } from './accept-follows-words.js';

/** The attribute that names the quantity a button follows. */
export const FOLLOWS = 'data-kp-accept-follows';
/** The verb of the button's words, else the dictionary's. */
export const VERB = 'data-kp-accept-verb';
/** The least amount that makes sense, else anything above zero. */
export const MINIMUM = 'data-kp-accept-min';

/** What the quantity writes that the words depend on. */
const WATCHED = ['data-kp-quantity-value', 'data-kp-quantity-unit', 'data-kp-quantity-unit-one', 'data-kp-quantity-min', 'data-kp-quantity-max'];

/** Ids for the reason line, unique per page. */
let reasonSeq = 0;

/** One button and the quantity it follows. */
export class AcceptFollows extends Controller {
    /**
     * @param {HTMLElement} host the button
     * @param {Record<string, unknown>} [options]
     */
    constructor(host, options) {
        super(host, options);
        /** @type {HTMLElement | null} */
        this.quantity = null;
        /** @type {HTMLElement | null} */
        this.reason = null;
    }

    connect() {
        const id = this.host.getAttribute(FOLLOWS) ?? '';
        const quantity = this.host.ownerDocument.getElementById(id);
        if (!quantity?.matches('[data-kp-quantity]')) throw new Error(`${FOLLOWS}="${id}": no quantity with that id is on the page`);
        this.quantity = quantity;
        this.keepHost();
        this.reason = this.makeReason(quantity);
        this.listen(quantity, QUANTITY_EVENT, () => this.draw());
        // The text while it is typed, before it is taken on Enter or when the field is left.
        this.listen(quantity, 'input', () => this.draw());
        this.own(watchOptions(quantity, WATCHED, () => this.draw()));
        this.own(watchOptions(this.host, [VERB, MINIMUM], () => this.draw()));
        this.draw();
    }

    /** Remember the button as the page wrote it, and put it back on detach. */
    keepHost() {
        const { host } = this;
        const was = { text: host.textContent, disabled: /** @type {HTMLButtonElement} */ (host).disabled, describedby: host.getAttribute('aria-describedby') };
        this.own(() => {
            host.textContent = was.text;
            /** @type {HTMLButtonElement} */ (host).disabled = was.disabled;
            if (was.describedby === null) host.removeAttribute('aria-describedby');
            else host.setAttribute('aria-describedby', was.describedby);
        });
    }

    /**
     * The line that says why the button is off: under the quantity, in its field when it has one, always one line high so showing it moves nothing.
     * @param {HTMLElement} quantity
     */
    makeReason(quantity) {
        const line = this.host.ownerDocument.createElement('p');
        line.className = 'kp-field__help kp-accept-reason';
        line.id = `kp-accept-reason-${++reasonSeq}`;
        line.setAttribute('role', 'status');
        (quantity.closest('.kp-field') ?? quantity.parentElement ?? quantity).append(line);
        const describedby = [this.host.getAttribute('aria-describedby'), line.id].filter(Boolean).join(' ');
        this.host.setAttribute('aria-describedby', describedby);
        this.own(() => line.remove());
        return line;
    }

    /** The amount the quantity shows right now: the text while it is typed in, else the value it stands at. @returns {number} */
    amount() {
        const root = /** @type {HTMLElement} */ (this.quantity);
        const input = inputOf(root);
        const typing = input !== null && input === root.ownerDocument.activeElement;
        return typing ? parseQuantity(input.value) : getQuantity(root);
    }

    /** Write the words and the state for the amount. */
    draw() {
        const root = /** @type {HTMLElement} */ (this.quantity);
        const rules = rulesOf(root);
        const raw = this.amount();
        const amount = Number.isFinite(raw) ? settleQuantity(raw, rules) : NaN;
        const minimum = this.host.getAttribute(MINIMUM);
        const state = acceptState({
            // A typed amount under the quantity's own minimum is judged as typed: "0" makes no sense even where the field would settle on 1.
            amount: Number.isFinite(raw) && raw <= 0 ? raw : amount,
            amountText: Number.isFinite(amount) ? formatQuantity(amount, rules) : '',
            unit: unitFor(root, amount),
            unitMany: unitFor(root, Number.NaN),
            verb: this.host.getAttribute(VERB) ?? undefined,
            minimum: minimum === null || minimum.trim() === '' || Number.isNaN(Number(minimum)) ? undefined : Number(minimum),
        });
        this.host.textContent = state.label;
        /** @type {HTMLButtonElement} */ (this.host).disabled = !state.valid;
        if (this.reason) this.reason.textContent = state.reason;
    }
}

export { acceptState, amountMakesSense } from './accept-follows-words.js';

/**
 * Wire every button under `scope` that follows a quantity.
 * @param {ParentNode} [scope]
 * @returns {() => void} detach
 */
export function attachAcceptFollows(scope = document) {
    return attachAll(scope, `[${FOLLOWS}]`, AcceptFollows);
}
