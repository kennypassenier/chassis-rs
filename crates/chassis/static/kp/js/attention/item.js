// One problem on the band: its element written from the item, touching only what changed.

import { getStrings } from '../strings.js';
import { FLAVOUR, GLYPH, SEVERITIES } from './values.js';

/** @typedef {import('../attention.js').AttentionItem} AttentionItem */

/**
 * The severity word a screen reader hears first.
 * @param {AttentionItem} item
 */
const severityWord = (item) => {
    if (item.srSeverity !== undefined) return item.srSeverity;
    const s = getStrings();
    return item.severity === 'critical' ? s.attentionCritical : item.severity === 'warning' ? s.attentionWarning : s.attentionInfo;
};

/** The severity's mark, flavour and role on the item. @param {HTMLElement} el @param {'critical' | 'warning' | 'info'} severity */
function paintSeverity(el, severity) {
    if (el.getAttribute('data-kp-severity') !== severity) el.setAttribute('data-kp-severity', severity);
    for (const flavour of Object.values(FLAVOUR)) el.classList.toggle(`kp-alert--${flavour}`, flavour === FLAVOUR[severity]);
    // Only a critical problem interrupts; the rest wait their turn.
    const role = severity === 'critical' ? 'alert' : 'status';
    if (el.getAttribute('role') !== role) el.setAttribute('role', role);
}

/** The round icon, made where it is missing. @param {HTMLElement} el @param {'critical' | 'warning' | 'info'} severity @returns {Element} */
function paintIcon(el, severity) {
    let icon = el.querySelector(':scope > .kp-attention__icon');
    if (!icon) {
        icon = el.ownerDocument.createElement('span');
        icon.className = 'kp-attention__icon';
        icon.setAttribute('aria-hidden', 'true');
        el.prepend(icon);
    }
    if (icon.textContent !== GLYPH[severity]) icon.textContent = GLYPH[severity];
    return icon;
}

/**
 * The title with the severity word in front, written only where it changed.
 * @param {Element} words @param {AttentionItem} item
 */
function paintTitle(words, item) {
    const doc = words.ownerDocument;
    let title = words.querySelector(':scope > strong');
    if (!title) {
        title = doc.createElement('strong');
        words.prepend(title);
    }
    let sr = title.querySelector(':scope > .kp-sr-only');
    if (!sr) {
        sr = doc.createElement('span');
        sr.className = 'kp-sr-only';
        title.prepend(sr);
    }
    const prefix = `${severityWord(item)}: `;
    if (sr.textContent !== prefix) sr.textContent = prefix;
    // The title's own words are the text after the prefix: replaced only
    // when they changed, so an unchanged title is the same text node.
    const titleText = [...title.childNodes].filter((n) => n !== sr);
    if (titleText.map((n) => n.textContent).join('') !== item.title) {
        for (const n of titleText) n.remove();
        title.append(item.title);
    }
}

/** The sentence under the title: made, changed or removed. @param {Element} words @param {string | undefined} text */
function paintLine(words, text) {
    let line = words.querySelector(':scope > span');
    if (text) {
        if (!line) {
            line = words.ownerDocument.createElement('span');
            words.append(line);
        }
        if (line.textContent !== text) line.textContent = text;
    } else line?.remove();
}

/** The fix: left alone (undefined), removed (null), or put in unless an equal node is shown. @param {HTMLElement} el @param {Node | null | undefined} action */
function paintAction(el, action) {
    let actions = el.querySelector(':scope > .kp-attention__actions');
    if (action === undefined) return;
    if (action === null) {
        actions?.remove();
        return;
    }
    if (!actions) {
        actions = el.ownerDocument.createElement('div');
        actions.className = 'kp-attention__actions';
        el.append(actions);
    }
    const shown = actions.childNodes.length === 1 ? actions.firstChild : null;
    if (shown === action || (shown && shown.isEqualNode(action))) return;
    actions.replaceChildren(action);
}

/**
 * Write `item` into `el`, touching only what changed.
 * @param {HTMLElement} el @param {AttentionItem} item
 */
export function paintItem(el, item) {
    const severity = SEVERITIES.includes(item.severity) ? item.severity : 'info';
    paintSeverity(el, severity);
    const icon = paintIcon(el, severity);
    let words = el.querySelector(':scope > .kp-attention__text');
    if (!words) {
        words = el.ownerDocument.createElement('div');
        words.className = 'kp-attention__text';
        icon.after(words);
    }
    paintTitle(words, item);
    paintLine(words, item.text);
    paintAction(el, item.action);
}
