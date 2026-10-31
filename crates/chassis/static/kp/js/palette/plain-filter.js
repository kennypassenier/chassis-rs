// The plain matchers' filter: hide the commands that do not match, and the groups left empty; the status line counts them.
import { OPTION_SELECTOR } from '../listbox.js';
import { GROUP, RESULTS_TEXT } from './constants.js';
/** @typedef {import('./types.js').Matcher} Matcher */

/**
 * Show the commands `matcher` finds for `query`, on the label and not on the kbd hint; the markup's own indentation is not part of
 * the name, so a start of the name starts at its first letter. A group whose commands all vanished vanishes with them.
 * @param {HTMLElement} list @param {HTMLElement | null} status @param {Matcher} matcher @param {string} query
 * @returns {number} how many are shown
 */
export function filterPlain(list, status, matcher, query) {
    let visible = 0;
    for (const element of list.querySelectorAll(OPTION_SELECTOR)) {
        const option = /** @type {HTMLElement} */ (element);
        const text = [...option.childNodes]
            .filter((n) => !(n instanceof HTMLElement && n.tagName === 'KBD'))
            .map((n) => n.textContent ?? '')
            .join('');
        const shown = matcher(text.trim(), query);
        option.hidden = !shown;
        if (shown) visible += 1;
    }
    for (const element of list.querySelectorAll(GROUP)) {
        const group = /** @type {HTMLElement} */ (element);
        group.hidden = group.querySelector(`${OPTION_SELECTOR}:not([hidden])`) === null;
    }
    if (status !== null) status.textContent = RESULTS_TEXT(visible);
    return visible;
}
