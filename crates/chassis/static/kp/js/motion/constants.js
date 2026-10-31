// The attribute names, selectors and counters the motion layer shares.
import { motionState } from './state.js';

/** Any box a consumer wants eased, beside the components below. */
export const SIZE_ATTRIBUTE = 'data-kp-size-motion';
/** The boxes that ease to a new size. */
export const SIZE_SELECTOR = [
    '.kp-dialog',
    '.kp-tabs',
    '.kp-datatable',
    '.kp-toasts',
    '.kp-upload__list',
    '.kp-combobox__list',
    '.kp-tree',
    '.kp-wizard',
    '.kp-field',
    `[${SIZE_ATTRIBUTE}]`,
].join(', ');
/** The disclosures that unfold and fold back. */
export const FOLD_SELECTOR = '.kp-accordion__item';
/**
 * The attributes that give a row its stable id, in the order they are read,
 * for `data-kp-arrive="new"` [port spec G]: a row added back under the key
 * of a row that just left is the same row, repainted.
 */
export const ARRIVE_KEYS = /** @type {readonly string[]} */ (Object.freeze(['data-kp-key', 'data-kp-row-key', 'id']));
/** A loading placeholder: what replaces one is the data it waited for, not news. */
export const SKELETON = '.kp-skeleton, [data-kp-skeleton]';
/**
 * How many dialogs, boxes and disclosures motion is watching right now. A
 * diagnostic: after a page removes its boxes it returns to where it was,
 * because a box that leaves the page is let go.
 * @returns {number}
 */
export function motionWatchCount() {
    return motionState.watching;
}
