// An anchored container's options and its marks: which headings and rows get one, the id each gets, and the mark itself.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { ANCHORS, ANCHOR_COPIED_MS, ANCHOR_WAIT_MS, KEYED_ROWS, anchorSlug, attr, isHeading, nameOf, uniqueAnchorId } from './text.js';

/** @typedef {import('../anchors.js').AnchorOptions} AnchorOptions */

/** The heading levels that get anchors when the container names none, and the levels there are. */
const LEVELS = '2,3';
const LEVEL_MIN = 1;
const LEVEL_MAX = 6;
/** How long the voice waits before it speaks, so a second identical sentence is still heard [ms]. */
const SAY_DELAY_MS = 30;
/** What marks a row or a part that is still being drawn. */
const DRAWING = '.kp-skeleton, [aria-busy="true"], [data-kp-state="loading"]';

export class AnchorMarks extends Controller {
    /** @param {HTMLElement} box @param {AnchorOptions} [options] overrides the markup */
    constructor(box, options = {}) {
        super(box, options);
        /** @type {AnchorOptions} */
        this.opts = options;
        this.doc = box.ownerDocument;
        this.view = /** @type {Window} */ (this.doc.defaultView);
        this.strings = getStrings();
        /** The mark of every anchored heading and row. @type {Map<HTMLElement, HTMLButtonElement>} */
        this.marks = new Map();
        /** The live region the copy is said in, politely. */
        this.live = this.doc.createElement('span');
    }

    // The options, read when they are used: the markup, unless the page passed them to attachAnchors().
    levels() {
        return (this.opts.levels ?? attr(this.host, 'data-kp-anchor-levels', LEVELS).split(',').map(Number)).filter((n) => n >= LEVEL_MIN && n <= LEVEL_MAX);
    }
    showMode() {
        return this.opts.show ?? attr(this.host, 'data-kp-anchor-show', 'hover');
    }
    copyMode() {
        return this.opts.copy ?? attr(this.host, 'data-kp-anchor-copy', 'url');
    }
    highlights() {
        return (this.opts.target ?? attr(this.host, 'data-kp-anchor-target', 'highlight')) !== 'none';
    }
    opensFirst() {
        return (this.opts.open ?? attr(this.host, 'data-kp-anchor-open', 'on') !== 'off') !== false;
    }
    copiedMs() {
        return Number(attr(this.host, 'data-kp-flash-ms', '')) || this.opts.copiedMs || ANCHOR_COPIED_MS;
    }
    waitMs() {
        const said = this.opts.wait ?? (this.host.hasAttribute('data-kp-anchor-wait') ? Number(this.host.getAttribute('data-kp-anchor-wait')) : Number.NaN);
        return Number.isFinite(said) && said >= 0 ? said : ANCHOR_WAIT_MS;
    }
    /** Whether something is still being drawn in any container of the page: the hash may be a row of another one. */
    drawing() {
        return [...this.doc.querySelectorAll(ANCHORS)].some((c) => c.matches('[aria-busy="true"]') || c.querySelector('[aria-busy="true"], .kp-skeleton, [data-kp-state="loading"]') !== null);
    }

    /** One status region for the whole container: the copy is said politely. */
    mountVoice() {
        this.live.className = 'kp-sr-only kp-anchors__live';
        this.live.setAttribute('role', 'status');
        this.host.append(this.live);
    }
    /** @param {string} text */
    say(text) {
        this.live.textContent = '';
        this.view.setTimeout(() => {
            this.live.textContent = text;
        }, SAY_DELAY_MS);
    }

    /** The id of a heading or a row: its own word, else its id, else a slug of its text. @param {HTMLElement} el */
    idFor(el) {
        const said = el.getAttribute('data-kp-anchor');
        if (said) return said;
        if (el.id) return el.id;
        const key = el.getAttribute('data-kp-row-key');
        const base = isHeading(el) ? anchorSlug(nameOf(el)) : key ? `row-${anchorSlug(key)}` : '';
        return uniqueAnchorId(this.doc, base, isHeading(el) ? 'section' : 'row');
    }

    /** Give a heading or a row its mark, once. @param {HTMLElement} el @param {'heading' | 'row'} kind */
    mark(el, kind) {
        if (this.marks.has(el) || el.matches(DRAWING) || el.querySelector(':scope > .kp-skeleton') !== null) return;
        const id = this.idFor(el);
        if (!el.id) el.id = id;
        el.setAttribute('data-kp-anchored', kind);
        const button = this.makeMark(el, kind);
        const before = (el.getAttribute('data-kp-anchor-position') ?? this.host.getAttribute('data-kp-anchor-position') ?? (kind === 'row' ? 'before' : 'after')) === 'before';
        // A row's mark goes into its first cell; a heading's into the heading.
        const into = kind === 'row' && el.matches('tr, [role="row"]') ? (el.querySelector('th, td, [role="cell"], [role="gridcell"], [role="rowheader"]') ?? el) : el;
        if (before) into.prepend(button);
        else into.append(button);
        this.marks.set(el, button);
    }

    /**
     * The mark: a button whose faces carry their words as an attribute the stylesheet prints. The mark has no text of its own, so
     * a table's sort, a search and a copy of the cell never pick up "#Copied". A row's mark stands in a narrow first column: it
     * shows a tick, and the words are said politely.
     * @param {HTMLElement} el @param {'heading' | 'row'} kind
     */
    makeMark(el, kind) {
        const button = this.doc.createElement('button');
        button.type = 'button';
        button.className = 'kp-anchor';
        button.setAttribute('data-kp-anchor-mark', '');
        button.setAttribute('aria-label', this.strings.anchorCopyLink(nameOf(el)));
        const face = (/** @type {string} */ className, /** @type {string} */ text) => {
            const span = this.doc.createElement('span');
            span.className = className;
            span.setAttribute('aria-hidden', 'true');
            span.setAttribute('data-kp-text', text);
            return span;
        };
        button.append(face('kp-anchor__hash', '#'), face('kp-anchor__done', kind === 'row' ? '✓' : this.strings.anchorCopied));
        return button;
    }

    /** Mark what the mode asks for, and take the marks of rows that left. */
    scan() {
        const box = this.host;
        const want = this.opts.anchors ?? attr(box, 'data-kp-anchors', 'off');
        if (want === 'headings' || want === 'both') {
            const wanted = this.levels().map((n) => `h${n}`).join(',');
            if (wanted) for (const h of box.querySelectorAll(wanted)) if (h instanceof HTMLElement && !h.closest('[data-kp-anchors="off"]')) this.mark(h, 'heading');
        }
        // A row that says its own id is anchored in every mode that has rows; a keyed row only when rows are asked for.
        if (want === 'rows' || want === 'both') {
            for (const row of box.querySelectorAll(`[data-kp-anchor], ${KEYED_ROWS}`)) if (row instanceof HTMLElement && !isHeading(row)) this.mark(row, 'row');
        }
        for (const lone of box.querySelectorAll('[data-kp-anchor]')) if (lone instanceof HTMLElement && isHeading(lone)) this.mark(lone, 'heading');
        for (const [el, button] of this.marks) {
            if (!el.isConnected || !box.contains(el)) {
                button.remove();
                this.marks.delete(el);
            }
        }
    }

    /** Take every mark off. */
    unmark() {
        for (const [el, button] of this.marks) {
            button.remove();
            el.removeAttribute('data-kp-anchored');
        }
        this.marks.clear();
    }

    /** Draw the marks again, after an option changed (the position of the mark, the levels). */
    rebuild() {
        this.unmark();
        this.scan();
    }
}
