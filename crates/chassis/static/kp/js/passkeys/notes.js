// Builds the parts of the list that are not rows: the empty or failed note, the waiting rows, the insecure warning and the live line.

import { getStrings } from '../strings.js';
import { make } from './dom.js';

/** A button of the note: Retry or Register. @param {Document} doc @param {string} look @param {string} text */
function noteButton(doc, look, text) {
    const button = make(doc, `kp-button ${look}kp-passkeys__note-button`, 'button');
    button.setAttribute('type', 'button');
    button.textContent = text;
    return button;
}

/**
 * The note that fills the list's footprint when it is empty or failed.
 * @param {Document} doc
 * @param {import('./constants.js').PasskeysSpec} spec
 * @param {boolean} failed
 * @param {number} height the loaded height to keep, 0 for none
 */
export function stateNote(doc, spec, failed, height) {
    const strings = getStrings();
    const note = make(doc, 'kp-empty kp-passkeys__note', 'div');
    if (height > 0) note.style.minBlockSize = `${height}px`;
    if (failed) note.setAttribute('data-kp-tone', 'error');
    note.setAttribute('role', failed ? 'alert' : 'status');
    const title = make(doc, 'kp-empty__title kp-passkeys__note-title', 'p');
    title.textContent = failed ? (spec.message ?? strings.passkeysError) : (spec.emptyTitle ?? strings.passkeysEmptyTitle);
    note.append(title);
    if (!failed) {
        const text = make(doc, 'kp-empty__body kp-passkeys__note-text', 'p');
        text.textContent = spec.emptyText ?? strings.passkeysEmptyText;
        note.append(text);
    }
    if (failed && spec.retry !== false) {
        const retry = noteButton(doc, '', strings.passkeysRetry);
        retry.setAttribute('data-kp-passkeys-retry', '');
        note.append(retry);
    } else if (!failed && spec.register !== false) {
        const register = noteButton(doc, 'kp-button--primary ', strings.passkeysRegister);
        register.setAttribute('data-kp-passkeys-register', '');
        note.append(register);
    }
    return note;
}

/** The waiting rows of a loading list, hidden from assistive technology (the busy card speaks). @param {Document} doc @param {number} count */
export function waitingList(doc, count) {
    const list = make(doc, 'kp-passkeys__list', 'ul');
    list.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < count; i += 1) {
        const row = make(doc, 'kp-passkeys__row kp-passkeys__row--wait', 'li');
        row.append(make(doc, 'kp-passkeys__way kp-skeleton kp-skeleton--block'));
        const what = make(doc, 'kp-passkeys__what');
        what.append(make(doc, 'kp-passkeys__wait-line kp-skeleton kp-skeleton--block'), make(doc, 'kp-passkeys__wait-line kp-passkeys__wait-line--short kp-skeleton kp-skeleton--block'));
        row.append(what, make(doc, 'kp-passkeys__flags'), make(doc, 'kp-passkeys__actions'));
        list.append(row);
    }
    return list;
}

/** The hidden line that says what just happened, then forgets it. @param {Document} doc @param {import('./controller.js').PasskeysController} c */
export function announcer(doc, c) {
    const live = make(doc, 'kp-sr-only kp-passkeys__live', 'p');
    live.setAttribute('role', 'status');
    live.textContent = c.announce;
    c.announce = '';
    return live;
}

/** The warning above the list when the page is not served over https. @param {Document} doc @param {import('./constants.js').PasskeysSpec} spec */
export function insecureNote(doc, spec) {
    if (!spec.insecure) return [];
    const strings = getStrings();
    const alert = make(doc, 'kp-alert kp-alert--warning kp-passkeys__insecure', 'div');
    alert.setAttribute('role', 'status');
    const body = make(doc, 'kp-alert__body');
    const label = make(doc, 'kp-alert__label');
    label.textContent = strings.passkeysInsecureTitle;
    const text = make(doc, 'kp-passkeys__insecure-text', 'span');
    text.textContent = strings.passkeysInsecureText;
    body.append(label, doc.createElement('br'), text);
    alert.append(body);
    return [alert];
}
