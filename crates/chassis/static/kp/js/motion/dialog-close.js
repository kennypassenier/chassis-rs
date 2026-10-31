// One dialog that leaves the way it came: its own `close()`, Escape and the backdrop all play its entrance backwards.
import { Controller, attachOne, controllerOf } from '../controller.js';
import { motionState } from './state.js';
import { rememberEntrance } from './keyframes.js';
import { closeDialog, openAsReversedClose } from './close.js';

/**
 * One dialog's leaving motion. `dialog.open` stays true while it plays, and
 * the `close` event comes at its end, as it does for any closed dialog. The
 * dialog's own `show`, `showModal` and `close` are shadowed on the element
 * while the controller lives, and handed back by `destroy()`.
 */
export class DialogClose extends Controller {
    connect() {
        const dialog = /** @type {HTMLDialogElement} */ (this.host);
        motionState.watching += 1;
        // Registered first, so it runs last: the dialog's own methods come back after the listener went.
        this.own(() => this.release());
        this.shadow(dialog);
        if (dialog.open) this.opened(dialog);
        // Escape: unless a listener before this one already decided (a page that
        // keeps the dialog open, or the React channel, which closes through its
        // own state and so through `close()` above).
        this.listen(dialog, 'cancel', (event) => {
            if (event.defaultPrevented) return;
            event.preventDefault();
            void closeDialog(dialog);
        });
    }

    /** Shadow the dialog's show, showModal and close with ones that play the motion. @param {HTMLDialogElement} dialog */
    shadow(dialog) {
        const own = /** @type {any} */ (dialog);
        const showModal = dialog.showModal;
        const show = dialog.show;
        own.showModal = () => {
            showModal.call(dialog);
            this.opened(dialog);
        };
        own.show = () => {
            show.call(dialog);
            this.opened(dialog);
        };
        own.close = (/** @type {string | undefined} */ value) => void closeDialog(dialog, value);
    }

    /** The dialog just opened: keep its entrance for the close, and play the opening as that close turned around. @param {HTMLDialogElement} dialog */
    opened(dialog) {
        rememberEntrance(dialog);
        openAsReversedClose(dialog);
    }

    /** Motion watches one dialog fewer, and the dialog's own methods are its own again. */
    release() {
        const own = /** @type {any} */ (this.host);
        motionState.watching -= 1;
        delete own.showModal;
        delete own.show;
        delete own.close;
    }
}

/**
 * Give one dialog its leaving motion.
 * @param {HTMLDialogElement} dialog
 * @returns {() => void} detach; a dialog already wired gets one that does nothing
 */
export function attachClose(dialog) {
    if (controllerOf(dialog, DialogClose)) return () => {};
    const control = attachOne(dialog, DialogClose);
    return () => control?.destroy();
}
