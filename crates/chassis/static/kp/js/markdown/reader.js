// The block reader: a MarkdownReader walks the lines of one text and builds the DOM of paragraphs, headings, lists, quotes, code and rules.

import { getStrings } from '../strings.js';
import { DEFAULT_HEADING_LEVEL, LIST_ITEM, MARKDOWN_LIMIT, MAX_HEADING_LEVEL, TAB_WIDTH } from './values.js';
import { inline } from './inline.js';

/** @typedef {import('../markdown.js').MarkdownOptions} MarkdownOptions */
/** @typedef {{ list: HTMLElement, indent: number, last: HTMLElement | null }} ListLevel */

/** The block handlers, in the order a line is offered to them; the first that takes the line wins. */
const BLOCKS = /** @type {const} */ (['blank', 'fence', 'heading', 'rule', 'quote', 'list']);

/** One reading of one text. */
export class MarkdownReader {
    /**
     * @param {Document} doc
     * @param {string} text
     * @param {MarkdownOptions} [options]
     */
    constructor(doc, text, { headings = DEFAULT_HEADING_LEVEL, limit = MARKDOWN_LIMIT } = {}) {
        this.doc = doc;
        this.limit = limit;
        this.out = doc.createDocumentFragment();
        let source = String(text ?? '').replace(/\r\n?/g, '\n');
        /** Whether the text was cut at the limit. */
        this.cut = false;
        if (source.length > limit) {
            source = source.slice(0, limit);
            source = source.slice(0, source.lastIndexOf('\n') > 0 ? source.lastIndexOf('\n') : limit);
            this.cut = true;
        }
        /** The level a `#` heading is written at. */
        this.base = Math.min(MAX_HEADING_LEVEL, Math.max(1, Math.trunc(headings) || DEFAULT_HEADING_LEVEL));
        this.lines = source.split('\n');
        /** The line being read. */
        this.i = 0;
        /** The lines of the paragraph being gathered. @type {string[]} */
        this.paragraph = [];
    }

    /** @returns {DocumentFragment} */
    read() {
        while (this.i < this.lines.length) this.readLine(this.lines[this.i]);
        this.flush();
        if (this.cut) {
            const p = this.doc.createElement('p');
            p.className = 'kp-markdown__cut';
            p.textContent = getStrings().markdownCut;
            this.out.append(p);
        }
        return this.out;
    }

    /** Offer a line to each block in turn; what none takes belongs to the paragraph. @param {string} line */
    readLine(line) {
        for (const block of BLOCKS) if (this[block](line)) return;
        this.paragraph.push(line.trim());
        this.i += 1;
    }

    flush() {
        if (!this.paragraph.length) return;
        const p = this.doc.createElement('p');
        inline(this.doc, p, this.paragraph.join(' ').trim());
        this.out.append(p);
        this.paragraph = [];
    }

    /** @param {string} line */
    blank(line) {
        if (!/^\s*$/.test(line)) return false;
        this.flush();
        this.i += 1;
        return true;
    }

    /** @param {string} line */
    fence(line) {
        const fence = /^\s*(```|~~~)/.exec(line);
        if (!fence) return false;
        this.flush();
        const body = [];
        this.i += 1;
        while (this.i < this.lines.length && !this.lines[this.i].trimStart().startsWith(fence[1])) body.push(this.lines[this.i++]);
        this.i += 1;
        const pre = this.doc.createElement('pre');
        const code = this.doc.createElement('code');
        code.textContent = body.join('\n');
        pre.append(code);
        this.out.append(pre);
        return true;
    }

    /** @param {string} line */
    heading(line) {
        const head = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
        if (!head) return false;
        this.flush();
        const h = this.doc.createElement(`h${Math.min(MAX_HEADING_LEVEL, this.base + head[1].length - 1)}`);
        inline(this.doc, h, head[2]);
        this.out.append(h);
        this.i += 1;
        return true;
    }

    /** @param {string} line */
    rule(line) {
        if (!(/^\s*([-*_])(\s*\1){2,}\s*$/.test(line) && this.paragraph.length === 0)) return false;
        this.out.append(this.doc.createElement('hr'));
        this.i += 1;
        return true;
    }

    /** @param {string} line */
    quote(line) {
        if (!/^\s*>/.test(line)) return false;
        this.flush();
        const quoted = [];
        while (this.i < this.lines.length && /^\s*>/.test(this.lines[this.i])) quoted.push(this.lines[this.i++].replace(/^\s*>\s?/, ''));
        const quote = this.doc.createElement('blockquote');
        quote.append(new MarkdownReader(this.doc, quoted.join('\n'), { headings: this.base, limit: this.limit }).read());
        this.out.append(quote);
        return true;
    }

    /** @param {string} line */
    list(line) {
        if (!LIST_ITEM.test(line)) return false;
        this.flush();
        /** @type {ListLevel[]} */
        const stack = [];
        while (this.i < this.lines.length && (LIST_ITEM.test(this.lines[this.i]) || (/^\s+\S/.test(this.lines[this.i]) && stack.length))) {
            const m = LIST_ITEM.exec(this.lines[this.i]);
            if (!m) {
                // A continuation line joins the item above it.
                const last = stack[stack.length - 1].last;
                if (last) inline(this.doc, last, ` ${this.lines[this.i].trim()}`);
            } else this.listItem(stack, m);
            this.i += 1;
        }
        return true;
    }

    /** One item: the levels deeper than its indent are closed, a deeper indent opens a nested list. @param {ListLevel[]} stack @param {RegExpExecArray} m */
    listItem(stack, m) {
        const indent = m[1].replace(/\t/g, ' '.repeat(TAB_WIDTH)).length;
        const ordered = /\d/.test(m[2]);
        while (stack.length && indent < stack[stack.length - 1].indent) stack.pop();
        let top = stack[stack.length - 1];
        if (!top || indent > top.indent + 1) {
            const list = this.doc.createElement(ordered ? 'ol' : 'ul');
            if (top?.last) top.last.append(list);
            else this.out.append(list);
            top = { list, indent, last: null };
            stack.push(top);
        }
        const li = this.doc.createElement('li');
        inline(this.doc, li, m[3]);
        top.list.append(li);
        top.last = li;
    }
}

/**
 * Build the DOM of a markdown text. Nothing is parsed as HTML.
 * @param {Document} doc
 * @param {string} text
 * @param {MarkdownOptions} [options]
 * @returns {DocumentFragment}
 */
export function markdownFragment(doc, text, options) {
    return new MarkdownReader(doc, text, options).read();
}
