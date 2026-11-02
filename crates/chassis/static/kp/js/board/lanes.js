// The lanes of a board: each dressed as the pipeline's lane (so every theme paints it as its own), its head with the name and the
// exact count (and the limit), its list wired into the board's group, and the line an empty lane shows where a card can go.

import { Controller } from '../controller.js';
import { resolveStrings } from '../strings.js';
import { LANE, itemsOf, limitOf, make } from './values.js';

/** Boards made without an id or a group name are numbered, so two boards never share their cards. */
let boardSeq = 0;

export class BoardLanes extends Controller {
    /** @param {HTMLElement} el @param {{ strings?: Partial<import('../strings.js').Strings> }} [options] */
    constructor(el, options = {}) {
        super(el, options);
        this.strings = resolveStrings(options.strings);
        boardSeq += 1;
        /** The group the lanes' lists share (`data-kp-reorder-group`). */
        this.group = el.dataset.kpBoardGroup || (el.id ? `kp-board-${el.id}` : `kp-board-${boardSeq}`);
        const doc = el.ownerDocument;
        /** The row that holds the lanes; it scrolls sideways on a narrow board. */
        this.track = make(doc, 'div', 'kp-board__track');
        /** What is said: a count past its limit, a state. */
        this.live = make(doc, 'p', 'kp-sr-only kp-board__live');
        /** The lanes the board found, in order. @type {HTMLElement[]} */
        this.lanes = [];
        /** Which lanes were over their limit at the last count, so going over is said once. @type {Set<string>} */
        this.over = new Set();
    }

    /** The key of a lane. @param {HTMLElement} lane */
    static keyOf(lane) {
        return lane.dataset.kpBoardLane ?? '';
    }

    /** The list of a lane. @param {HTMLElement} lane @returns {HTMLElement | null} */
    static listOf(lane) {
        return /** @type {HTMLElement | null} */ (lane.querySelector('[data-kp-reorder]'));
    }

    /**
     * The lanes the page gave as children, moved into the track and dressed; a lane the page adds to the board later (a board
     * attached before its data arrived) joins the same way. Returns whether any lane joined.
     */
    buildLanes() {
        const added = /** @type {HTMLElement[]} */ ([...this.host.querySelectorAll(`:scope > ${LANE}`)]);
        if (added.length === 0 && this.lanes.length > 0) return false;
        this.track.append(...added);
        this.lanes = /** @type {HTMLElement[]} */ ([...this.track.querySelectorAll(`:scope > ${LANE}`)]);
        this.lanes.forEach((lane, index) => this.dressLane(lane, index));
        return added.length > 0;
    }

    /** One lane: the pipeline's lane parts, its head, its list in the group, its empty line. @param {HTMLElement} lane @param {number} index */
    dressLane(lane, index) {
        const doc = lane.ownerDocument;
        const key = BoardLanes.keyOf(lane);
        lane.classList.add('kp-pipeline__lane', 'kp-board__lane');
        lane.id ||= `${this.group}-lane-${index}`;
        const nameId = `${lane.id}-name`;
        lane.setAttribute('aria-labelledby', nameId);
        if (!lane.querySelector(':scope > .kp-pipeline__head')) {
            const head = make(doc, 'header', 'kp-pipeline__head kp-board__head');
            const name = make(doc, 'h3', 'kp-pipeline__name', lane.dataset.kpBoardLabel ?? key);
            name.id = nameId;
            head.append(name, make(doc, 'span', 'kp-pipeline__count kp-board__count'));
            lane.prepend(head);
        }
        const list = BoardLanes.listOf(lane);
        if (!list) return;
        list.classList.add('kp-reorder', 'kp-board__list');
        list.dataset.kpReorderGroup = this.group;
        list.dataset.kpReorderList = key;
        list.setAttribute('aria-labelledby', nameId);
        if (!lane.querySelector(':scope > .kp-board__none')) list.after(make(doc, 'p', 'kp-pipeline__none kp-board__none', this.strings.boardLaneEmpty));
    }

    /** Every lane's count, its limit, its flag and its empty line; going over a limit is said once. */
    count() {
        for (const lane of this.lanes) {
            const list = BoardLanes.listOf(lane);
            const n = list ? itemsOf(list).length : 0;
            const limit = limitOf(lane);
            const counter = /** @type {HTMLElement | null} */ (lane.querySelector('.kp-board__count'));
            if (counter) {
                // Written only when it changes: the board's observer hears its own writes, and an equal write would wake it again.
                const text = limit > 0 ? `${n} / ${limit}` : String(n);
                if (counter.textContent !== text) counter.textContent = text;
                counter.setAttribute('aria-label', this.strings.boardCountLabel(n, limit));
            }
            this.flag(lane, limit > 0 && n > limit, n, limit);
            const none = /** @type {HTMLElement | null} */ (lane.querySelector(':scope > .kp-board__none'));
            if (none) none.hidden = n > 0;
            lane.toggleAttribute('data-kp-board-empty', n === 0);
        }
        this.countTabs();
    }

    /** A lane over its limit takes the pipeline's failing-stage look and flag, in words too. @param {HTMLElement} lane @param {boolean} over @param {number} n @param {number} limit */
    flag(lane, over, n, limit) {
        const key = BoardLanes.keyOf(lane);
        const head = lane.querySelector(':scope > .kp-pipeline__head');
        let flag = head?.querySelector('.kp-pipeline__flag');
        if (over && head && !flag) {
            flag = make(lane.ownerDocument, 'span', 'kp-pipeline__flag', this.strings.boardOver);
            head.querySelector('.kp-pipeline__name')?.after(flag);
        } else if (!over) flag?.remove();
        if (over) lane.dataset.kpStatus = 'danger';
        else if (lane.dataset.kpStatus === 'danger') delete lane.dataset.kpStatus;
        if (over && !this.over.has(key)) this.live.textContent = this.strings.boardOverSaid(lane.dataset.kpBoardLabel ?? key, n, limit);
        if (over) this.over.add(key);
        else this.over.delete(key);
    }

    /** The tabs' counts, drawn by the controller; nothing here. */
    countTabs() {}
}
