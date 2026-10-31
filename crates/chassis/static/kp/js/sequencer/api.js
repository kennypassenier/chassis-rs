// The getters and setters a page calls.
import { outItems, sequencers } from './instance.js';
import { apply, setZoom } from './edit.js';
import { sequencerTotalOf } from './timeline.js';
import { cancelEdit } from './drag.js';
import { paint, paintWindow } from './paint.js';
/** @typedef {import('./units.js').SequencerChangeItem} SequencerChangeItem */
/** @typedef {import('./units.js').SequencerItem} SequencerItem */
/** @typedef {import('./units.js').SequencerLane} SequencerLane */
/** @typedef {import('./units.js').SequencerState} SequencerState */

/**
 * Give the sequencer its items and lanes. Items are kept by id: a bar that stays is the same element, so a refresh keeps focus and
 * selection. Without `lanes` the lanes already given stay; a lane an item names that no lane does is added with its id as its
 * name. An edit in progress is not disturbed: the set is applied when it ends. No event: the page asked.
 * @param {Element} el
 * @param {Partial<SequencerItem>[]} items
 * @param {SequencerLane[]} [lanes]
 */
export function setSequencerItems(el, items, lanes) {
    const c = sequencers.get(el);
    if (!c) return;
    if (c.press || c.kb) {
        c.pending = { items, lanes };
        return;
    }
    apply(c, items, lanes);
}
/**
 * The items as the page last saw them: `{ id, lane, start, duration, with }` each, in the sequencer's unit.
 * @param {Element} el
 * @returns {SequencerChangeItem[]}
 */
export function getSequencerItems(el) {
    const c = sequencers.get(el);
    return c ? outItems(c, c.items) : [];
}
/**
 * The end of the last item, in the unit.
 * @param {Element} el
 * @returns {number}
 */
export function getSequencerTotal(el) {
    const c = sequencers.get(el);
    return c ? sequencerTotalOf(c.items) : 0;
}
/**
 * The state of the whole: `loading` (the busy card), `empty`, `error` (the plate, with its Retry as `kp-sequencer-retry`), `ready`.
 * `words` is the plate's title, `text` its sentence.
 * @param {Element} el
 * @param {SequencerState} state
 * @param {string} [words]
 * @param {{ text?: string, art?: Node | string | null }} [more]
 */
export function setSequencerState(el, state, words = '', { text = '', art = null } = {}) {
    const c = sequencers.get(el);
    if (!c) return;
    c.state = state;
    c.stateWords = words;
    c.stateText = text;
    c.stateArt = art;
    if (c.press || c.kb) cancelEdit(c, 'quiet');
    paint(c, { fit: false });
}
/**
 * Put the line for now at a point of the plan, in the unit; null takes it away.
 * @param {Element} el
 * @param {number | null} at
 */
export function setSequencerNow(el, at) {
    const c = sequencers.get(el);
    if (!c) return;
    c.nowAt = at === null || !Number.isFinite(at) ? null : at;
    paintWindow(c, c.view, false);
}
/**
 * Set the zoom (1 fits the plot to its box); the window keeps its middle.
 * @param {Element} el
 * @param {number} zoom
 */
export function setSequencerZoom(el, zoom) {
    const c = sequencers.get(el);
    if (c) setZoom(c, zoom);
}
/**
 * The zoom as it stands.
 * @param {Element} el
 * @returns {number}
 */
export function getSequencerZoom(el) {
    return sequencers.get(el)?.zoom ?? 1;
}
/**
 * Select an item (or none) as a click would; no change event.
 * @param {Element} el
 * @param {string | null} id
 */
export function setSequencerSelection(el, id) {
    const c = sequencers.get(el);
    if (!c) return;
    c.selected = id && c.items.some((i) => i.id === id) ? id : null;
    c.focusId = c.selected ?? c.focusId;
    paint(c, { fit: false });
}
