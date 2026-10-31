// update(): write the value at once, queue the mark in the batch of this task.

import { writeSpark } from './spark.js';
import { setStateWord } from '../components.js';
import { SVG_NS } from './values.js';
import { UpdateBatch } from './batch.js';

/** @typedef {import('../update.js').SparkWrite} SparkWrite */

/** The one batch every update of the page goes through. */
const BATCH = new UpdateBatch();

/** @param {Element} el */
const isSvg = (el) => el.namespaceURI === SVG_NS && el.localName === 'svg';

/**
 * Show `next` in `el` the theme's way. The value is written at the call and
 * stays readable throughout; any width the new value itself needs is taken
 * then, with the value, so nothing moves while the idea plays and nothing
 * moves when it ends. The mark goes on in the batch of this task (see
 * UpdateBatch.flush()), before the next frame.
 * @param {Element} el a text element, a `.kp-state-word`, or a spark's svg
 * @param {string | number | readonly number[]} next
 * @returns {Promise<number>} how long it played, in ms; 0 when nothing played
 */
export async function update(el, next) {
    // A spark is an svg, which has no pseudo-elements: its box carries the mark.
    const host = /** @type {HTMLElement} */ (isSvg(el) ? (el.parentElement ?? el) : el);
    BATCH.cancel(host);
    /** @type {SparkWrite | null} */
    let spark = null;
    if (isSvg(el) && Array.isArray(next)) spark = await writeSpark(/** @type {SVGSVGElement} */ (el), next);
    else if (el.classList.contains('kp-state-word')) setStateWord(/** @type {HTMLElement} */ (el), String(next));
    else el.textContent = String(next);
    return new Promise((resolve) => BATCH.enqueue({ el, host, spark, resolve }));
}
