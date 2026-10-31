// The listbox's contract values and options: the option attribute, the two events, the defaults and the options typedef.

/** The attribute an option carries. A contract value: consumers write it [TH26]. */
export const OPTION_SELECTOR = '[data-kp-option]';
/** Dispatched on the list, bubbling, when the highlight moves: `{ index, option }`. */
export const HIGHLIGHT_EVENT = 'kp-listbox-highlight';
/** Dispatched on the list, bubbling, when an option is chosen: `{ index, option }`. */
export const CHOOSE_EVENT = 'kp-listbox-choose';

/** An option the page marks as off is never highlighted. */
const DISABLED_SELECTOR = '[data-kp-disabled], [aria-disabled="true"]';
/** How long typed letters count as one word [ms]. */
const TYPEAHEAD_MS = 500;
/** The id prefix when the list has no id of its own. */
export const FALLBACK_PREFIX = 'kp-listbox';

/**
 * @typedef {object} ListboxOptions
 * @property {HTMLElement} input the text input keeping DOM focus
 * @property {HTMLElement} list the element with role="listbox"
 * @property {(index: number, option: HTMLElement) => void} [onChoose] Enter or click on an option
 * @property {() => void} [onDismiss] Escape, or focus leaving
 * @property {(index: number, option: HTMLElement | null) => void} [onHighlight]
 * @property {boolean} [loop] whether Down on the last option returns to the first. Default true.
 * @property {string} [optionSelector] Default OPTION_SELECTOR.
 * @property {string} [disabledSelector] Default `[data-kp-disabled], [aria-disabled="true"]`.
 * @property {boolean} [hoverHighlights] the mouse moves the highlight. Default true.
 * @property {boolean | ScrollIntoViewOptions} [scrollIntoView] Default `{ block: 'nearest' }`; false for none.
 * @property {string} [activeClass] Default `is-active`.
 * @property {string} [idPrefix] For generated option ids. Default: the list's id, else `kp-listbox`.
 * @property {boolean} [typeahead] letters jump to the next option starting with them. Default false.
 * @property {number} [typeaheadMs] Default 500.
 * @property {boolean} [dismissOnEscape] Default true.
 * @property {boolean} [events] dispatch HIGHLIGHT_EVENT and CHOOSE_EVENT on the list. Default true.
 */

/**
 * The options with every default filled in.
 * @param {ListboxOptions} given
 */
export function resolveListbox(given) {
    return {
        ...given,
        loop: given.loop ?? true,
        optionSelector: given.optionSelector ?? OPTION_SELECTOR,
        disabledSelector: given.disabledSelector ?? DISABLED_SELECTOR,
        hoverHighlights: given.hoverHighlights ?? true,
        scrollIntoView: given.scrollIntoView ?? { block: /** @type {const} */ ('nearest') },
        activeClass: given.activeClass ?? 'is-active',
        typeahead: given.typeahead ?? false,
        typeaheadMs: given.typeaheadMs ?? TYPEAHEAD_MS,
        dismissOnEscape: given.dismissOnEscape ?? true,
        events: given.events ?? true,
    };
}
