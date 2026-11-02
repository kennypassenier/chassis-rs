// Dropping an item from a list beside the day timeline onto an hour [parts-1102; r2: by pointer, a finger included]. An element
// marked `data-kp-dayline-source="<id>"` is picked up the way a block is (js/dayline/press.js): a mouse or a pen once it travels a
// few pixels, a finger after holding it still (a swipe still scrolls the list). A copy of it follows the pointer in the top layer;
// held over the hours of a day that takes it, a marker says where it would start ("Starts 14:30", in steps of the day's step) and
// the box scrolls near its edges; let go there, the day fires `kp-dayline-drop { id, start }`, says it, and the page plans it. Let
// go anywhere else, or Escape, and nothing happens. A press on the source's own controls (its check box, its menu, a field) stays
// theirs. A keyboard reaches the same through the page's own "Set a time".
//
// One listener per document serves every day timeline in it, so a press lifts one copy however many days could take it.

import { DAYLINE_DROP_EVENT, SOURCE_ATTRIBUTE, SOURCE_FOR_ATTRIBUTE, SOURCE_LABEL_ATTRIBUTE, SOURCE_OWN_PRESS } from './constants.js';
import { edgeScroller } from './edge-scroll.js';
import { followPress, holdScroll } from './press.js';
import { liftCopy } from './ghost.js';

/**
 * What a drop needs from its day timeline.
 * @typedef {object} DropHost
 * @property {HTMLElement} host
 * @property {HTMLElement} grid
 * @property {HTMLElement} scroll
 * @property {HTMLElement} marker
 * @property {() => number} rowsTotal
 * @property {() => number} holdMs
 * @property {(row: number) => string} clockOfRow
 * @property {() => import('../strings.js').Strings} strings
 * @property {(text: string) => void} say
 */

/** @type {WeakMap<Document, { days: Set<DropHost>, off: () => void }>} */
const PER_DOCUMENT = new WeakMap();
/** The sources that already hold a touch's scroll back. @type {WeakSet<Element>} */
const HELD = new WeakSet();

/** Whether a source may be dropped on this day, and the day can take one now. @param {Element} source @param {DropHost} d */
const takes = (source, d) => {
    const only = source.getAttribute(SOURCE_FOR_ATTRIBUTE);
    const state = d.host.dataset.kpState;
    return (!only || only === d.host.id) && state !== 'loading' && state !== 'error' && d.host.isConnected;
};

/** Mark every source in the document that may land here, so a touch on it can hold its scroll back. @param {HTMLElement} host */
export function markSources(host) {
    for (const source of host.ownerDocument.querySelectorAll(`[${SOURCE_ATTRIBUTE}]`)) {
        source.setAttribute('data-kp-dayline-movable', '');
        if (!HELD.has(source)) {
            HELD.add(source);
            holdScroll(source);
        }
    }
}

/** The row under a point. @param {number} y @param {DropHost} d */
function rowAt(y, d) {
    const box = d.grid.getBoundingClientRect();
    const share = (y - box.top) / Math.max(1, box.height);
    return Math.min(d.rowsTotal() - 1, Math.max(0, Math.floor(share * d.rowsTotal())));
}

/** The day whose box is under a point and takes the source. @param {Set<DropHost>} days @param {Element} source @param {number} x @param {number} y */
function dayAt(days, source, x, y) {
    for (const d of days) {
        const r = d.scroll.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && takes(source, d)) return d;
    }
    return null;
}

/** One drag of a source. @param {PointerEvent} down @param {HTMLElement} source @param {Set<DropHost>} days */
function dragSource(down, source, days) {
    const first = [...days].find((d) => takes(source, d));
    if (!first) return;
    /** @type {DropHost | null} */
    let over = null;
    let at = { x: down.clientX, y: down.clientY };
    /** @type {ReturnType<typeof liftCopy> | null} */
    let copy = null;
    /** @type {ReturnType<typeof edgeScroller> | null} */
    let edge = null;
    const mark = () => {
        for (const d of days) if (d !== over) d.marker.hidden = true;
        if (!over) return;
        const row = rowAt(at.y, over);
        over.marker.hidden = false;
        over.marker.style.gridRow = `${row + 1} / span 1`;
        over.marker.textContent = over.strings().daylineDropAt(over.clockOfRow(row));
    };
    const clear = () => {
        edge?.stop();
        copy?.remove();
        delete source.dataset.kpLifted;
        for (const d of days) d.marker.hidden = true;
    };
    followPress(down, {
        mode: 'hold',
        holdMs: first.holdMs(),
        capture: source,
        lift: () => {
            source.dataset.kpLifted = '';
            first.say(first.strings().daylineLifted(source.getAttribute(SOURCE_LABEL_ATTRIBUTE) ?? ''));
        },
        start: () => {
            source.dataset.kpLifted = '';
            source.ownerDocument.getSelection()?.removeAllRanges();
            copy = liftCopy(source, first.host, down);
            return true;
        },
        move: (e) => {
            at = { x: e.clientX, y: e.clientY };
            copy?.follow(e);
            const next = dayAt(days, source, at.x, at.y);
            if (next !== over) {
                edge?.stop();
                over = next;
                edge = over ? edgeScroller(over.scroll, mark) : null;
            }
            edge?.at(at.y);
            mark();
        },
        end: (how) => {
            const d = over;
            clear();
            if (how !== 'drop' || !d) return;
            const id = source.getAttribute(SOURCE_ATTRIBUTE) ?? '';
            const start = d.clockOfRow(rowAt(at.y, d));
            if (!id) return;
            d.say(d.strings().daylineDropped(source.getAttribute(SOURCE_LABEL_ATTRIBUTE) ?? '', start));
            d.host.dispatchEvent(new CustomEvent(DAYLINE_DROP_EVENT, { bubbles: true, detail: { id, start } }));
        },
    });
}

/**
 * Wire the drops of one day timeline; returns what undoes it.
 * @param {DropHost} d
 * @returns {() => void}
 */
export function wireDrop(d) {
    const doc = d.host.ownerDocument;
    let shared = PER_DOCUMENT.get(doc);
    if (!shared) {
        const days = new Set();
        const press = (/** @type {PointerEvent} */ e) => {
            const el = e.target instanceof Element ? e.target : null;
            const source = /** @type {HTMLElement | null} */ (el?.closest(`[${SOURCE_ATTRIBUTE}]`) ?? null);
            if (!source || (e.pointerType === 'mouse' && e.button !== 0) || !e.isPrimary) return;
            const own = el?.closest(SOURCE_OWN_PRESS);
            if (own && own !== source && source.contains(own)) return;
            dragSource(e, source, days);
        };
        doc.addEventListener('pointerdown', press);
        shared = { days, off: () => doc.removeEventListener('pointerdown', press) };
        PER_DOCUMENT.set(doc, shared);
    }
    shared.days.add(d);
    const mine = shared;
    return () => {
        mine.days.delete(d);
        if (mine.days.size) return;
        mine.off();
        PER_DOCUMENT.delete(doc);
    };
}
