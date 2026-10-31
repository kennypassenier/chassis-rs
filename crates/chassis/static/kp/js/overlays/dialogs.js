// Dialogs: opening at the top, the close label and the attach.
import { Controller, attachOne } from '../controller.js';
import { getStrings } from '../strings.js';
import { DIALOG_OPEN_EVENT } from './constants.js';

/**
 * Put a dialog that has just opened, and its `.kp-dialog__body`, back at
 * the top [scope-96]. A closed dialog keeps its scroll position, so a
 * long dialog scrolled and closed reopened where it was left (Kenny,
 * 2026-09-15: "Bovenaan openen"). Called after showModal()/show(), because
 * a closed dialog has no box to scroll. The one exception is focus: when
 * the element the dialog focused on opening lies below the fold, it is
 * scrolled back into view, as far as needed and no further, so focus is
 * never hidden.
 *
 * @param {HTMLDialogElement} dialog
 */
export function openAtTop(dialog) {
    const body = dialog.querySelector(':scope > .kp-dialog__body');
    for (const box of [dialog, body]) if (box) box.scrollTop = 0;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused !== dialog && dialog.contains(focused))
        focused.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/**
 * Wire `[data-kp-dialog="<id>"]` buttons to the dialog with that id.
 *
 * showModal() by default: the modal form is the one that traps focus and
 * makes the rest of the page inert. `data-kp-dialog-mode="non-modal"` on
 * the trigger opens with show() instead, for a palette-like panel that
 * must not inert the page.
 *
 * @param {ParentNode} root
 * @param {{ modal?: boolean }} [options] the default mode when a trigger says nothing
 * @returns {() => void} detach
 */
export function attachDialogs(root = document, { modal = true } = {}) {
    // A trigger or a close button marked attached is wired already; a trigger whose id names no dialog has nothing to open.
    const triggers = /** @type {HTMLElement[]} */ ([...root.querySelectorAll('[data-kp-dialog]')])
        .filter((trigger) => !('kpDialogAttached' in trigger.dataset))
        .filter((trigger) => document.getElementById(trigger.dataset.kpDialog ?? '') instanceof HTMLDialogElement)
        .map((trigger) => attachOne(trigger, DialogTrigger, { modal }));
    const closers = /** @type {HTMLElement[]} */ ([...root.querySelectorAll('[data-kp-dialog-close]')])
        .filter((button) => !('kpDialogCloseAttached' in button.dataset))
        .map((button) => attachOne(button, DialogCloser));
    return () => {
        for (const control of [...triggers.splice(0), ...closers.splice(0)]) control?.destroy();
    };
}

/** One trigger: the dialog it opens and the mode the call gave when the trigger says nothing. */
class DialogTrigger extends Controller {
    /** @param {HTMLElement} host @param {{ modal?: boolean }} [options] */
    constructor(host, options = {}) {
        super(host, options);
        this.dialog = /** @type {HTMLDialogElement} */ (document.getElementById(host.dataset.kpDialog ?? ''));
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
        if (dialog.open) return;
        if (asModal) dialog.showModal();
        else dialog.show();
        openAtTop(dialog);
        dialog.dispatchEvent(new CustomEvent(DIALOG_OPEN_EVENT, { bubbles: true, detail: { trigger, modal: asModal } }));
    }
}

/** One close button: closes the dialog it sits in. */
class DialogCloser extends Controller {
    connect() {
        const button = this.host;
        button.dataset.kpDialogCloseAttached = '';
        this.own(() => delete button.dataset.kpDialogCloseAttached);
        // The value, if any, becomes the dialog's returnValue — so a consumer's `close` listener can tell "save" from "cancel".
        this.listen(button, 'click', () => button.closest('dialog')?.close(button.dataset.kpDialogClose || undefined));
    }
}

/** The close label a consumer's markup can use: `data-kp-dialog-close` with the dictionary's word. */
export const closeLabel = () => getStrings().close;
