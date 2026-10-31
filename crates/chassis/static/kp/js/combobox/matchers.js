// The matchers a combobox filters its options with.
import { subsequence } from '../listbox.js';
/** @typedef {import('./types.js').Matcher} Matcher */

/** @type {Record<string, Matcher>} */
export const MATCHERS = {
    substring: (text, query) => text.includes(query),
    prefix: (text, query) => text.startsWith(query),
    subsequence: (text, query) => subsequence(text, query),
};
