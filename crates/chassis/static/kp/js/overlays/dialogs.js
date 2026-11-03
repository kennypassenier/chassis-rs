// Dialogs: opening at the top, the close label and the attach.
import { Controller, attachOne } from '../controller.js';
import { getStrings } from '../strings.js';
import { attachDialogGuards, requestDialogClose } from './dialog-guard.js';
import { openDialog } from './dialog-open.js';
import { byId } from '../by-id.js';

export { openAtTop, openDialog } from './dialog-open.js';

/**
 * Wire `[data-kp-dialog="<id>"]` buttons to the dialog with that id.
 *
 * showModal() by default: the modal form is the one that traps focus and
 * makes the rest of the page inert. `data-kp-dialog-mode="non-modal"` on
 * the trigger opens with show() instead, for a palette-like panel that
 * must not inert the page. A drawer marked `data-kp-drawer-mode="beside"`
 * opens beside the list (openDialog(), js/overlays/dialog-open.js), and a
 * dialog marked `data-kp-dialog-guard` asks before a changed form closes
 * (js/overlays/dialog-guard.js, started here) [uxdialogs1101].
 *
 * @param {ParentNode} root
 * @param {{ modal?: boolean }} [options] the default mode when a trigger says nothing
 * @returns {() => void} detach
 */
export function attachDialogs(root = document, { modal = true } = {}) {
    // A trigger or a close button marked attached is wired already; a trigger whose id names no dialog has nothing to open.
    const triggers = /** @type {HTMLElement[]} */ ([...root.querySelectorAll('[data-kp-dialog]')])
        .filter((trigger) => !('kpDialogAttached' in trigger.dataset))
        .filter((trigger) => byId(document, trigger.dataset.kpDialog) instanceof HTMLDialogElement)
        .map((trigger) => attachOne(trigger, DialogTrigger, { modal }));
    const closers = /** @type {HTMLElement[]} */ ([...root.querySelectorAll('[data-kp-dialog-close]')])
        .filter((button) => !('kpDialogCloseAttached' in button.dataset))
        .map((button) => attachOne(button, DialogCloser));
    const stopGuards = attachDialogGuards();
    return () => {
        for (const control of [...triggers.splice(0), ...closers.splice(0)]) control?.destroy();
        stopGuards();
    };
}

/** One trigger: the dialog it opens and the mode the call gave when the trigger says nothing. */
class DialogTrigger extends Controller {
    /** @param {HTMLElement} host @param {{ modal?: boolean }} [options] */
    constructor(host, options = {}) {
        super(host, options);
        this.dialog = /** @type {HTMLDialogElement} */ (byId(document, host.dataset.kpDialog));
        this.modal = options.modal ?? true;
    }

    connect() {
        const trigger = this.host;
        trigger.dataset.kpDialogAttached = '';
        this.own(() => delete trigger.dataset.kpDialogAttached);
        this.listen(trigger, 'click', () => this.open());
    }

    open() {
        const { host: trigger, dialog } = this;
        const asModal = trigger.dataset.kpDialogMode === undefined ? this.modal : trigger.dataset.kpDialogMode !== 'non-modal';
        openDialog(dialog, { trigger, modal: asModal });
    }
}

/** One close button: closes the dialog it sits in. */
class DialogCloser extends Controller {
    connect() {
        const button = this.host;
        button.dataset.kpDialogCloseAttached = '';
        this.own(() => delete button.dataset.kpDialogCloseAttached);
        // The value, if any, becomes the dialog's returnValue — so a consumer's `close` listener can tell "save" from "cancel".
        // Without one (or with `cancel`) it is a way out, which a guarded dialog asks about first [uxdialogs1101].
        this.listen(button, 'click', () => {
            const dialog = button.closest('dialog');
            if (dialog) requestDialogClose(dialog, button.dataset.kpDialogClose || undefined, button);
        });
    }
}

/** The close label a consumer's markup can use: `data-kp-dialog-close` with the dictionary's word. */
export const closeLabel = () => getStrings().close;
