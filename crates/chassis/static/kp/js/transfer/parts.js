// The parts a transfer row is made of, built when the row lacks them: name, bar, reading, rate, time left and the line a screen reader hears.

import { buildProgressbar } from '../progressbar.js';
import { getStrings } from '../strings.js';

/** @param {HTMLElement} row @param {string} className @param {string} [tag] */
function part(row, className, tag = 'span') {
    let node = /** @type {HTMLElement | null} */ (row.querySelector(`:scope > .${className}`));
    if (!node) {
        node = row.ownerDocument.createElement(tag);
        node.className = className;
        row.append(node);
    }
    return node;
}

/**
 * Build the parts a row lacks.
 * @param {HTMLElement} row
 */
export function build(row) {
    const label = part(row, 'kp-progress__label');
    if (!label.textContent) label.textContent = row.getAttribute('data-kp-transfer-name') ?? '';
    let bar = /** @type {HTMLElement | null} */ (row.querySelector(':scope > .kp-progressbar'));
    if (!bar) {
        bar = row.ownerDocument.createElement('div');
        bar.className = 'kp-progressbar';
        label.after(bar);
    }
    bar.setAttribute('aria-label', label.textContent || getStrings().transferBar);
    buildProgressbar(bar);
    const value = part(row, 'kp-progress__value');
    const rate = part(row, 'kp-progress__rate');
    const eta = part(row, 'kp-progress__eta');
    value.classList.add('kp-transfer__done');
    row.classList.add('kp-transfer');
    // Order in the grid: label, bar, reading, rate, eta.
    // Moving a node restarts its CSS animations, and build() runs on every report: only a node out of place is moved
    // (round 1 of kpadopt5-ops: the busy bar restarted from the beginning on every report).
    [label, bar, value, rate, eta].forEach((node, at) => {
        if (row.children[at] !== node) row.insertBefore(node, row.children[at] ?? null);
    });
    let status = /** @type {HTMLElement | null} */ (row.querySelector(':scope > .kp-transfer__voice'));
    if (!status) {
        status = row.ownerDocument.createElement('span');
        status.className = 'kp-sr-only kp-transfer__voice';
        status.setAttribute('role', 'status');
        row.append(status);
    }
    return { label, bar, value, rate, eta, status };
}
