// A small, safe markdown reader for release notes and changelogs [wish-1120, homelab 113].
//
// The text of a release note comes from somebody else's repository, so it is never put into the page as HTML: this module builds the
// DOM node by node from the text, and everything it does not know stays text. What it reads:
//
//   # Heading … ###### Heading      headings, written at a level of the page's choosing (`headings`, default 4: "#" becomes an h4)
//   a paragraph over lines          one `p`
//   - item  * item  + item  1. item  lists, nested by two or more spaces of indent
//   > quoted                        a blockquote
//   ```fenced code```               `pre > code`, the text as it stands
//   ---                             a rule
//   **bold**  *italic*  _italic_  `code`  [text](https://…)  <https://…>
//
// A link keeps its address only when it is `http`, `https` or `mailto`, or a relative or `#` address; `javascript:`, `data:` and the
// rest are left as the words they were written as. An external link opens in a new tab with `rel="noopener noreferrer"` and says so
// to a screen reader. An image is its alt text. Raw HTML is text. A note longer than `limit` characters is cut at a line and says so.
// Every word it adds is in js/strings.js. Nothing runs on import.

import { getStrings } from './strings.js';

/** The longest note drawn, in characters. */
export const MARKDOWN_LIMIT = 40_000;

/**
 * @typedef {object} MarkdownOptions
 * @property {number} [headings] the level a `#` heading is written at, 1 to 6 (default 4); deeper headings follow, to 6
 * @property {number} [limit] the most characters read (default 40 000); more is cut at a line with a sentence saying so
 */

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

/**
 * The inline parts of one line of text, appended to `parent`: code, bold, italic, links and autolinks; the rest is text.
 * @param {Document} doc @param {ParentNode} parent @param {string} text
 */
