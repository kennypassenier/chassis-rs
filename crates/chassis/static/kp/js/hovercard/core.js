// One hover card's state and its helpers: the options, the one card node, what an anchor is, the words, the place, and the aria link.

import { layoutRect, placeBlockSide } from '../top-layer.js';
import { Controller } from '../controller.js';
import {
    CLOSE_DELAY_MS,
    EDGE,
    HOVERCARD_ATTRIBUTE,
    HOVERCARD_CARD,
    HOVERCARD_EVENT,
    ID_RADIX,
    ID_RANDOM_END,
    ID_RANDOM_START,
    OPEN_DELAY_MS,
} from './values.js';

/** @typedef {import('../hovercard.js').HoverCardOptions} HoverCardOptions */
/** @typedef {import('../hovercard.js').HoverCardContent} HoverCardContent */

/** The cards made so far, for their ids. */
let made = 0;

/** @param {HoverCardOptions} o */
const stripped = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export class HoverCardCore extends Controller {
    /**
     * @param {Document | Element} root the root the listeners sit on, which is this controller's host
     * @param {HoverCardOptions} [options]
     */
    constructor(root, options = {}) {
        super(/** @type {HTMLElement} */ (/** @type {unknown} */ (root)), options);
        this.root = root;
        /** @type {HoverCardOptions & { selector: string }} */
        this.cfg = {
            selector: `[${HOVERCARD_ATTRIBUTE}]`,
            openDelayMs: OPEN_DELAY_MS,
            closeDelayMs: CLOSE_DELAY_MS,
            closeOnEscape: true,
            touch: true,
            ...stripped(options),
        };
        this.doc = root instanceof Document ? root : root.ownerDocument;
        this.card = this.makeCard();
        /** The anchor the card is open for. @type {HTMLElement | null} */
        this.current = null;
        /** The anchor a pending open is for. @type {HTMLElement | null} */
        this.wanted = null;
        /** The anchor's own aria-describedby, put back on close. @type {string | null} */
        this.described = null;
        this.timer = 0;
        /** When the card last opened, so the tap that focus already answered is not taken twice. */
        this.openedAt = 0;
        this.going = false;
        this.overCard = false;
        /** @type {(() => void) | null} */
        this.lower = null;
        /** @type {MutationObserver | null} */
        this.watch = null;
    }

    /** The one card node, made but not yet on the page. */
    makeCard() {
        const card = this.doc.createElement('div');
        card.className = `kp-popover kp-tooltip${this.cfg.cardClass ? ` ${this.cfg.cardClass}` : ''}`;
        card.setAttribute('role', 'tooltip');
        card.setAttribute(HOVERCARD_CARD, '');
        card.id = `kp-hovercard-${(made += 1)}-${Math.random().toString(ID_RADIX).slice(ID_RANDOM_START, ID_RANDOM_END)}`;
        card.hidden = true;
        return card;
    }

    /** A second attach on the same root hands its options to this card. @param {HoverCardOptions} options */
    merge(options) {
        for (const [key, value] of Object.entries(options)) if (value !== undefined) /** @type {any} */ (this.cfg)[key] = value;
    }

    /** @param {Event | null} event @returns {HTMLElement | null} */
    anchorOf(event) {
        const target = event?.target;
        const found = target instanceof Element ? target.closest(this.cfg.selector) : null;
        return found instanceof HTMLElement && this.root.contains(found) ? found : null;
    }

    /** @param {HTMLElement} anchor @param {string} name @param {number} fallback */
    number(anchor, name, fallback) {
        const value = anchor.getAttribute(name);
        return value === null || Number.isNaN(Number(value)) ? fallback : Number(value);
    }

    /** @param {HTMLElement} anchor @returns {boolean} whether there is anything to say */
    fillFor(anchor) {
        const own = anchor.getAttribute(HOVERCARD_ATTRIBUTE) ?? '';
        /** @type {HoverCardContent} */
        const content = own !== '' ? own : (this.cfg.fill?.(anchor, this.card) ?? null);
        if (content === null || content === undefined || content === false || content === '') return false;
        if (typeof content === 'string') this.card.textContent = content;
        else this.card.replaceChildren(...(content instanceof Node ? [content] : content));
        return true;
    }

    /** Under the anchor, start edges aligned, kept in the window; above when there is no room below. @param {HTMLElement} el */
    place(el) {
        const anchor = this.current;
        if (anchor === null || !anchor.isConnected) return;
        const field = anchor.getBoundingClientRect();
        const rtl = getComputedStyle(anchor).direction === 'rtl';
        const view = this.doc.documentElement.clientWidth;
        el.style.setProperty('right', 'auto');
        el.style.setProperty('bottom', 'auto');
        el.style.setProperty('top', `${field.bottom}px`);
        // The width it takes depends on the room it has to the right of its left edge, so it is measured with the whole window
        // to itself, then placed: start edge under the anchor's, kept inside the window by the register's own margin (EDGE).
        el.style.setProperty('left', `${EDGE}px`);
        const width = layoutRect(el).width;
        const gap = Number.parseFloat(getComputedStyle(el).marginLeft) || 0;
        const startEdge = rtl ? field.right - width : field.left;
        const left = Math.max(EDGE - gap, Math.min(startEdge, view - EDGE - width - gap));
        el.style.setProperty('left', `${left}px`);
        placeBlockSide(el, field);
    }

    /** @param {HTMLElement} anchor */
    describe(anchor) {
        this.described = anchor.getAttribute('aria-describedby');
        const ids = (this.described ?? '').split(/\s+/).filter(Boolean);
        if (!ids.includes(this.card.id)) anchor.setAttribute('aria-describedby', [...ids, this.card.id].join(' '));
    }

    /** @param {HTMLElement} anchor */
    undescribe(anchor) {
        if (this.described === null) anchor.removeAttribute('aria-describedby');
        else anchor.setAttribute('aria-describedby', this.described);
        this.described = null;
    }

    /** @param {boolean} open @param {HTMLElement} anchor */
    announce(open, anchor) {
        anchor.dispatchEvent(new CustomEvent(HOVERCARD_EVENT, { bubbles: true, detail: { open, card: this.card, anchor } }));
    }

    /** @param {HTMLElement | null} anchor */
    setCurrent(anchor) {
        this.current = anchor;
    }

    /** @param {HTMLElement | null} anchor */
    setWanted(anchor) {
        this.wanted = anchor;
    }

    /** @param {boolean} going */
    setGoing(going) {
        this.going = going;
    }

    /** @param {boolean} over */
    setOverCard(over) {
        this.overCard = over;
    }

    /** Forget the pending ask. */
    unwant() {
        this.wanted = null;
    }

    /** Stop the pending timer. */
    stopTimer() {
        clearTimeout(this.timer);
    }

    /** Put a timer on a step. @param {() => void} step @param {number} delay */
    startTimer(step, delay) {
        this.timer = window.setTimeout(step, delay);
    }

    /** Put the card away without the going-out: the anchor is released, the card leaves the page. */
    release() {
        this.watch?.disconnect();
        if (this.current?.isConnected) this.undescribe(this.current);
        this.current = null;
        this.going = false;
    }
}
