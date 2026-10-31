// One sequencer's state, its options and the small helpers every part uses.
import { sequencerUnit } from './units.js';
/** @typedef {import('./units.js').SequencerChangeItem} SequencerChangeItem */
/** @typedef {import('./units.js').SequencerItem} SequencerItem */
/** @typedef {import('./units.js').SequencerLane} SequencerLane */
/** @typedef {import('./units.js').SequencerOptions} SequencerOptions */
/** @typedef {import('./units.js').SequencerOverlap} SequencerOverlap */
/** @typedef {import('./units.js').SequencerPlan} SequencerPlan */
/** @typedef {import('./units.js').SequencerState} SequencerState */
/** @typedef {import('./units.js').SequencerUnit} SequencerUnit */
/** @typedef {import('./units.js').Strings} Strings */

/**
 * @typedef {object} SequencerModel
 * @property {HTMLElement} el
 * @property {Strings} strings
 * @property {string} id
 * @property {HTMLElement} bar the toolbar
 * @property {HTMLElement} zoomGroup
 * @property {HTMLButtonElement[]} zoomButtons out, fit, in
 * @property {HTMLElement} zoomValue
 * @property {HTMLElement} total
 * @property {HTMLElement} frame
 * @property {HTMLElement} scroll
 * @property {HTMLElement} body
 * @property {HTMLElement} axis
 * @property {HTMLElement} lines
 * @property {HTMLElement} layer the bars
 * @property {HTMLElement} plot the line for now, the end of the plan, the guide and the readout
 * @property {HTMLElement} nowLine
 * @property {HTMLElement} endLine
 * @property {HTMLElement} guide
 * @property {HTMLElement} readout
 * @property {HTMLElement} plate
 * @property {HTMLElement} selection
 * @property {HTMLElement} selectionText
 * @property {HTMLButtonElement} linkButton
 * @property {HTMLButtonElement} unlinkButton
 * @property {HTMLButtonElement} cancelButton
 * @property {HTMLElement} hint
 * @property {HTMLElement} help
 * @property {HTMLElement} announcer
 * @property {HTMLElement} measure a hidden label that wraps, to ask whether a name fits its bar
 * @property {HTMLElement} ruler a hidden label on one line, to ask how wide a name is
 * @property {HTMLElement} probe a hidden box one row tall and one pad wide, to read both in px
 * @property {number} rowPx
 * @property {number} padPx
 * @property {{ name: SequencerUnit, seconds: number }} unit
 * @property {number} step
 * @property {SequencerOverlap} overlap
 * @property {boolean} edges
 * @property {boolean} laneMove
 * @property {boolean} editable
 * @property {number} minSpan
 * @property {SequencerItem[]} items committed
 * @property {SequencerItem[]} view what is drawn (items, or the draft of an edit in progress)
 * @property {SequencerLane[]} lanes
 * @property {{ rows: Map<string, number>, counts: Map<string, number> }} rows
 * @property {number} span
 * @property {number} zoom
 * @property {number | null} nowAt
 * @property {SequencerState} state
 * @property {string} stateWords
 * @property {string} stateText
 * @property {Node | string | null} stateArt
 * @property {string} plateKey
 * @property {string} laneKey
 * @property {string} tickKey
 * @property {HTMLElement[]} laneEls
 * @property {{ id: string, top: number }[]} laneTops
 * @property {Map<string, HTMLButtonElement>} bars
 * @property {Map<string, HTMLElement>} outsides
 * @property {Map<string, HTMLElement>} joins
 * @property {string | null} selected
 * @property {string | null} focusId the item that holds the tab stop
 * @property {string | null} linking
 * @property {{ id: string, before: SequencerItem[] } | null} kb an item picked up with the keyboard
 * @property {{ id: string, edge: 'start' | 'end' | 'body', x: number, y: number, pointer: number, grab: number, bar: HTMLButtonElement, moved: boolean, before: SequencerItem[], refused: boolean, lanes: { id: string, top: number, bottom: number }[], last: SequencerPlan | null, edgeX: number } | null} press
 * @property {{ items: Partial<SequencerItem>[], lanes: SequencerLane[] | undefined } | null} pending
 * @property {import('../busy-card.js').BusyCard | null} busy
 * @property {Promise<void> | null} leaving
 * @property {Map<number, { x: number }>} touches
 * @property {{ dist: number, zoom: number } | null} pinch
 * @property {number} scrollTimer
 * @property {number} frameTimer
 * @property {boolean} drawn
 * @property {ResizeObserver | null} observer
 */