function inline(doc, parent, text) {
    let rest = text;
    const s = getStrings();
    /** @param {string} t */
    const plain = (t) => {
        if (t) parent.append(doc.createTextNode(t));
    };
    // The earliest of the inline forms wins; what is left of it is text.
    const forms = [
        { name: 'code', re: /`([^`]+)`/ },
        { name: 'image', re: /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/ },
        { name: 'link', re: /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/ },
        { name: 'auto', re: /<((?:https?:\/\/|mailto:)[^>\s]+)>/ },
        { name: 'bold', re: /\*\*([^*]+)\*\*|__([^_]+)__/ },
        { name: 'italic', re: /(?<![\w*])\*([^*\s][^*]*)\*(?!\w)|(?<![\w_])_([^_\s][^_]*)_(?!\w)/ },
    ];
    while (rest) {
        let best = null;
        for (const form of forms) {
            const m = form.re.exec(rest);
            if (m && (best === null || m.index < best.m.index)) best = { form, m };
        }
        if (!best) {
            plain(rest);
            return;
        }
        const { form, m } = best;
        plain(rest.slice(0, m.index));
        rest = rest.slice(m.index + m[0].length);
        if (form.name === 'code') {
            const code = doc.createElement('code');
            code.textContent = m[1];
            parent.append(code);
        } else if (form.name === 'image') {
            plain(m[1]);
        } else if (form.name === 'bold') {
            const strong = doc.createElement('strong');
            inline(doc, strong, m[1] ?? m[2]);
            parent.append(strong);
        } else if (form.name === 'italic') {
            const em = doc.createElement('em');
            inline(doc, em, m[1] ?? m[2]);
            parent.append(em);
        } else {
            const href = form.name === 'auto' ? m[1] : m[2];
            const label = form.name === 'auto' ? m[1] : m[1];
            if (!safeHref(href)) {
                plain(label);
                continue;
            }
            const a = doc.createElement('a');
            a.href = href;
            if (form.name === 'auto') a.textContent = label;
            else inline(doc, a, label);
            if (external(href)) {
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                const said = doc.createElement('span');
                said.className = 'kp-sr-only';
                said.textContent = ` (${s.markdownNewTab})`;
                a.append(said);
            }
            parent.append(a);
        }
    }
}

/**
 * Build the DOM of a markdown text. Nothing is parsed as HTML.
 * @param {Document} doc
 * @param {string} text
 * @param {MarkdownOptions} [options]
 * @returns {DocumentFragment}
 */
export function markdownFragment(doc, text, { headings = 4, limit = MARKDOWN_LIMIT } = {}) {
    const out = doc.createDocumentFragment();
    let source = String(text ?? '').replace(/\r\n?/g, '\n');
    let cut = false;
    if (source.length > limit) {
        source = source.slice(0, limit);
        source = source.slice(0, source.lastIndexOf('\n') > 0 ? source.lastIndexOf('\n') : limit);
        cut = true;
    }
    const base = Math.min(6, Math.max(1, Math.trunc(headings) || 4));
    const lines = source.split('\n');
    let i = 0;
    /** @type {string[]} */
    let paragraph = [];
    const flush = () => {
        if (!paragraph.length) return;
        const p = doc.createElement('p');
        inline(doc, p, paragraph.join(' ').trim());
        out.append(p);
        paragraph = [];
    };
    const item = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
    while (i < lines.length) {
        const line = lines[i];
        if (/^\s*$/.test(line)) {
            flush();
            i += 1;
            continue;
        }
        const fence = /^\s*(```|~~~)/.exec(line);
        if (fence) {
            flush();
            const body = [];
            i += 1;
            while (i < lines.length && !lines[i].trimStart().startsWith(fence[1])) body.push(lines[i++]);
            i += 1;
            const pre = doc.createElement('pre');
            const code = doc.createElement('code');
            code.textContent = body.join('\n');
            pre.append(code);
            out.append(pre);
            continue;
        }
        const head = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
        if (head) {
            flush();
            const h = doc.createElement(`h${Math.min(6, base + head[1].length - 1)}`);
            inline(doc, h, head[2]);
            out.append(h);
            i += 1;
            continue;
        }
        if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line) && paragraph.length === 0) {
            out.append(doc.createElement('hr'));
            i += 1;
            continue;
        }
        if (/^\s*>/.test(line)) {
            flush();
            const quoted = [];
            while (i < lines.length && /^\s*>/.test(lines[i])) quoted.push(lines[i++].replace(/^\s*>\s?/, ''));
            const quote = doc.createElement('blockquote');
            quote.append(markdownFragment(doc, quoted.join('\n'), { headings: base, limit }));
            out.append(quote);
            continue;
        }
        if (item.test(line)) {
            flush();
            /** @type {{ list: HTMLElement, indent: number, last: HTMLElement | null }[]} */
            const stack = [];
            while (i < lines.length && (item.test(lines[i]) || (/^\s+\S/.test(lines[i]) && stack.length))) {
                const m = item.exec(lines[i]);
                if (!m) {
                    // A continuation line joins the item above it.
                    const last = stack[stack.length - 1].last;
                    if (last) inline(doc, last, ` ${lines[i].trim()}`);
                    i += 1;
                    continue;
                }
                const indent = m[1].replace(/\t/g, '    ').length;
                const ordered = /\d/.test(m[2]);
                while (stack.length && indent < stack[stack.length - 1].indent) stack.pop();
                let top = stack[stack.length - 1];
                if (!top || indent > top.indent + 1) {
                    const list = doc.createElement(ordered ? 'ol' : 'ul');
                    if (top?.last) top.last.append(list);
                    else out.append(list);
                    top = { list, indent, last: null };
                    stack.push(top);
                }
                const li = doc.createElement('li');
                inline(doc, li, m[3]);
                top.list.append(li);
                top.last = li;
                i += 1;
            }
            continue;
        }
        paragraph.push(line.trim());
        i += 1;
    }
    flush();
    if (cut) {
        const p = doc.createElement('p');
        p.className = 'kp-markdown__cut';
        p.textContent = getStrings().markdownCut;
        out.append(p);
    }
    return out;
}
