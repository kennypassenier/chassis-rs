// One problem's parts written into an alert body or a list item, touching only what changed: what is wrong, why, the remedy with its command, and the fix beside them.

import { getStrings } from '../strings.js';
import { part, setText, severityOf } from './values.js';

/** @typedef {import('../problems.js').Problem} Problem */

/** What is wrong, with the severity's word for a screen reader first. @param {HTMLElement} host @param {Problem} p @returns {HTMLElement} */
function paintWhat(host, p) {
    const s = getStrings();
    const severity = severityOf(p);
    const what = part(host, '.kp-alert__what', 'p', 'kp-alert__what');
    let word = what.querySelector(':scope > .kp-sr-only');
    if (!word) {
        word = host.ownerDocument.createElement('span');
        word.className = 'kp-sr-only';
        what.prepend(word);
    }
    const sr = `${severity === 'critical' ? s.attentionCritical : severity === 'warning' ? s.attentionWarning : s.attentionInfo}: `;
    setText(word, sr);
    const words = [...what.childNodes].filter((n) => n !== word);
    if (words.map((n) => n.textContent).join('') !== p.what) {
        for (const n of words) n.remove();
        what.append(p.what);
    }
    if (what.parentElement !== host) host.prepend(what);
    return what;
}

/** Why it is, after the what; nothing when the problem gives no reason. @param {HTMLElement} host @param {Problem} p @param {HTMLElement} what @returns {HTMLElement} the part the remedy goes after */
function paintWhy(host, p, what) {
    const el = host.querySelector(':scope > .kp-alert__why');
    if (!p.why) {
        el?.remove();
        return what;
    }
    const node = el ?? part(host, '.kp-alert__why', 'p', 'kp-alert__why');
    setText(node, p.why);
    if (!el) what.after(node);
    return /** @type {HTMLElement} */ (node);
}

/** The command that fixes it, set in code with a Copy button. @param {Document} doc @param {string} command */
function commandLine(doc, command) {
    const line = doc.createElement('span');
    line.className = 'kp-alert__command';
    const code = doc.createElement('code');
    code.className = 'kp-alert__code';
    code.textContent = command;
    const copy = doc.createElement('button');
    copy.type = 'button';
    copy.className = 'kp-button kp-button--secondary kp-button--sm';
    copy.setAttribute('data-kp-copy', '');
    copy.setAttribute('data-kp-copy-value', command);
    copy.textContent = getStrings().problemCopy;
    line.append(code, copy);
    return line;
}

/** What to do now, with its command; rebuilt only when its words change. @param {HTMLElement} host @param {Problem} p @param {string} remedyLabel @param {HTMLElement} anchor */
function paintRemedy(host, p, remedyLabel, anchor) {
    const remedyEl = host.querySelector(':scope > .kp-alert__remedy');
    if (!p.remedy && !p.command) {
        remedyEl?.remove();
        return;
    }
    const node = remedyEl ?? part(host, '.kp-alert__remedy', 'p', 'kp-alert__remedy');
    const sig = `${remedyLabel}|${p.remedy ?? ''}|${p.command ?? ''}`;
    if (node.getAttribute('data-kp-sig') !== sig) {
        node.setAttribute('data-kp-sig', sig);
        node.replaceChildren();
        const label = host.ownerDocument.createElement('strong');
        label.className = 'kp-alert__remedy-label';
        label.textContent = remedyLabel;
        node.append(label, ' ');
        if (p.remedy) node.append(p.remedy);
        if (p.command) {
            const line = commandLine(host.ownerDocument, p.command);
            node.append(line);
            void import('../patterns.js').then((m) => m.attachPatterns(line));
        }
    }
    if (!remedyEl) anchor.after(node);
}

/**
 * Write one problem's three parts into `host`, touching only what changed.
 * @param {HTMLElement} host an alert body or a list item
 * @param {Problem} p
 * @param {string} remedyLabel
 */
export function paintParts(host, p, remedyLabel) {
    const what = paintWhat(host, p);
    const anchor = paintWhy(host, p, what);
    paintRemedy(host, p, remedyLabel, anchor);
}

/**
 * Put `p.action` into the actions box of `host`.
 * @param {HTMLElement} host @param {Problem} p
 */
export function paintAction(host, p) {
    let actions = host.querySelector(':scope > .kp-alert__actions');
    if (p.action === undefined) return;
    if (p.action === null) {
        actions?.remove();
        return;
    }
    if (!actions) {
        actions = host.ownerDocument.createElement('div');
        actions.className = 'kp-alert__actions';
        host.append(actions);
    }
    const shown = actions.childNodes.length === 1 ? actions.firstChild : null;
    if (shown === p.action || (shown && shown.isEqualNode(p.action))) return;
    actions.replaceChildren(p.action);
}
