// One listbox's state and its highlight: the options a person can choose, their ids, the highlight and the choice.

import { Controller } from '../controller.js';
import { scrollWithin } from './scroll.js';
import { CHOOSE_EVENT, FALLBACK_PREFIX, HIGHLIGHT_EVENT, resolveListbox } from './values.js';

/** @typedef {import('./values.js').ListboxOptions} ListboxOptions */

export class ListboxCore extends Controller {
    /**
     * @param {HTMLElement} list the element with role="listbox"
     * @param {Record<string, unknown>} options a ListboxOptions
     */
    constructor(list, options) {
        super(list, options);
        /** The options with their defaults. */
        this.o = resolveListbox(/** @type {ListboxOptions} */ (options));
        this.list = list;
        this.input = this.o.input;
        /** The highlighted index, or -1. */
        this.index = -1;
        /** What this controller stamped, so destroy can take it back. @type {Set<HTMLElement>} */
        this.stampedIds = new Set();
        /** @type {Set<HTMLElement>} */
        this.stampedSelected = new Set();
        /** The letters typed so far, and the timer that forgets them. */
        this.buffer = '';
        this.bufferTimer = 0;
    }

    /**
     * Whether an option is shown: neither it nor a group between it and the
     * list is `hidden`. The list's own `hidden` does not count, because the
     * arrow keys may move the highlight in a list that is about to open.
     *
     * @param {HTMLElement} option
     */
    shown(option) {
        for (let el = /** @type {HTMLElement | null} */ (option); el !== null && el !== this.list; el = el.parentElement) if (el.hidden) return false;
        return true;
    }

    /**
     * The options as they stand right now: the ones a person can see and
     * choose. A filtered-out option used to count, so after typing the first
     * ArrowDown highlighted an option nobody could see and the highlight
     * walked through every hidden one before it reached the list [note 2 of
     * Kenny's second nostromo pass, 2026-09-13].
     *
     * @returns {HTMLElement[]}
     */
    visibleOptions() {
        const { optionSelector, disabledSelector } = this.o;
        return /** @type {HTMLElement[]} */ (
            [...this.list.querySelectorAll(optionSelector)].filter((el) => !el.matches(disabledSelector) && this.shown(/** @type {HTMLElement} */ (el)))
        );
    }

    /**
     * Give every option an id, because `aria-activedescendant` refers to
     * one and an option without an id cannot be pointed at. Generated
     * rather than demanded from the consumer: an id collision between two
     * pickers on one page is the kind of bug nobody looks for.
     */
    identify() {
        const base = this.o.idPrefix ?? this.list.id ?? FALLBACK_PREFIX;
        this.visibleOptions().forEach((option, i) => {
            if (!option.id) {
                option.id = `${base || FALLBACK_PREFIX}-option-${i}`;
                this.stampedIds.add(option);
            }
        });
    }

    /**
     * Mark one option current or not. Two carriers, as everywhere in this package: the attribute for assistive technology and for
     * tests, the class for CSS. @param {HTMLElement} option @param {boolean} current
     */
    mark(option, current) {
        if (!option.hasAttribute('aria-selected')) this.stampedSelected.add(option);
        option.setAttribute('aria-selected', String(current));
        option.classList.toggle(this.o.activeClass, current);
        if (!current) return;
        this.input.setAttribute('aria-activedescendant', option.id);
        // `nearest` rather than `center` by default: a list that jumps under the cursor on every keystroke is worse than one that
        // scrolls the minimum. Only the list's own scroll container moves, never the window: `scrollIntoView` propagates to every
        // ancestor, so an inline palette highlighting its first option on load threw the page to wherever the palette sat.
        const { scrollIntoView } = this.o;
        if (scrollIntoView !== false) scrollWithin(option, scrollIntoView === true ? 'nearest' : (scrollIntoView.block ?? 'nearest'));
    }

    /** Dispatch one of the list's events for the option at the current index. @param {string} type @param {HTMLElement | null} option */
    emit(type, option) {
        if (this.o.events) this.list.dispatchEvent(new CustomEvent(type, { bubbles: true, detail: { index: this.index, option } }));
    }

    /** Add a typed letter to the typeahead word; the word is forgotten after a pause. @param {string} letter */
    typed(letter) {
        clearTimeout(this.bufferTimer);
        this.buffer += letter;
        this.bufferTimer = window.setTimeout(() => (this.buffer = ''), this.o.typeaheadMs);
    }

    /** @param {number} next */
    highlight(next) {
        const all = this.visibleOptions();
        if (all.length === 0) {
            this.index = -1;
            this.input.removeAttribute('aria-activedescendant');
            this.o.onHighlight?.(-1, null);
            return;
        }
        this.identify();
        this.index = Math.max(0, Math.min(next, all.length - 1));
        all.forEach((option, i) => this.mark(option, i === this.index));
        const option = all[this.index] ?? null;
        this.o.onHighlight?.(this.index, option);
        this.emit(HIGHLIGHT_EVENT, option);
    }

    clear() {
        this.index = -1;
        this.input.removeAttribute('aria-activedescendant');
        for (const option of this.visibleOptions()) {
            // Recorded like highlight's stamp: a clear before any highlight left `aria-selected="false"` behind after destroy [scope-48].
            if (!option.hasAttribute('aria-selected')) this.stampedSelected.add(option);
            option.setAttribute('aria-selected', 'false');
            option.classList.remove(this.o.activeClass);
        }
    }

    /** @param {number} step */
    move(step) {
        const count = this.visibleOptions().length;
        if (count === 0) return;
        if (this.index === -1) {
            this.highlight(step > 0 ? 0 : count - 1);
            return;
        }
        const next = this.index + step;
        const { loop } = this.o;
        if (next < 0) this.highlight(loop ? count - 1 : 0);
        else if (next >= count) this.highlight(loop ? 0 : count - 1);
        else this.highlight(next);
    }

    /** Choose the highlighted option, as Enter would. @returns {boolean} whether there was one */
    choose() {
        const option = this.visibleOptions()[this.index];
        if (option === undefined) return false;
        this.o.onChoose?.(this.index, option);
        this.emit(CHOOSE_EVENT, option);
        return true;
    }
}
