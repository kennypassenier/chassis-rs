// The listbox engine, framework-free [R2-M1, TH39, TH41, TH40].
//
// Three components in this round need the same thing: a list of options
// where the arrow keys move a highlight, Enter chooses, Escape closes,
// and a screen reader is told which option is current. The combobox
// (TH39), the tag input (TH41) and the command palette (TH40) differ in
// what they do with the choice, not in how the list behaves.
//
// So the behaviour lives here once. Writing it three times is how three
// implementations end up with three different bugs — and the bug is
// always the same one: the highlight moves visually while
// `aria-activedescendant` does not, so the list works with a mouse and is
// silent to everyone else.
//
// The pattern is the ARIA authoring practice's combobox, and the part
// that matters is **virtual focus**: DOM focus stays in the text input
// while the highlight travels the list. Moving real focus into the list
// would take it out of the input, and typing would stop working.
//
// This module renders nothing. It takes an input, a list container, and a
// callback, and returns a controller. What the options ARE — where they
// come from, what they look like — belongs to the caller.
//
// The audit named this file the model for the framework-free channel and
// still found five knobs it stopped short of [KT6]: the option selector,
// hover following the highlight, scrolling into view, the id prefix and
// the active class were constants; it dispatched no events; and destroy
// left the ids and aria-selected it had stamped. All are options now.

import { ListboxController } from './listbox/controller.js';

export { scrollWithin } from './listbox/scroll.js';
export { OPTION_SELECTOR, HIGHLIGHT_EVENT, CHOOSE_EVENT } from './listbox/values.js';
export { subsequence } from './listbox/match.js';

/** @typedef {import('./listbox/values.js').ListboxOptions} ListboxOptions */

/**
 * Wire virtual focus between an input and a list of options.
 *
 * @param {ListboxOptions} options
 */
export function createListbox(options) {
    const controller = new ListboxController(options.list, options);
    controller.connect();
    return {
        /** Re-read the options and put the highlight back at the top. */
        refresh() {
            controller.clear();
            controller.identify();
        },
        /** @param {number} at */
        highlight(at) {
            controller.highlight(at);
        },
        clear: () => controller.clear(),
        /** Choose the highlighted option, as Enter would. */
        choose: () => controller.choose(),
        /** @returns {number} the highlighted index, or -1 */
        get index() {
            return controller.index;
        },
        /** @returns {HTMLElement[]} */
        get options() {
            return controller.visibleOptions();
        },
        destroy() {
            controller.destroy();
        },
    };
}
