// One contents list's state and where it looks: the elements it builds, the entries, the current one, and the scope, offset, scroller and motion.

import { Controller } from '../controller.js';
import { DEFAULT_MIN_ENTRIES, DEFAULT_OFFSET_PX } from './values.js';

/** @typedef {import('../page-contents.js').ContentsItem} ContentsItem */
/** @typedef {{ item: ContentsItem, target: HTMLElement, link: HTMLAnchorElement, li: HTMLLIElement }} ContentsEntry */

let serial = 0;

export class ContentsCore extends Controller {
    /**
     * @param {HTMLElement} host the nav
     * @param {Record<string, unknown>} [options]
     */
    constructor(host, options) {
        super(host, options);
        this.doc = host.ownerDocument;
        this.view = /** @type {Window & typeof globalThis} */ (this.doc.defaultView);
        this.title = this.doc.createElement('p');
        this.list = this.doc.createElement('ol');
        this.wait = this.doc.createElement('div');
        /** The entries the page gave, or null to read the headings. @type {ContentsItem[] | null} */
        this.given = null;
        /** @type {ContentsEntry[]} */
        this.entries = [];
        /** @type {string | null} */
        this.current = null;
        /** The animation frame a spy is waiting for, 0 for none. */
        this.raf = 0;
        /** The pane with its own scroll that is listened to. @type {HTMLElement | null} */
        this.pane = null;
        /** The scroll handler, one function so it can be removed. */
        this.onScroll = () => this.queueSpy();
    }

    /** The nav's id, made when it has none. */
    ensureId() {
        const nav = this.host;
        return nav.id || (nav.id = `kp-contents-${(serial += 1)}`);
    }

    /** @param {ContentsEntry[]} entries @param {string | null} current */
    setEntries(entries, current) {
        this.entries = entries;
        this.current = current;
    }

    /** @param {ContentsItem[] | null} items */
    setGiven(items) {
        this.given = items;
    }

    /** @param {string | null} id */
    setCurrent(id) {
        this.current = id;
    }

    /** @param {number} frame */
    setFrame(frame) {
        this.raf = frame;
    }

    /** @param {HTMLElement | null} pane */
    setPane(pane) {
        this.pane = pane;
    }

    /** Ask for a spy on the next frame. The spy overrides it. */
    queueSpy() {}

    /**
     * The element a selector names, looked for from the list outwards: the nearest ancestor that holds a match wins, so a page that shows
     * the same markup twice (a copy in a dialog, a preview beside the page) is read from its own copy, not from the first one in the document.
     * @param {string | null} selector
     * @returns {Element | null}
     */
    lookup(selector) {
        if (!selector) return null;
        try {
            for (let up = this.host.parentElement; up; up = up.parentElement) {
                const hit = up.querySelector(selector);
                if (hit) return hit;
            }
            return this.doc.querySelector(selector);
        } catch {
            // A selector that is not valid names nothing.
            return null;
        }
    }

    /** Where the headings are. */
    scope() {
        const found = this.lookup(this.host.getAttribute('data-kp-contents-for'));
        return found ?? this.host.closest('body')?.querySelector('main') ?? this.doc.body;
    }

    /** Px from the top of the window where a section counts as reached. */
    offset() {
        const n = Number(this.host.getAttribute('data-kp-contents-offset'));
        return this.host.hasAttribute('data-kp-contents-offset') && Number.isFinite(n) ? n : DEFAULT_OFFSET_PX;
    }

    /** The fewest entries that earn a list. */
    least() {
        const n = Number(this.host.getAttribute('data-kp-contents-min'));
        return this.host.hasAttribute('data-kp-contents-min') && Number.isFinite(n) ? n : DEFAULT_MIN_ENTRIES;
    }

    /** The nearest ancestor of `el` that scrolls vertically (below the page itself), or null. @param {Element} el @returns {HTMLElement | null} */
    scrollParent(el) {
        const { doc, view } = this;
        for (let up = el.parentElement; up && up !== doc.body && up !== doc.documentElement; up = up.parentElement) {
            const overflow = view.getComputedStyle(up).overflowY;
            if ((overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') && up.scrollHeight > up.clientHeight + 1) return up;
        }
        return null;
    }

    /** The box that scrolls the sections when they live in a pane of their own: the one the page names, else the one the first section sits in. @returns {HTMLElement | null} */
    scroller() {
        const found = this.lookup(this.host.getAttribute('data-kp-contents-scroller'));
        if (found instanceof HTMLElement) return found;
        const first = this.entries[0]?.target;
        return first ? this.scrollParent(first) : null;
    }

    /** How a press scrolls: smoothly, unless the reader asked for less motion. */
    motion() {
        return this.view.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    }
}