/** @type {WeakMap<Element, SequencerModel>} */
export const sequencers = new WeakMap();
/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {Document} doc @param {K} tag @param {string} [className] @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
export const make = (doc, tag, className, text) => {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
};
/** @param {number} n */
export const px = (n) => `${Math.round(n * 100) / 100}px`;
/** @param {SequencerModel} c @param {number} value */
export const words = (c, value) => c.strings.sequencerSpan(value, c.unit.name);
/** The item as a screen reader and the selection line say it. @param {SequencerModel} c @param {SequencerItem} item */
export function summary(c, item) {
    const lane = c.lanes.find((l) => l.id === item.lane)?.label ?? item.lane;
    const partner = item.with ? (c.view.find((i) => i.id === item.with)?.label ?? null) : null;
    return c.strings.sequencerItem(item.label, lane, words(c, item.start), words(c, item.duration), partner);
}
/** @param {SequencerModel} c @param {string} id */
export const labelOf = (c, id) => c.view.find((i) => i.id === id)?.label ?? id;
/** Say something politely, even the same sentence twice. @param {SequencerModel} c @param {string} text */
export function announce(c, text) {
    c.announcer.textContent = '';
    c.announcer.textContent = text;
}
/** @param {SequencerModel} c @param {string} name @param {unknown} detail */
export const emit = (c, name, detail) => c.el.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
/** @param {SequencerModel} c @param {SequencerItem[]} list @returns {SequencerChangeItem[]} */
export const outItems = (c, list) => list.map((i) => ({ id: i.id, lane: i.lane, start: i.start, duration: i.duration, with: i.with ?? null }));
/** The options as the attributes say them. @param {SequencerModel} c */
export function readOptions(c) {
    const d = c.el.dataset;
    c.unit = sequencerUnit(d.kpSequencerUnit ?? 'minute') ?? { name: 'minute', seconds: 60 };
    const step = Number(d.kpSequencerSnap);
    c.step = Number.isFinite(step) && step > 0 ? step : 1;
    c.overlap = d.kpSequencerOverlap === 'push' || d.kpSequencerOverlap === 'allow' ? d.kpSequencerOverlap : 'refuse';
    c.edges = d.kpSequencerSnapItems !== 'off';
    c.laneMove = d.kpSequencerLanes !== 'fixed';
    c.editable = d.kpSequencerEditable !== 'off';
    const span = Number(d.kpSequencerSpan);
    c.minSpan = Number.isFinite(span) && span > 0 ? span : 0;
    c.bar.hidden = d.kpSequencerToolbar === 'off';
    c.hint.hidden = d.kpSequencerHint === 'off';
    c.hint.textContent = c.editable ? c.strings.sequencerHint : c.strings.sequencerHintReadonly;
    c.selection.hidden = !c.editable && d.kpSequencerSelection === 'off';
}
/** The options a plan takes. @param {SequencerModel} c @param {{ max?: number, reach?: number, edges?: boolean }} [more] @returns {SequencerOptions} */
export const planOptions = (c, more = {}) => ({
    step: c.step,
    overlap: c.overlap,
    edges: c.edges,
    laneMove: c.laneMove,
    lanes: c.lanes.map((l) => l.id),
    ...more,
});
