// A code field's state on the instance, its options read from the attributes, and what it measures and draws: line heights, the gutter, the growth and the caret readout.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { buildChrome } from './build.js';
import { CODE_FIELD_CARET_EVENT, CODE_FIELD_MAX_ROWS, caretPosition } from './values.js';

/** The fewest rows a field is, whatever its `rows` says, and the rows it has when it says none. */
const LEAST_ROWS = 2;
const DEFAULT_ROWS = 6;
/** The line height assumed when the browser reports none (`normal`), in px. */
const FALLBACK_LINE_PX = 20;
/** The spaces a Tab writes unless the page asks for four, or a tab. */
const INDENT_SPACES = 2;
const WIDE_INDENT_SPACES = 4;
/** Numbers the fields of a page that have no id. */
let serial = 0;

export class CodeFieldCore extends Controller {
    /** @param {HTMLElement} host a `textarea[data-kp-code-field]` */
    constructor(host) {
        super(host);
        const area = /** @type {HTMLTextAreaElement} */ (host);
        this.area = area;
        this.doc = area.ownerDocument;
        this.view = this.doc.defaultView;
        this.strings = getStrings();
        this.wrap = area.hasAttribute('data-kp-code-wrap') && area.getAttribute('data-kp-code-wrap') !== 'false';
        this.minRows = Math.max(LEAST_ROWS, Number(area.getAttribute('rows')) || DEFAULT_ROWS);
        this.id = area.id || `kp-codefield-${(serial += 1)}`;
        this.ui = buildChrome(this.doc, this.strings, this.id, this.wrap, this.gutterWanted());
        /** The last caret position announced, as "line:column". */
        this.lastCaret = '';
        /** The line of the error, 0 for none; the gutter marks it. */
        this.errorLine = 0;
    }

    language() {
        return (this.area.getAttribute('data-kp-code-field') ?? '').trim();
    }
    getWhen() {
        return this.area.getAttribute('data-kp-code-check') === 'blur' ? 'blur' : 'input';
    }
    getIndent() {
        const raw = this.area.getAttribute('data-kp-code-indent') ?? String(INDENT_SPACES);
        return raw === 'tab' ? '\t' : ' '.repeat(raw === String(WIDE_INDENT_SPACES) ? WIDE_INDENT_SPACES : INDENT_SPACES);
    }
    gutterWanted() {
        return this.area.getAttribute('data-kp-code-gutter') !== 'false';
    }
    blocks() {
        return this.area.getAttribute('data-kp-code-block') !== 'false';
    }

    /** Wrap long lines or let them scroll; the tool, the gutter and the height follow. @param {boolean} on */
    setWrap(on) {
        this.wrap = on;
    }

    lineHeight() {
        const n = Number.parseFloat(this.view?.getComputedStyle(this.area).lineHeight ?? '');
        return Number.isFinite(n) ? n : FALLBACK_LINE_PX;
    }

    /** The height of each line: one line height, or what the mirror measures when long lines wrap. @param {string[]} lines @returns {number[]} */
    lineHeights(lines) {
        const { area, doc } = this;
        const lh = this.lineHeight();
        if (!this.wrap) return lines.map(() => lh);
        const mirror = this.ui.mirror;
        const cs = this.view?.getComputedStyle(area);
        mirror.style.width = `${area.clientWidth}px`;
        mirror.style.font = cs?.font ?? '';
        mirror.style.letterSpacing = cs?.letterSpacing ?? '';
        mirror.style.tabSize = cs?.tabSize ?? '';
        mirror.style.paddingInline = cs?.paddingInline ?? '';
        mirror.replaceChildren(
            ...lines.map((line) => {
                const row = doc.createElement('div');
                row.textContent = line === '' ? ' ' : line;
                return row;
            }),
        );
        return [...mirror.children].map((row) => row.getBoundingClientRect().height || lh);
    }

    drawGutter() {
        if (!this.gutterWanted()) return;
        const { area, doc, ui } = this;
        const lines = area.value.split('\n');
        const heights = this.lineHeights(lines);
        ui.numbers.replaceChildren(
            ...lines.map((_, i) => {
                const n = doc.createElement('span');
                n.className = 'kp-jsonfield__number';
                if (i + 1 === this.errorLine) n.classList.add('is-error');
                n.style.blockSize = `${heights[i]}px`;
                n.textContent = String(i + 1);
                return n;
            }),
        );
        ui.root.style.setProperty('--kp-json-digits', String(String(lines.length).length));
        ui.numbers.style.transform = `translateY(${-area.scrollTop}px)`;
    }

    /** Grow the field with its text, from `rows` lines to the most it grows to. */
    grow() {
        const { area } = this;
        const cs = this.view?.getComputedStyle(area);
        if (!cs) return;
        const lh = this.lineHeight();
        const px = (/** @type {string} */ v) => Number.parseFloat(v) || 0;
        const chrome = px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth);
        const text = this.lineHeights(area.value.split('\n')).reduce((sum, h) => sum + h, 0);
        const bar = Math.max(0, area.offsetHeight - area.clientHeight - px(cs.borderTopWidth) - px(cs.borderBottomWidth));
        const content = text + chrome + bar;
        const least = this.minRows * lh + chrome;
        const most = Math.max(CODE_FIELD_MAX_ROWS, this.minRows) * lh + chrome;
        const height = Math.ceil(Math.min(most, Math.max(least, content)));
        area.style.blockSize = `${height}px`;
        area.style.overflowY = content > height + 1 ? 'auto' : 'hidden';
    }

    /** "Line 3, column 12 · YAML": where the caret is. */
    drawReadout() {
        const { area, ui } = this;
        const at = caretPosition(area.value, area.selectionStart ?? 0);
        const name = this.language();
        const text = this.strings.codeFieldPosition(at.line, at.column) + (name ? ` · ${name.toUpperCase()}` : '');
        if (ui.readout.textContent !== text) ui.readout.textContent = text;
        const key = `${at.line}:${at.column}`;
        if (key !== this.lastCaret) {
            this.lastCaret = key;
            area.dispatchEvent(new CustomEvent(CODE_FIELD_CARET_EVENT, { bubbles: true, detail: at }));
        }
    }
}
