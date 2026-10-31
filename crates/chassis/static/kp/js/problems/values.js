// The problem alert's selector, severities, modes and event, how a severity looks, and the small helpers its parts share: ranking, text and a part found or made.

/** A container of problems. */
export const PROBLEMS = '[data-kp-problems]';
/** The severities, worst first. */
export const PROBLEM_SEVERITIES = /** @type {const} */ (['critical', 'warning', 'info']);
/** The layouts of several problems. */
export const PROBLEM_MODES = /** @type {const} */ (['each', 'list', 'fold']);
/** Fired on the container, bubbling and cancelable, when a dismissible problem is dismissed: `{ key }`. */
export const PROBLEM_DISMISS_EVENT = 'kp-problem-dismiss';

/** The alert flavour each severity wears. */
export const FLAVOUR = { critical: 'destructive', warning: 'warning', info: 'info' };
/** The glyph in each severity's icon. */
export const GLYPH = { critical: '!', warning: '!', info: 'i' };

/** The count from which `fold` folds the problems unless the page says, and the least it may be. */
export const DEFAULT_FOLD_FROM = 5;
export const LEAST_FOLD_FROM = 2;
/** The rows `fold` keeps open when its attribute is unreadable. */
export const DEFAULT_OPEN_ROWS = 4;

/** @typedef {import('../problems.js').Problem} Problem */

/** @param {Problem} p */
export const severityOf = (p) =>
    PROBLEM_SEVERITIES.includes(/** @type {any} */ (p.severity)) ? /** @type {'critical' | 'warning' | 'info'} */ (p.severity) : 'warning';

/** The problems without a repeated key, worst first, in the given order within a severity. @param {Problem[]} items */
export function ranked(items) {
    const seen = new Set();
    return items
        .filter((p) => (seen.has(p.key) ? false : (seen.add(p.key), true)))
        .map((p, at) => ({ p, at }))
        .sort((a, b) => PROBLEM_SEVERITIES.indexOf(severityOf(a.p)) - PROBLEM_SEVERITIES.indexOf(severityOf(b.p)) || a.at - b.at)
        .map((x) => x.p);
}

/** The child of `parent` that matches, or a new one that does not yet sit in it. @param {Element} parent @param {string} selector @param {string} tag @param {string} className */
export function part(parent, selector, tag, className) {
    let el = parent.querySelector(`:scope > ${selector}`);
    if (!el) {
        el = parent.ownerDocument.createElement(tag);
        el.className = className;
    }
    return /** @type {HTMLElement} */ (el);
}

/** Set text only when it changed. @param {Node} el @param {string} text */
export const setText = (el, text) => {
    if (el.textContent !== text) el.textContent = text;
};

/**
 * The alert's severity icon, made when missing and drawn with the severity's glyph.
 * @param {HTMLElement} alert @param {'critical' | 'warning' | 'info'} severity
 * @returns {Element} the icon
 */
export function alertIcon(alert, severity) {
    let icon = alert.querySelector(':scope > .kp-alert__icon');
    if (!icon) {
        icon = alert.ownerDocument.createElement('span');
        icon.className = 'kp-alert__icon';
        icon.setAttribute('aria-hidden', 'true');
        alert.prepend(icon);
    }
    setText(icon, GLYPH[severity]);
    return icon;
}

/** The alert's body, made after the icon when missing. @param {Element} alert @param {Element} icon @returns {HTMLElement} */
export function alertBody(alert, icon) {
    let body = /** @type {HTMLElement | null} */ (alert.querySelector(':scope > .kp-alert__body'));
    if (!body) {
        body = alert.ownerDocument.createElement('div');
        body.className = 'kp-alert__body';
        icon.after(body);
    }
    return body;
}
