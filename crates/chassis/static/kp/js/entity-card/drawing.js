// The base of one card's drawing: what a draw reads once, the signature-checked slots and the skeleton of a loading card.
import { getStrings } from '../strings.js';
import { DRAWN, SLOTS, frame, made, opt, sig, slotOf, starKeyOf } from './helpers.js';
/** @typedef {import('./types.js').EntityData} EntityData */

/** The most meter rows a card shows. */
const MAX_METER_ROWS = 3;
/** How many meter rows a card shows when it does not say. */
const DEFAULT_METER_ROWS = 2;

/** One draw of one card from its data; the subclasses add the slots, `set.js` runs them in order. */
export class EntityDrawing {
    /** @param {HTMLElement} card @param {EntityData} data */
    constructor(card, data) {
        this.card = card;
        this.data = data;
        this.doc = card.ownerDocument;
        this.s = getStrings();
        this.key = data.key;
        /** @type {'stack' | 'tile'} */
        this.kind = 'stack';
        /** The signature each slot was last drawn from. @type {Record<string, string>} */
        this.drawn = {};
        /** The star as it stands. */
        this.star = false;
        this.status = data.status ?? 'ready';
        this.meterRows = 0;
        /** The card's options, read once the card is out of its skeleton. */
        this.link = /** @type {string | null} */ (null);
        this.selectable = false;
        this.markKind = 'idmark';
        this.starOn = false;
        this.starKey = 's';
    }

    /** The frame, the remembered draw and the attributes every status shows. */
    begin() {
        const { card, data } = this;
        this.kind = frame(card);
        const before = DRAWN.get(card);
        this.drawn = before?.drawn ?? {};
        // The star as it stands: a refill (new data) says it, a redraw of the same data keeps what was pressed since.
        this.star = before && before.data === data ? before.star : (data.starred ?? before?.star ?? false);
        DRAWN.set(card, { data, drawn: this.drawn, star: this.star });
        card.setAttribute('data-kp-row-key', data.key);
        card.setAttribute('data-kp-entity-key', data.key);
        card.setAttribute('data-kp-state', this.status);
        this.meterRows = Math.max(0, Math.min(MAX_METER_ROWS, Number(opt(card, 'data-kp-entity-meters') ?? DEFAULT_METER_ROWS) || 0));
    }

    /** Read the options of a card that is not loading. */
    readOptions() {
        const { card, kind } = this;
        this.link = opt(card, 'data-kp-entity-link');
        this.selectable = opt(card, 'data-kp-selectable') !== null;
        this.markKind = opt(card, 'data-kp-entity-mark') ?? 'idmark';
        this.starOn = (opt(card, 'data-kp-entity-star') ?? (kind === 'tile' ? 'on' : 'off')) !== 'off';
        this.starKey = starKeyOf(card);
    }

    /**
     * Draw a slot only when its signature changed.
     * @param {string} name @param {unknown} signature @param {(el: HTMLElement) => void} build
     */
    slot(name, signature, build) {
        const text = sig(signature);
        if (this.drawn[name] === text) return;
        this.drawn[name] = text;
        const el = slotOf(this.card, name);
        el.replaceChildren();
        build(el);
    }

    /** A skeleton keeps every row: what the card will hold is not known yet. */
    drawLoading() {
        const { card, kind, doc } = this;
        card.removeAttribute('data-kp-entity-actions');
        slotOf(card, kind === 'stack' ? 'actions' : 'lines').hidden = false;
        for (const name of SLOTS[kind]) {
            this.slot(name, 'loading', (el) => {
                const bone = made(doc, 'span', 'kp-skeleton kp-entity__bone');
                bone.setAttribute('aria-hidden', 'true');
                el.append(bone);
            });
        }
        card.setAttribute('aria-busy', 'true');
    }
}
