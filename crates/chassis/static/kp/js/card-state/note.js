// The empty or error note: the package's state plate (js/state-plate.js), written unless the page drew its own.

import { getStrings } from '../strings.js';
import { el } from './parts.js';

/** @typedef {import('../card-state.js').CardStateOptions} CardStateOptions */

/**
 * The plate's title, picture and sentence, in the order they lie.
 * @param {Document} doc
 * @param {'empty' | 'error'} state
 * @param {CardStateOptions} options
 * @returns {HTMLElement[]}
 */
function linesOf(doc, state, options) {
    const s = getStrings();
    // The note is the package's state plate (js/state-plate.js): its title at heading size, its sentence at body size, the optional
    // picture over them, Try again a normal button [state-plates-1019].
    const title = el(doc, 'kp-card__state-title kp-stateplate__title', 'strong');
    title.textContent = options.title ?? (state === 'error' ? s.cardFailed : s.cardEmpty);
    /** @type {HTMLElement[]} */
    const lines = [title];
    if (options.art) {
        const art = el(doc, 'kp-card__state-art kp-stateplate__art', 'span');
        art.setAttribute('aria-hidden', 'true');
        if (typeof options.art === 'string') art.textContent = options.art;
        else art.append(options.art);
        lines.unshift(art);
    }
    if (options.text) {
        const text = el(doc, 'kp-card__state-text kp-stateplate__text', 'span');
        text.textContent = options.text;
        lines.push(text);
    }
    return lines;
}

/** @param {Document} doc @param {HTMLElement[]} lines @param {CardStateOptions} options */
function emptyPlate(doc, lines, options) {
    const box = el(doc, 'kp-empty kp-card__empty kp-stateplate kp-stateplate--empty');
    box.append(...lines);
    if (options.action) {
        const actions = el(doc, 'kp-card__state-actions');
        actions.append(...(Array.isArray(options.action) ? options.action : [options.action]));
        box.append(actions);
    }
    return box;
}

/** @param {Document} doc @param {HTMLElement[]} lines @param {CardStateOptions} options */
function errorPlate(doc, lines, options) {
    const alert = el(doc, 'kp-alert kp-alert--destructive kp-card__failure kp-stateplate kp-stateplate--error');
    const body = el(doc, 'kp-alert__body');
    body.append(...lines);
    alert.append(body);
    if (options.retry !== false) {
        const button = el(doc, 'kp-button kp-card__retry kp-stateplate__action', 'button');
        /** @type {HTMLButtonElement} */ (button).type = 'button';
        button.setAttribute('data-kp-card-retry', '');
        button.textContent = getStrings().cardRetry;
        alert.append(button);
    }
    return alert;
}

/**
 * Write the empty or error note, unless the page drew its own.
 * @param {HTMLElement} note
 * @param {'empty' | 'error'} state
 * @param {CardStateOptions} options
 */
export function buildNote(note, state, options) {
    if (!note.hasAttribute('data-kp-card-built')) return;
    const doc = note.ownerDocument;
    const lines = linesOf(doc, state, options);
    if (state === 'empty') {
        note.setAttribute('role', 'status');
        note.replaceChildren(emptyPlate(doc, lines, options));
        return;
    }
    note.setAttribute('role', 'alert');
    note.replaceChildren(errorPlate(doc, lines, options));
}
