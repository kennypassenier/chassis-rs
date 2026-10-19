// The plate an empty or failed area is drawn with [kpadopt5-ops].
//
// Kenny's rules of 2026-10-16 and 2026-10-17 (docs/RULES.md): failed, empty
// and loading states fill the component's full normal footprint with a
// normal-size action, and empty and failed are prominent, centred, set at the
// heading size in the theme's own empty plate or alert, never a small line in
// a corner. The operations components (the master-detail panes, the
// notification centre) each need that plate, so it is built once:
//
//   const plate = statePlate(document, { kind: 'error', title: 'Could not read it', text: 'The host did not answer.', actionLabel: 'Retry', onAction: reload });
//   area.append(plate);
//
// One mechanism for every area that can be empty or fail [state-plates-1019]: a data component puts its state into its own
// host with `hostStatePlate()` (the same plate, the Retry as an event on the host: `kp-<component>-retry`), and keeps the
// loaded footprint with js/footprint.js (empty and failed take the whole box, the busy card centred over it while loading).
// A component never draws its own small strip or sentence for these states any more. `art` is an optional picture
// (a node or a glyph) over the title.
//
// `kind: 'empty'` is the package's empty state (`.kp-empty`, dashed, muted);
// `kind: 'error'` is the destructive alert (`.kp-alert--destructive`). Both
// carry `.kp-stateplate`, which centres the words in the whole box it is
// given (give the plate the area's size: `block-size: 100%` in a grid cell)
// and sets the title at the heading size. The action is a normal-size
// `.kp-button`, never a strip. Nothing runs on import.

import { getStrings } from './strings.js';

/**
 * @typedef {object} StatePlateOptions
 * @property {'empty' | 'error'} kind
 * @property {string} title what is the case, in one line
 * @property {string} [text] one sentence more: why, or what fills it
 * @property {string} [actionLabel] the action's words (an error always has one when `onAction` is given)
 * @property {(event: MouseEvent) => void} [onAction] what the action does
 * @property {string} [actionAttribute] a data attribute written on the action (so a container can listen for it by delegation)
 * @property {Node | string | null} [art] a picture over the title: a node, or a glyph (aria-hidden either way)
 * @property {HTMLElement} [into] an element that already stands where the plate goes (a part a theme dresses by its own class):
 *   it becomes the plate, keeping its classes, instead of a new element being built [r6r8-1019]
 */

/**
 * Build an empty or failed plate.
 * @param {Document} doc
 * @param {StatePlateOptions} options
 * @returns {HTMLElement}
 */
export function statePlate(doc, { kind, title, text, actionLabel, onAction, actionAttribute, art, into }) {
    const plate = into ?? doc.createElement('div');
    const classes =
        kind === 'error' ? 'kp-alert kp-alert--destructive kp-stateplate kp-stateplate--error' : 'kp-empty kp-stateplate kp-stateplate--empty';
    if (into) {
        // The other kind's classes go, the part's own stay; what it held goes (a replaced plate is one plate, never two).
        into.classList.remove('kp-alert', 'kp-alert--destructive', 'kp-empty', 'kp-stateplate--error', 'kp-stateplate--empty');
        into.replaceChildren();
        into.classList.add(...classes.split(' '));
    } else plate.className = classes;
    plate.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    if (art) {
        const picture = doc.createElement('span');
        picture.className = 'kp-stateplate__art';
        picture.setAttribute('aria-hidden', 'true');
        if (typeof art === 'string') picture.textContent = art;
        else picture.append(art);
        plate.append(picture);
    }
    const head = doc.createElement('strong');
    head.className = 'kp-stateplate__title';
    head.textContent = title;
    plate.append(head);
    if (text) {
        const line = doc.createElement('span');
        line.className = 'kp-stateplate__text';
        line.textContent = text;
        plate.append(line);
    }
    if (actionLabel) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'kp-button kp-stateplate__action';
        button.textContent = actionLabel;
        if (actionAttribute) button.setAttribute(actionAttribute, '');
        if (onAction) button.addEventListener('click', onAction);
        plate.append(button);
    }
    return plate;
}

/**
 * @typedef {object} HostPlateOptions
 * @property {'empty' | 'error'} kind
 * @property {string} title what is the case, in one line
 * @property {string} [text] one sentence more; an error without one says the package's `stateFailedText`
 * @property {Node | string | null} [art] a picture over the title
 * @property {string} [retryEvent] the event an error's Retry fires on `host` (bubbling): `kp-<component>-retry`; without it no Retry
 * @property {string} [retryLabel] the Retry's words (default `stateRetry`)
 * @property {HTMLElement} [into] an element that becomes the plate (see StatePlateOptions)
 */

/**
 * The plate of a data component's host: an empty or failed area drawn the one way, with its Retry as an event on the host, so a
 * page listens to `kp-<component>-retry` as it does on every other component. The caller puts it where the data was
 * (`host.replaceChildren(plate)`, or into the state box it keeps) and lets js/footprint.js hold the loaded height.
 * @param {HTMLElement} host
 * @param {HostPlateOptions} options
 * @returns {HTMLElement}
 */
export function hostStatePlate(host, { kind, title, text, art, retryEvent, retryLabel, into }) {
    const s = getStrings();
    const failedText = text ?? (kind === 'error' ? s.stateFailedText : undefined);
    return statePlate(host.ownerDocument, {
        kind,
        title,
        ...(failedText ? { text: failedText } : {}),
        ...(art ? { art } : {}),
        ...(into ? { into } : {}),
        ...(kind === 'error' && retryEvent
            ? {
                  actionLabel: retryLabel ?? s.stateRetry,
                  onAction: () => host.dispatchEvent(new CustomEvent(retryEvent, { bubbles: true })),
              }
            : {}),
    });
}
