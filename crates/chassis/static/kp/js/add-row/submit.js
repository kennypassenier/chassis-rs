// What happens when an add row's line is valid: the page is asked to add it, the busy Add waits on the page's promise, and the
// row is emptied for the next line, or says why the page refused it [forms-1102].

import { getStrings } from '../strings.js';
import { DONE_EVENT } from '../forms/constants.js';
import { form as formHandle } from '../forms/api.js';
import { ADD_EVENT, ADDED_EVENT, ADD_ROW_NAME, REFUSAL } from './constants.js';

/**
 * What a line holds, by field name (several values of one name as a list).
 * @param {FormData} data
 * @returns {Record<string, string | string[]>}
 */
export function valuesOf(data) {
    /** @type {Record<string, string | string[]>} */
    const out = {};
    for (const [name, value] of data.entries()) {
        const text = typeof value === 'string' ? value : value.name;
        const had = out[name];
        out[name] = had === undefined ? text : Array.isArray(had) ? [...had, text] : [had, text];
    }
    return out;
}

/** The line under the row that says why, made when the markup left it out. @param {HTMLFormElement} row @returns {HTMLElement} */
export function refusalOf(row) {
    let line = /** @type {HTMLElement | null} */ (row.querySelector(REFUSAL));
    if (!line) {
        line = row.ownerDocument.createElement('p');
        line.className = 'kp-field__error kp-addrow__refusal';
        line.setAttribute('data-kp-addrow-refusal', '');
        line.hidden = true;
        row.append(line);
    }
    line.setAttribute('role', 'alert');
    return line;
}

/** Say why, or nothing. @param {HTMLFormElement} row @param {string} words */
export function sayRefusal(row, words) {
    const line = refusalOf(row);
    line.textContent = words;
    line.hidden = words === '';
}

/** The page's answer read as a refusal: words, field errors, or none (added). @param {unknown} answer @returns {string | Record<string, string> | null} */
function refusalIn(answer) {
    if (typeof answer === 'string' && answer !== '') return answer;
    if (answer === false) return getStrings().addRowRefused;
    if (answer && typeof answer === 'object' && 'errors' in answer) return /** @type {Record<string, string>} */ (/** @type {{ errors: unknown }} */ (answer).errors);
    return null;
}

/**
 * The words that name the line in "Added x": the field `data-kp-addrow-name` names when it holds something (the first value of
 * a list), else the first filled value, which may be an id or a date.
 * @param {HTMLFormElement} row @param {Record<string, string | string[]>} values
 */
function announcedName(row, values) {
    const filled = (/** @type {unknown} */ v) => typeof v === 'string' && v.trim() !== '';
    const named = values[row.getAttribute(ADD_ROW_NAME) ?? ''];
    const pick = Array.isArray(named) ? named.find(filled) : named;
    const first = filled(pick) ? pick : Object.values(values).find(filled);
    return typeof first === 'string' ? first : '';
}

/** The line went in: empty the row, the focus on its first field, and say so. @param {HTMLFormElement} row @param {Record<string, string | string[]>} values */
function added(row, values) {
    row.reset();
    formHandle(row)?.clear();
    sayRefusal(row, '');
    row.dispatchEvent(new CustomEvent(DONE_EVENT, { bubbles: true }));
    /** @type {HTMLElement | null} */ (row.querySelector('input:not([type="hidden"]), select, textarea'))?.focus();
    const live = row.querySelector('.kp-addrow__live');
    if (live) live.textContent = getStrings().addRowAdded(announcedName(row, values));
    row.dispatchEvent(new CustomEvent(ADDED_EVENT, { bubbles: true, detail: { values } }));
}

/** The page refused: words under the row, or messages on the fields; the row keeps what was typed. @param {HTMLFormElement} row @param {string | Record<string, string>} why */
function refused(row, why) {
    row.dispatchEvent(new CustomEvent(DONE_EVENT, { bubbles: true }));
    if (typeof why === 'string') sayRefusal(row, why);
    else formHandle(row)?.errors(why);
}

/**
 * A valid line: ask the page (`kp-addrow-add`, cancelable, with `waitUntil(promise)`), then empty the row or say why not.
 * A promise that resolves to words or `false`, or to `{ errors: { name: message } }`, refuses the line; one that rejects
 * refuses it with its message. No promise: the line is added at once.
 * @param {HTMLFormElement} row @param {FormData} data
 */
export async function addLine(row, data) {
    const values = valuesOf(data);
    /** @type {Promise<unknown> | null} */
    let wait = null;
    const go = row.dispatchEvent(
        new CustomEvent(ADD_EVENT, { bubbles: true, cancelable: true, detail: { values, data, waitUntil: (/** @type {Promise<unknown>} */ p) => (wait = p) } }),
    );
    if (!go) return refused(row, getStrings().addRowRefused);
    sayRefusal(row, '');
    try {
        const why = refusalIn(await (wait ?? Promise.resolve(null)));
        if (why === null) added(row, values);
        else refused(row, why);
    } catch (error) {
        refused(row, error instanceof Error && error.message ? error.message : getStrings().addRowRefused);
    }
}
