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

/** The attribute an option carries. A contract value: consumers write it [TH26]. */
export const OPTION_SELECTOR = '[data-kp-option]';
/** Dispatched on the list, bubbling, when the highlight moves: `{ index, option }`. */
export const HIGHLIGHT_EVENT = 'kp-listbox-highlight';
/** Dispatched on the list, bubbling, when an option is chosen: `{ index, option }`. */
export const CHOOSE_EVENT = 'kp-listbox-choose';

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
 * Wire virtual focus between an input and a list of options.
 *
 * @param {ListboxOptions} options
 */
export function createListbox({
    input,
    list,
    onChoose,
    onDismiss,
    onHighlight,
    loop = true,
    optionSelector = OPTION_SELECTOR,
    disabledSelector = '[data-kp-disabled], [aria-disabled="true"]',
    hoverHighlights = true,
    scrollIntoView = { block: 'nearest' },
    activeClass = 'is-active',
    idPrefix,
    typeahead = false,
    typeaheadMs = 500,
    dismissOnEscape = true,
    events = true,
}) {
    let index = -1;
    /** What this controller stamped, so destroy can take it back. */
    /** @type {Set<HTMLElement>} */
    const stampedIds = new Set();
    /** @type {Set<HTMLElement>} */
    const stampedSelected = new Set();
    let buffer = '';
    let bufferTimer = 0;

    /**
     * Whether an option is shown: neither it nor a group between it and the
     * list is `hidden`. The list's own `hidden` does not count, because the
     * arrow keys may move the highlight in a list that is about to open.
     *
     * @param {HTMLElement} option
     */
    const shown = (option) => {
        for (let el = /** @type {HTMLElement | null} */ (option); el !== null && el !== list; el = el.parentElement) if (el.hidden) return false;
        return true;
    };

    /**
     * The options as they stand right now: the ones a person can see and
     * choose. A filtered-out option used to count, so after typing the first
     * ArrowDown highlighted an option nobody could see and the highlight
     * walked through every hidden one before it reached the list [note 2 of
     * Kenny's second nostromo pass, 2026-09-13].
     *
     * @returns {HTMLElement[]}
     */
    const options = () =>
        /** @type {HTMLElement[]} */ (
            [...list.querySelectorAll(optionSelector)].filter((el) => !el.matches(disabledSelector) && shown(/** @type {HTMLElement} */ (el)))
        );

    /**
     * Give every option an id, because `aria-activedescendant` refers to
     * one and an option without an id cannot be pointed at. Generated
     * rather than demanded from the consumer: an id collision between two
     * pickers on one page is the kind of bug nobody looks for.
     */
    const identify = () => {
        const base = idPrefix ?? list.id ?? 'kp-listbox';
        options().forEach((option, i) => {
            if (!option.id) {
                option.id = `${base || 'kp-listbox'}-option-${i}`;
                stampedIds.add(option);
            }
        });
    };

    /** @param {number} next */
    const highlight = (next) => {
        const all = options();
        if (all.length === 0) {
            index = -1;
            input.removeAttribute('aria-activedescendant');
            onHighlight?.(-1, null);
            return;
        }
        identify();
        index = Math.max(0, Math.min(next, all.length - 1));
        all.forEach((option, i) => {
            const current = i === index;
            // Two carriers, as everywhere in this package: the attribute
            // for assistive technology and for tests, the class for CSS.
            if (!option.hasAttribute('aria-selected')) stampedSelected.add(option);
            option.setAttribute('aria-selected', String(current));
            option.classList.toggle(activeClass, current);
            if (current) {
                input.setAttribute('aria-activedescendant', option.id);
                // `nearest` rather than `center` by default: a list that
                // jumps under the cursor on every keystroke is worse than
                // one that scrolls the minimum.
                if (scrollIntoView !== false) option.scrollIntoView(scrollIntoView === true ? { block: 'nearest' } : scrollIntoView);
            }
        });
        const option = all[index] ?? null;
        onHighlight?.(index, option);
        if (events) list.dispatchEvent(new CustomEvent(HIGHLIGHT_EVENT, { bubbles: true, detail: { index, option } }));
    };

    const clear = () => {
        index = -1;
        input.removeAttribute('aria-activedescendant');
        for (const option of options()) {
            // Recorded like highlight's stamp: a clear before any highlight
            // left `aria-selected="false"` behind after destroy [scope-48].
            if (!option.hasAttribute('aria-selected')) stampedSelected.add(option);
            option.setAttribute('aria-selected', 'false');
            option.classList.remove(activeClass);
        }
    };

    /** @param {number} step */
    const move = (step) => {
        const count = options().length;
        if (count === 0) return;
        if (index === -1) {
            highlight(step > 0 ? 0 : count - 1);
            return;
        }
        const next = index + step;
        if (next < 0) highlight(loop ? count - 1 : 0);
        else if (next >= count) highlight(loop ? 0 : count - 1);
        else highlight(next);
    };

    const choose = () => {
        const all = options();
        const option = all[index];
        if (option === undefined) return false;
        onChoose?.(index, option);
        if (events) list.dispatchEvent(new CustomEvent(CHOOSE_EVENT, { bubbles: true, detail: { index, option } }));
        return true;
    };

    /** @param {KeyboardEvent} event */
    const onKeyDown = (event) => {
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                move(1);
                break;
            case 'ArrowUp':
                event.preventDefault();
                move(-1);
                break;
            case 'Home':
                if (options().length > 0) {
                    event.preventDefault();
                    highlight(0);
                }
                break;
            case 'End': {
                const count = options().length;
                if (count > 0) {
                    event.preventDefault();
                    highlight(count - 1);
                }
                break;
            }
            case 'Enter':
                // Only swallow Enter when it actually chose something;
                // otherwise a combobox inside a form would stop the form
                // from submitting, which is a trap rather than a feature.
                if (choose()) event.preventDefault();
                break;
            case 'Escape':
                if (dismissOnEscape) onDismiss?.();
                break;
            default:
                if (typeahead && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                    clearTimeout(bufferTimer);
                    buffer += event.key.toLowerCase();
                    bufferTimer = window.setTimeout(() => (buffer = ''), typeaheadMs);
                    const all = options();
                    const from = buffer.length > 1 ? 0 : index + 1;
                    const order = [...all.slice(from), ...all.slice(0, from)];
                    const found = order.find((o) => (o.textContent ?? '').trim().toLowerCase().startsWith(buffer));
                    if (found) highlight(all.indexOf(found));
                }
                break;
        }
    };

    /** @param {MouseEvent} event */
    const onClick = (event) => {
        const target = /** @type {HTMLElement} */ (event.target);
        const option = target.closest(optionSelector);
        if (!(option instanceof HTMLElement) || option.matches(disabledSelector)) return;
        const at = options().indexOf(option);
        if (at === -1) return;
        highlight(at);
        choose();
    };

    /**
     * Hover moves the highlight so the mouse and the keyboard cannot
     * disagree about which option Enter would take.
     *
     * @param {MouseEvent} event
     */
    const onOver = (event) => {
        if (!hoverHighlights) return;
        const target = /** @type {HTMLElement} */ (event.target);
        const option = target.closest(optionSelector);
        if (!(option instanceof HTMLElement)) return;
        const at = options().indexOf(option);
        if (at !== -1) highlight(at);
    };

    input.addEventListener('keydown', onKeyDown);
    list.addEventListener('click', onClick);
    list.addEventListener('mouseover', onOver);

    return {
        /** Re-read the options and put the highlight back at the top. */
        refresh() {
            clear();
            identify();
        },
        /** @param {number} at */
        highlight(at) {
            highlight(at);
        },
        clear,
        /** Choose the highlighted option, as Enter would. */
        choose,
        /** @returns {number} the highlighted index, or -1 */
        get index() {
            return index;
        },
        /** @returns {HTMLElement[]} */
        get options() {
            return options();
        },
        destroy() {
            clearTimeout(bufferTimer);
            input.removeEventListener('keydown', onKeyDown);
            list.removeEventListener('click', onClick);
            list.removeEventListener('mouseover', onOver);
            clear();
            // Take back what was stamped: an id the consumer did not
            // write, an aria-selected the option did not have.
            for (const option of stampedIds) option.removeAttribute('id');
            for (const option of stampedSelected) option.removeAttribute('aria-selected');
            stampedIds.clear();
            stampedSelected.clear();
        },
    };
}

/**
 * Does `text` match `query` as a subsequence, the way a command palette
 * matches? "thm" finds "Theme".
 *
 * Deliberately not a fuzzy-score library: this returns whether it matches
 * and the caller keeps its own order. A ranking function that nobody can
 * explain is how a palette starts putting the wrong thing first.
 *
 * @param {string} text
 * @param {string} query
 * @returns {boolean}
 */
export function subsequence(text, query) {
    if (query === '') return true;
    const haystack = text.toLowerCase();
    const needle = query.toLowerCase();
    let at = 0;
    for (const character of needle) {
        at = haystack.indexOf(character, at);
        if (at === -1) return false;
        at += 1;
    }
    return true;
}
