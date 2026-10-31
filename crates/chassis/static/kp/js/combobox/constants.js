// The part names, event names and empty-state words of the combobox.
import { getStrings } from '../strings.js';

export const COMBOBOX = '[data-kp-combobox]';
export const INPUT = 'input[role="combobox"]';
export const LIST = '[role="listbox"]';
export const STATUS = '[data-kp-combobox-status]';
export const TAGS = '[data-kp-tag-list]';
export const EMPTY = '[data-kp-combobox-empty]';

/** Announced when the list changes; the words come from the dictionary [KT5]. */
export const RESULTS_TEXT = /** @param {number} n */ (n) => {
    const s = getStrings();
    return n === 0 ? s.noResults : n === 1 ? s.oneResult : s.manyResults(n);
};

/**
 * The event a consumer listens for. A contract value [TH26]: the detail
 * carries `{ value, label, values, action }` — the value just chosen or
 * removed, its label, every value held (one for a combobox, the whole
 * set for a tag input), and which of 'add' | 'remove' | 'set' it was.
 */
export const CHANGE_EVENT = 'kp-combobox-change';
/** Fired when the list opens or closes: `{ open }`. */
export const OPEN_EVENT = 'kp-combobox-open';
