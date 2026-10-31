// The inline parts of one line: code, bold, italic, links and autolinks, appended to a parent; the rest is text.

import { getStrings } from '../strings.js';
import { INLINE_FORMS } from './values.js';

/**
 * Whether an address may be a link: http, https, mailto, or no scheme at all.
 * @param {string} href
 * @returns {boolean}
 */
export function safeHref(href) {
    const text = href.trim();
    if (text === '' || /[\u0000-\u001f\s]/.test(text)) return false;
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(text);
    return scheme === null || ['http', 'https', 'mailto'].includes(scheme[1].toLowerCase());
}

/** @param {string} href */
const external = (href) => /^https?:/i.test(href.trim());

/** @param {Document} doc @param {ParentNode} parent @param {string} t */
const plain = (doc, parent, t) => {
    if (t) parent.append(doc.createTextNode(t));
};

/**
 * The earliest of the inline forms in `rest`.
 * @param {string} rest
 * @returns {{ form: (typeof INLINE_FORMS)[number], m: RegExpExecArray } | null}
 */
function earliest(rest) {
    /** @type {{ form: (typeof INLINE_FORMS)[number], m: RegExpExecArray } | null} */
    let best = null;
    for (const form of INLINE_FORMS) {
        const m = form.re.exec(rest);
        if (m && (best === null || m.index < best.m.index)) best = { form, m };
    }
    return best;
}

/** A link or an autolink; an address that is not safe stays the words it was written as. @param {Document} doc @param {ParentNode} parent @param {string} name @param {RegExpExecArray} m */
function appendLink(doc, parent, name, m) {
    const href = name === 'auto' ? m[1] : m[2];
    const label = m[1];
    if (!safeHref(href)) {
        plain(doc, parent, label);
        return;
    }
    const a = doc.createElement('a');
    a.href = href;
    if (name === 'auto') a.textContent = label;
    else inline(doc, a, label);
    if (external(href)) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        const said = doc.createElement('span');
        said.className = 'kp-sr-only';
        said.textContent = ` (${getStrings().markdownNewTab})`;
        a.append(said);
    }
    parent.append(a);
}

/** @param {Document} doc @param {ParentNode} parent @param {string} name @param {RegExpExecArray} m */
function appendForm(doc, parent, name, m) {
    if (name === 'code') {
        const code = doc.createElement('code');
        code.textContent = m[1];
        parent.append(code);
    } else if (name === 'image') {
        plain(doc, parent, m[1]);
    } else if (name === 'bold' || name === 'italic') {
        const wrap = doc.createElement(name === 'bold' ? 'strong' : 'em');
        inline(doc, wrap, m[1] ?? m[2]);
        parent.append(wrap);
    } else appendLink(doc, parent, name, m);
}

/**
 * The inline parts of one line of text, appended to `parent`: code, bold, italic, links and autolinks; the rest is text.
 * @param {Document} doc @param {ParentNode} parent @param {string} text
 */
export function inline(doc, parent, text) {
    let rest = text;
    while (rest) {
        const best = earliest(rest);
        if (!best) {
            plain(doc, parent, rest);
            return;
        }
        const { form, m } = best;
        plain(doc, parent, rest.slice(0, m.index));
        rest = rest.slice(m.index + m[0].length);
        appendForm(doc, parent, form.name, m);
    }
}
