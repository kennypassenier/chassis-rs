// The alert of one problem (mode `each`): made or updated in place, with its icon, body, actions and the close button of a dismissible problem.

import { leave } from '../motion.js';
import { getStrings } from '../strings.js';
import { paintAction, paintParts } from './parts.js';
import { FLAVOUR, PROBLEM_DISMISS_EVENT, alertBody, alertIcon, severityOf } from './values.js';

/** @typedef {import('../problems.js').Problem} Problem */

/** The close button of a dismissible problem; a dismissal the page does not cancel lets the alert leave. @param {Problem} p @param {HTMLElement} el @param {HTMLElement} container */
function closeButton(p, el, container) {
    const button = el.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'kp-alert__close kp-icon-button';
    button.setAttribute('aria-label', getStrings().close);
    button.textContent = '×';
    button.addEventListener('click', () => {
        const go = container.dispatchEvent(new CustomEvent(PROBLEM_DISMISS_EVENT, { bubbles: true, cancelable: true, detail: { key: p.key } }));
        if (go) void leave(el).then(() => el.remove());
    });
    return button;
}

/**
 * Make the alert element for one problem (mode `each`), or update it.
 * @param {HTMLElement | undefined} existing @param {Problem} p @param {Document} doc @param {string} remedyLabel @param {HTMLElement} container
 */
export function paintAlert(existing, p, doc, remedyLabel, container) {
    const severity = severityOf(p);
    const fresh = !existing;
    const el = existing ?? doc.createElement('div');
    if (fresh) {
        el.setAttribute('data-kp-key', p.key);
        el.setAttribute('role', 'alert');
    } else if (el.getAttribute('role') !== 'status') el.setAttribute('role', 'status');
    el.className = `kp-alert kp-alert--${FLAVOUR[severity]} kp-problem`;
    el.setAttribute('data-kp-severity', severity);
    const icon = alertIcon(el, severity);
    paintParts(alertBody(el, icon), p, remedyLabel);
    paintAction(el, p);
    const close = el.querySelector(':scope > .kp-alert__close');
    if (p.dismissible && !close) el.append(closeButton(p, el, container));
    else if (!p.dismissible && close) close.remove();
    return el;
}
