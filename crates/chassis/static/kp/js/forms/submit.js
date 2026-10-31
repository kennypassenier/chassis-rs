// A submit button that says it is working: busy on `kp-form-valid`, back on `kp-form-done`, flash buttons keep their own faces [KT6, kyu 45].

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { DONE_EVENT, VALID_EVENT } from './constants.js';

/** The controller of one `[data-kp-submit]` button. */
export class SubmitController extends Controller {
    /**
     * @param {HTMLElement} host the button
     * @param {Record<string, unknown>} [options]
     */
    constructor(host, options = {}) {
        super(host, options);
        this.button = /** @type {HTMLButtonElement} */ (host);
        this.busyText = this.button.dataset.kpBusy ?? getStrings().busy;
        this.idleText = this.button.textContent ?? '';
        // A flash button owns its faces (rest, busy, result) in
        // `.kp-flash__stack`; replacing its children destroyed that stack
        // [kyu 45]. It is checked at submit time, since the flash may be
        // wired after this attach. The stack's own busy face is shown, and
        // the button's words are never touched.
        this.ownsFaces = false;
    }

    connect() {
        const button = this.button;
        button.dataset.kpSubmitAttached = '';
        const owner = button.closest('form');
        this.own(() => {
            this.onDone();
            delete button.dataset.kpSubmitAttached;
        });
        if (owner) {
            this.listen(owner, VALID_EVENT, () => this.onValid());
            this.listen(owner, DONE_EVENT, () => this.onDone());
        }
    }

    onValid() {
        const button = this.button;
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        this.ownsFaces = button.querySelector(':scope > .kp-flash__stack') !== null;
        if (this.ownsFaces) {
            button.setAttribute('data-kp-flash-state', 'busy');
            return;
        }
        // The busy words in their own `.kp-button__label`, the element
        // the React button already has, so a register can style the
        // words alone [scope-143].
        const label = button.ownerDocument.createElement('span');
        label.className = 'kp-button__label';
        label.textContent = this.busyText;
        button.replaceChildren(label);
    }

    /** The way back [KT6]. The first version restored the label only on detach, so a failed save left the button dead for the life of the page. */
    onDone() {
        const button = this.button;
        button.disabled = false;
        button.removeAttribute('aria-busy');
        if (this.ownsFaces) {
            this.ownsFaces = false;
            // A result the page showed meanwhile stays; only our busy face is taken back.
            if (button.getAttribute('data-kp-flash-state') === 'busy') button.setAttribute('data-kp-flash-state', 'rest');
            return;
        }
        button.textContent = this.idleText;
    }
}
