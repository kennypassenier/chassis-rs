// A board's state on the instance, its frame, and the tab stop: the one card a person can reach with Tab.

import { Controller } from '../controller.js';
import { resolveStrings } from '../strings.js';
import { make } from './values.js';

/** @typedef {import('../pipeline.js').PipelineLane} PipelineLane */
/** @typedef {import('../pipeline.js').PipelineCard} PipelineCard */
/** @typedef {import('../pipeline.js').PipelineState} PipelineState */

export class PipelineCore extends Controller {
    /**
     * @param {HTMLElement} el
     * @param {{ strings?: Partial<import('../strings.js').Strings> }} [options]
     */
    constructor(el, options = {}) {
        super(el, options);
        this.strings = resolveStrings(options.strings);
        /** @type {PipelineLane[]} */
        this.lanes = [];
        /** @type {PipelineCard[]} */
        this.cards = [];
        /** @type {PipelineState} */
        this.state = 'ready';
        /** The words of the empty or failed plate. */
        this.words = '';
        /** The lanes that show all their cards. @type {Set<string>} */
        this.open = new Set();
        /** The id of the card that is open. @type {string | null} */
        this.selected = null;
        /** The card or "more" button that holds the tab stop. @type {string | null} */
        this.active = null;
        const doc = el.ownerDocument;
        this.board = make(doc, 'div', 'kp-pipeline__board');
        this.closed = make(doc, 'div', 'kp-pipeline__closed');
        this.plate = make(doc, 'div', 'kp-pipeline__plate');
        this.live = make(doc, 'p', 'kp-sr-only kp-pipeline__live');
        /** What the plate says now, so it is rebuilt only when that changes. */
        this.plateKey = '';
        /** The cards drawn, by id. @type {Map<string, HTMLElement>} */
        this.nodes = new Map();
        /** The loading card over the board. @type {import('../busy-card.js').BusyCard | null} */
        this.busy = null;
        /** The loading card on its way out. @type {Promise<void> | null} */
        this.leaving = null;
        /** Whether the first frame has passed: a loading card arrives with motion only after it. */
        this.drawn = false;
    }

    /** A board that was loading or empty is ready once data arrives. */
    settle() {
        if (this.state === 'loading' || this.state === 'empty') this.state = 'ready';
    }

    /** Whether the plate must be rebuilt for what it says now; remembers it. @param {string} key */
    plateChanged(key) {
        if (this.plateKey === key) return false;
        this.plateKey = key;
        return true;
    }

    /** Keep the loading card that was opened. @param {import('../busy-card.js').BusyCard} card */
    holdBusy(card) {
        this.busy = card;
    }

    /** Hand over the loading card and forget it. @returns {import('../busy-card.js').BusyCard | null} */
    takeBusy() {
        const card = this.busy;
        this.busy = null;
        return card;
    }

    /** The board's limit per lane; 0 shows every card. */
    limit() {
        return Math.max(0, Number.parseInt(this.host.dataset.kpPipelineLimit ?? '', 10) || 0);
    }

    /** Build the frame once. */
    build() {
        const doc = this.host.ownerDocument;
        this.board.setAttribute('role', 'list');
        this.closed.setAttribute('role', 'list');
        this.plate.hidden = true;
        this.live.setAttribute('role', 'status');
        const frame = make(doc, 'div', 'kp-pipeline__frame');
        // An empty or failed board is one state plate over the whole board, closed lane included [r1r2-1019].
        frame.append(this.board);
        this.host.replaceChildren(frame, this.closed, this.plate, this.live);
    }

    /** The cards a person can reach, per lane (the board's lanes, then the closed ones). @returns {HTMLElement[][]} */
    reachable() {
        return [...this.host.querySelectorAll('.kp-pipeline__lane')]
            .map((lane) => /** @type {HTMLElement[]} */ ([...lane.querySelectorAll('.kp-pipeline__card:not(.kp-pipeline__ghost), .kp-pipeline__more')]))
            .filter((l) => l.length);
    }

    /** One tab stop: the active card. */
    syncTabStops() {
        const all = this.reachable().flat();
        let target = all.find((n) => n.dataset.kpId === this.active || n.dataset.kpPipelineMore === this.active);
        target ??= all[0];
        for (const n of all) n.tabIndex = n === target ? 0 : -1;
    }
}
