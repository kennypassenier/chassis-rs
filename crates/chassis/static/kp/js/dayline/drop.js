// Dropping an item from a list beside the day timeline onto an hour [parts-1102]. An element marked `data-kp-dayline-source="<id>"`
// is dragged the browser's way (it is made draggable); held over the hours, a marker says where it would start ("Starts 14:30", in
// steps of the day's step); let go, the day fires `kp-dayline-drop { id, start }` and the page plans it. A drag is a pointer's
// only: a keyboard or a finger reaches the same through the page's own "Set a time".

import { DAYLINE_DROP_EVENT, DRAG_TYPE, SOURCE_ATTRIBUTE, SOURCE_FOR_ATTRIBUTE } from './constants.js';

/**
 * What a drop needs from its day timeline.
 * @typedef {object} DropHost
 * @property {HTMLElement} host
 * @property {HTMLElement} grid
 * @property {HTMLElement} marker
 * @property {() => number} rowsTotal
 * @property {(row: number) => string} clockOfRow
 * @property {() => import('../strings.js').Strings} strings
 */

/** Whether a source may be dropped on this day. @param {Element} source @param {HTMLElement} host */
const mayDrop = (source, host) => {
    const only = source.getAttribute(SOURCE_FOR_ATTRIBUTE);
    return !only || only === host.id;
};

/** Make every source in the document that may land here draggable. @param {HTMLElement} host */
export function markSources(host) {
    for (const source of host.ownerDocument.querySelectorAll(`[${SOURCE_ATTRIBUTE}]`)) {
        if (mayDrop(source, host)) source.setAttribute('draggable', 'true');
    }
}

/** The row under the pointer. @param {DragEvent} event @param {DropHost} d */
function rowAt(event, d) {
    const box = d.grid.getBoundingClientRect();
    const share = (event.clientY - box.top) / Math.max(1, box.height);
    return Math.min(d.rowsTotal() - 1, Math.max(0, Math.floor(share * d.rowsTotal())));
}

/** Whether a drag carries one of ours. @param {DragEvent} event */
const carries = (event) => [...(event.dataTransfer?.types ?? [])].includes(DRAG_TYPE);

/**
 * Wire the drops of one day timeline; returns what undoes it.
 * @param {DropHost} d
 * @returns {() => void}
 */
export function wireDrop(d) {
    const doc = d.host.ownerDocument;
    const start = (/** @type {DragEvent} */ e) => {
        const source = e.target instanceof Element ? e.target.closest(`[${SOURCE_ATTRIBUTE}]`) : null;
        if (!source || !e.dataTransfer || !mayDrop(source, d.host)) return;
        e.dataTransfer.setData(DRAG_TYPE, source.getAttribute(SOURCE_ATTRIBUTE) ?? '');
        e.dataTransfer.effectAllowed = 'move';
    };
    const over = (/** @type {DragEvent} */ e) => {
        if (!carries(e)) return;
        e.preventDefault();
        const row = rowAt(e, d);
        d.marker.hidden = false;
        d.marker.style.gridRow = `${row + 1} / span 1`;
        d.marker.textContent = d.strings().daylineDropAt(d.clockOfRow(row));
    };
    const leave = (/** @type {DragEvent} */ e) => {
        if (!(e.relatedTarget instanceof Node && d.grid.contains(e.relatedTarget))) d.marker.hidden = true;
    };
    const drop = (/** @type {DragEvent} */ e) => {
        if (!carries(e)) return;
        e.preventDefault();
        d.marker.hidden = true;
        const id = e.dataTransfer?.getData(DRAG_TYPE) ?? '';
        if (id) d.host.dispatchEvent(new CustomEvent(DAYLINE_DROP_EVENT, { bubbles: true, detail: { id, start: d.clockOfRow(rowAt(e, d)) } }));
    };
    doc.addEventListener('dragstart', start);
    d.grid.addEventListener('dragover', over);
    d.grid.addEventListener('dragleave', leave);
    d.grid.addEventListener('drop', drop);
    return () => {
        doc.removeEventListener('dragstart', start);
        d.grid.removeEventListener('dragover', over);
        d.grid.removeEventListener('dragleave', leave);
        d.grid.removeEventListener('drop', drop);
    };
}
