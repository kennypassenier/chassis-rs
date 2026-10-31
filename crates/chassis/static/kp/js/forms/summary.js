// The error summary of a form: one line per field (one per radio group), each a link that focuses its field.

import { getStrings } from '../strings.js';
import { nameOf } from './errors.js';

/**
 * One line per group, not per radio button: four radios in one
 * group are one thing somebody forgot to answer.
 * @param {HTMLElement[]} list
 */
export function dedupe(list) {
    /** @type {Set<string>} */
    const groups = new Set();
    return list.filter((field) => {
        if (field.getAttribute('type') !== 'radio') return true;
        const name = field.getAttribute('name') ?? '';
        if (groups.has(name)) return false;
        groups.add(name);
        return true;
    });
}

/** One line of the summary: a link to the field that focuses it. @param {HTMLElement} field */
function summaryLine(field) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = `#${field.getAttribute('id') ?? ''}`;
    link.textContent = nameOf(field);
    link.addEventListener('click', (click) => {
        click.preventDefault();
        field.focus();
    });
    item.append(link);
    return item;
}

/**
 * Write the summary of the invalid fields into its element.
 * @param {HTMLElement} summary
 * @param {HTMLElement[]} bad
 * @param {{ summaryHeading: string, summaryHeadingClass: string }} look
 */
export function writeSummary(summary, bad, { summaryHeading, summaryHeadingClass }) {
    summary.textContent = '';
    const heading = document.createElement(summaryHeading);
    heading.className = summaryHeadingClass;
    const s = getStrings();
    heading.textContent = bad.length === 1 ? s.formSummaryOne : s.formSummaryMany(bad.length);
    const list = document.createElement('ul');
    for (const field of bad) list.append(summaryLine(field));
    summary.append(heading, list);
    summary.hidden = false;
}
