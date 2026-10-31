// Closing a dialog on an outside press and finding the control that opened it.
import { Controller } from '../controller.js';
import { OPENER } from './constants.js';

/**
 * Close a modal dialog on a press outside its box [scope-80].
 *
 * A modal `<dialog>` paints its backdrop as part of itself, so a press on
 * the dimmed page lands on the dialog element with coordinates outside its
 * border box. Both the press and the release have to fall outside: a drag
 * that selects the query and lets go past the box is not a click outside.
 * `dialog.close()` is what Escape does too, so focus goes back to the
 * opener the same way, and the `close` event runs every channel's own
 * bookkeeping. Returns the function that takes the listeners off.
 *
 * @param {HTMLDialogElement} dialog
 * @returns {() => void}
 */
export function closeOnOutsidePress(dialog) {
    // Its own controller per call, outside the registry: each release takes off what its own call put on, as before.
    const watch = new OutsidePress(dialog);
    watch.connect();
    return () => watch.destroy();
}

/** One dialog's outside-press watch: whether the press that is ending began outside its box. */
class OutsidePress extends Controller {
    /** @param {HTMLDialogElement} dialog */
    constructor(dialog) {
        super(dialog);
        this.dialog = dialog;
        this.pressedOutside = false;
    }

    connect() {
        const dialog = this.dialog;
        this.listen(dialog, 'pointerdown', (event) => {
            this.pressedOutside = dialog.open && this.outside(/** @type {PointerEvent} */ (event));
        });
        this.listen(dialog, 'click', (event) => {
            const both = this.pressedOutside && this.outside(/** @type {MouseEvent} */ (event));
            this.pressedOutside = false;
            if (both && dialog.open) dialog.close();
        });
    }

    /** Whether a press landed on the backdrop: on the dialog element, outside its border box. @param {MouseEvent} event */
    outside(event) {
        const dialog = this.dialog;
        if (event.target !== dialog) return false;
        const box = dialog.getBoundingClientRect();
        return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    }
}

/**
 * Whether a click landed on an opener meant for this dialog.
 *
 * @param {Event} event
 * @param {HTMLDialogElement} dialog
 * @param {boolean} answersKey  whether this dialog is the one an empty value means
 */
export function openerFor(event, dialog, answersKey) {
    const opener = event.target instanceof Element ? event.target.closest(OPENER) : null;
    if (opener === null) return false;
    const name = opener.getAttribute('data-kp-palette-open') ?? '';
    return name === '' ? answersKey : name === dialog.id;
}

/**
 * Whether `me` answers the key: the nominated one (`data-kp-primary`), else the first in the document.
 * @param {string} selector @param {Element} me
 */
export function answers(selector, me) {
    const nominated = document.querySelector(`${selector}[data-kp-primary]`);
    return (nominated ?? document.querySelector(selector)) === me;
}
