// One dependency list's state and its settings: the rows given, the state shown, the elements it is drawn in, the handle a page gets.

import { Controller } from '../controller.js';
import { DEPLIST_COLLAPSE, DEPLIST_MIN_ROWS } from './values.js';

/** @typedef {import('../deplist.js').DepItem} DepItem */
/** @typedef {import('../deplist.js').DepRow} DepRow */
/** @typedef {import('../deplist.js').DeplistHandle} DeplistHandle */
/** @typedef {'ready' | 'loading' | 'empty' | 'error'} DeplistState */

/**
 * @typedef {object} DeplistSettings
 * @property {boolean} numbers rows are numbered in the order things must go
 * @property {boolean} self a thing lists itself
 * @property {boolean} reaches the rows read "reaches" instead of "needs"
 * @property {string} arrow the arrow's glyph
 * @property {boolean} withStates a state badge beside each needed thing
 * @property {number} collapse the rows shown before "Show all"
 * @property {string} group `none`, `by-to` or `by-from`
 */

/** @param {Document} doc @param {string} tag @param {string} className */
export const made = (doc, tag, className) => {
    const el = doc.createElement(tag);
    el.className = className;
    return el;
};

export class DeplistCore extends Controller {
    /**
     * @param {HTMLElement} host
     * @param {Record<string, unknown>} [options]
     */
    constructor(host, options) {
        super(host, options);
        this.doc = host.ownerDocument;
        /** The rows the page gave. @type {readonly DepItem[]} */
        this.items = [];
        /** @type {DeplistState} */
        this.state = 'ready';
        this.stateMessage = '';
        this.expanded = false;
        /** The rows as drawn. @type {DepRow[]} */
        this.drawn = [];
        /** @type {import('../busy-card.js').BusyCard | null} */
        this.busy = null;
        /** The empty or failed plate standing in for the rows. @type {HTMLElement | null} */
        this.plate = null;
        this.heading = made(this.doc, 'p', 'kp-deplist__heading');
        this.body = made(this.doc, 'div', 'kp-deplist__body');
        this.list = made(this.doc, 'ol', 'kp-deplist__list');
        this.foot = made(this.doc, 'div', 'kp-deplist__foot');
        /** The one handle a page gets back, the same object every time. */
        this.handle = this.makeHandle();
    }

    /** Take away the busy card and the plate the last draw stood in for the rows. */
    clearStandIns() {
        this.busy?.remove();
        this.busy = null;
        this.plate?.remove();
        this.plate = null;
    }

    /** @param {import('../busy-card.js').BusyCard} card */
    setBusy(card) {
        this.busy = card;
    }

    /** @param {HTMLElement} plate */
    setPlate(plate) {
        this.plate = plate;
    }

    /** Fold or unfold the rows past the limit. */
    toggleExpanded() {
        this.expanded = !this.expanded;
    }

    /** @param {string} name @param {string} fallback */
    attr(name, fallback) {
        return this.host.getAttribute(name) ?? fallback;
    }

    /** What the list's attributes ask for right now. @returns {DeplistSettings} */
    settings() {
        const numbers = this.attr('data-kp-dep-order', 'numbers') !== 'none';
        return {
            numbers,
            self: this.attr('data-kp-dep-self', 'hide') === 'show',
            reaches: this.attr('data-kp-dep-direction', 'from-needs-to') === 'from-reaches-to',
            arrow: this.attr('data-kp-dep-arrow', '→'),
            withStates: this.host.hasAttribute('data-kp-dep-states'),
            collapse: Math.max(1, Number(this.attr('data-kp-dep-collapse', String(DEPLIST_COLLAPSE))) || DEPLIST_COLLAPSE),
            group: numbers ? 'none' : this.attr('data-kp-dep-group', 'none'),
        };
    }

    /** The least rows the list stands as high as. */
    minRows() {
        return Math.max(1, Number(this.attr('data-kp-dep-rows', String(DEPLIST_MIN_ROWS))) || DEPLIST_MIN_ROWS);
    }

    /** @returns {DeplistHandle} */
    makeHandle() {
        return {
            element: this.host,
            set: (next) => {
                this.items = next;
                this.state = 'ready';
                delete this.body.dataset.kpKeep;
                this.draw();
            },
            setState: (next, options = {}) => {
                this.stateMessage = options.message ?? '';
                this.go(next);
            },
            rows: () => this.drawn,
        };
    }

    /** Draw the list. The controller overrides it. */
    draw() {}

    /**
     * Show a state. The height the list has with its rows is kept for the states that stand in for them.
     * @param {DeplistState} next
     */
    go(next) {
        const { list, body } = this;
        if (this.state === 'ready' && next !== 'ready' && list.offsetHeight > 0) body.dataset.kpKeep = String(list.offsetHeight);
        this.state = next;
        this.draw();
        if (this.state !== 'ready' && this.state !== 'loading' && body.dataset.kpKeep)
            body.style.setProperty('min-block-size', `${body.dataset.kpKeep}px`);
        if (this.state === 'loading' && body.dataset.kpKeep) body.style.setProperty('min-block-size', `${body.dataset.kpKeep}px`);
    }
}
