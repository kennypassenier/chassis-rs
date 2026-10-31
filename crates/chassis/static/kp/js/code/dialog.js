// Opens the whole payload of a folded cell in a modal dialog, as a full block of its own.

import { attachOne } from '../controller.js';
import { getStrings } from '../strings.js';
import { make } from './dom.js';

/** @typedef {import('./controller.js').CodeBlock} CodeBlock */

/** @param {CodeBlock} ctl */
export function openInDialog(ctl) {
    const doc = ctl.host.ownerDocument;
    const strings = getStrings();
    const dialog = /** @type {HTMLDialogElement} */ (make(doc, 'kp-dialog kp-code__dialog', 'dialog'));
    dialog.setAttribute('aria-label', ctl.spec.title ?? ctl.spec.language ?? strings.codeLabel);
    const close = make(doc, 'kp-icon-button kp-dialog__close', 'button');
    close.setAttribute('type', 'button');
    close.setAttribute('aria-label', strings.close);
    close.textContent = '×';
    close.addEventListener('click', () => dialog.close());
    const body = make(doc, 'kp-dialog__body', 'div');
    const full = make(doc, 'kp-code', 'figure');
    body.append(full);
    dialog.append(close, body);
    dialog.addEventListener('close', () => dialog.remove());
    doc.body.append(dialog);
    // The dialog's block is a code block like this one: the same class, made on the new figure.
    /** @type {CodeBlock | undefined} */ (attachOne(full, /** @type {typeof import('./controller.js').CodeBlock} */ (ctl.constructor)))?.update({
        ...ctl.spec,
        cell: false,
        maxLines: 0,
        lines: true,
        wrap: true,
        open: undefined,
    });
    dialog.showModal();
    ctl.host.dispatchEvent(new CustomEvent('kp-code-open', { bubbles: true, detail: { dialog } }));
}
