// Builds the fixed parts of a refresh control: the chooser holder, the custom seconds form, the freshness line, the buttons, the run bar and the failure note.

import { getStrings } from '../strings.js';
import { ID_END, ID_RADIX, ID_START } from './constants.js';

/** An element with a class. @param {Document} doc @param {string} tag @param {string} className */
export function make(doc, tag, className) {
    const node = doc.createElement(tag);
    node.className = className;
    return node;
}

/** The form that takes any whole number of seconds ("Other…"). @param {Document} doc */
function buildCustom(doc) {
    const s = getStrings();
    const custom = /** @type {HTMLFormElement} */ (make(doc, 'form', 'kp-refresh__custom'));
    custom.hidden = true;
    custom.setAttribute('novalidate', '');
    const label = /** @type {HTMLLabelElement} */ (make(doc, 'label', 'kp-refresh__custom-label'));
    label.textContent = s.refreshCustomLabel;
    const input = /** @type {HTMLInputElement} */ (make(doc, 'input', 'kp-field__input kp-refresh__input'));
    input.type = 'number';
    input.min = '1';
    input.step = '1';
    input.inputMode = 'numeric';
    input.id = `kp-refresh-${Math.random().toString(ID_RADIX).slice(ID_START, ID_END)}`;
    label.htmlFor = input.id;
    const apply = /** @type {HTMLButtonElement} */ (make(doc, 'button', 'kp-button kp-refresh__apply'));
    apply.type = 'submit';
    apply.textContent = s.refreshApply;
    const problem = make(doc, 'span', 'kp-refresh__problem');
    problem.setAttribute('role', 'alert');
    custom.append(label, input, apply, problem);
    return { custom, input, problem };
}

/** The freshness line: "updated 12 s ago", and "updating…" in its place while the app reads. @param {Document} doc */
function buildLine(doc) {
    const line = make(doc, 'span', 'kp-refresh__line');
    const ago = make(doc, 'time', 'kp-ago kp-refresh__ago');
    ago.setAttribute('data-kp-ago', '');
    const busyWords = make(doc, 'span', 'kp-refresh__busy');
    busyWords.textContent = getStrings().refreshUpdating;
    busyWords.hidden = true;
    line.append(ago, busyWords);
    return { line, ago, busyWords };
}

/** The failure note with its Retry now. @param {Document} doc */
function buildFailure(doc) {
    const note = make(doc, 'p', 'kp-refresh__note');
    note.setAttribute('role', 'status');
    const retry = /** @type {HTMLButtonElement} */ (make(doc, 'button', 'kp-button kp-button--sm kp-refresh__retry'));
    retry.type = 'button';
    retry.textContent = getStrings().refreshRetryNow;
    retry.hidden = true;
    const failure = make(doc, 'div', 'kp-alert kp-alert--warning kp-refresh__failure');
    failure.hidden = true;
    failure.append(note, retry);
    return { note, retry, failure };
}

/**
 * Every fixed part of a control, built and not yet placed.
 * @param {Document} doc
 */
export function buildBar(doc) {
    const chooser = make(doc, 'div', 'kp-refresh__chooser');
    const { custom, input, problem } = buildCustom(doc);
    const { line, ago, busyWords } = buildLine(doc);
    const now = /** @type {HTMLButtonElement} */ (make(doc, 'button', 'kp-button kp-button--sm kp-refresh__now'));
    now.type = 'button';
    now.textContent = getStrings().refreshNow;
    now.setAttribute('aria-keyshortcuts', 'R');
    const count = make(doc, 'span', 'kp-refresh__count');
    count.setAttribute('aria-hidden', 'true');
    const { note, retry, failure } = buildFailure(doc);
    const bar = make(doc, 'div', 'kp-refresh__bar');
    bar.append(chooser, line, now);
    return { chooser, custom, input, problem, line, ago, busyWords, now, count, note, retry, failure, bar };
}
