// IntentFilter: the intent matcher's side of one palette: rank, cap, mark, the status line and the plates.
import { OPTION_SELECTOR } from '../listbox.js';
import { getStrings } from '../strings.js';
import { INTENT_MAX_SHOWN, intentWords, noMatchText, queryWords } from '../intent.js';
import { openBusyCard } from '../busy-card.js';
import { clearMarks, markWords, place, setHidden, unitOf } from './intent-dom.js';
import { orderCommands, rankCommands } from './intent-rank.js';
import { ListPlate } from './intent-plate.js';
/** @typedef {import('./intent-dom.js').IntentMode} IntentMode */
/** @typedef {import('./intent-rank.js').Ranked} Ranked */

/** How far a command the consumer added later stands after the command before it. */
const LATE_STEP = 0.001;

/**
 * The intent matcher's side of one palette: score every command, hide what does not answer, put the best answer first in its
 * group, mark the matched words, keep the status line exact, and stand an empty or failed plate in the list's footprint. The
 * commands stay the consumer's markup; this only hides, moves and marks them, and gives all of it back on destroy().
 */
export class IntentFilter {
    /** @param {HTMLDialogElement} dialog @param {HTMLElement} list @param {HTMLElement | null} status */
    constructor(dialog, list, status) {
        this.dialog = dialog;
        this.list = list;
        this.status = status;
        this.doc = dialog.ownerDocument;
        /** Where each command stood in the markup, so the order comes back when nothing is typed. @type {WeakMap<Element, number>} */
        this.origin = new WeakMap();
        /** @type {WeakMap<Element, number>} */
        this.groupOrigin = new WeakMap();
        /** @type {import('../busy-card.js').BusyCard | null} */
        this.busy = null;
        /** @type {'ready' | 'loading' | 'error'} */
        this.state = 'ready';
        /** @type {{ message?: string }} */
        this.stateOptions = {};
        this.plate = new ListPlate(dialog, list);
    }

    /** @returns {IntentMode} */
    mode() {
        const dialog = this.dialog;
        return {
            foldDiacritics: dialog.dataset.kpFoldDiacritics !== 'off',
            splitHyphen: dialog.dataset.kpSplitHyphen !== 'off',
            typo: /** @type {0 | 1} */ (dialog.dataset.kpTypo === '1' ? 1 : 0),
        };
    }

    /** @param {HTMLElement[]} options */
    assignOrigins(options) {
        let previous = -1;
        options.forEach((option, index) => {
            let at = this.origin.get(option);
            if (at === undefined) {
                at = previous < 0 ? index : previous + LATE_STEP;
                this.origin.set(option, at);
            }
            previous = at;
        });
        for (const [index, group] of [...this.list.querySelectorAll('[data-kp-group]')].entries()) if (!this.groupOrigin.has(group)) this.groupOrigin.set(group, index);
    }

    recentKey() {
        return `kp-recent:palette:${this.dialog.id || 'palette'}`;
    }

    /** The values chosen last, newest first. @returns {string[]} */
    readRecent() {
        try {
            const raw = JSON.parse(globalThis.localStorage?.getItem(this.recentKey()) ?? '[]');
            return Array.isArray(raw) ? raw.map(String) : [];
        } catch {
            // No storage, or a value that is not ours: no memory, the palette still works.
            return [];
        }
    }

    /**
     * Filter, rank and mark for `rawQuery`.
     * @param {string} rawQuery
     * @returns {number} how many commands are shown
     */
    run(rawQuery) {
        const mode = this.mode();
        const want = queryWords(rawQuery, mode);
        this.plate.measure();
        const options = /** @type {HTMLElement[]} */ ([...this.list.querySelectorAll(OPTION_SELECTOR)]);
        this.assignOrigins(options);
        const { items, startSet } = rankCommands(this, options, want, mode);
        const total = items.filter((it) => it.score >= 0).length;
        orderCommands(this, items, want);
        const shown = this.show(items, want, mode, want.length > 0 || startSet);
        this.writeStatus(shown, total);
        this.plateFor(rawQuery, want, mode, options, shown);
        return shown;
    }

    /**
     * Which are shown: the answers, up to the cap when a query (or a start set) narrows them; the shown ones marked.
     * @param {Ranked[]} items @param {string[]} want @param {IntentMode} mode @param {boolean} capped
     * @returns {number} how many are shown
     */
    show(items, want, mode, capped) {
        const { list, dialog, doc } = this;
        const max = Math.max(1, Number(dialog.dataset.kpMaxShown) || INTENT_MAX_SHOWN);
        const byOption = new Map(items.map((it) => [it.option, it]));
        let shownCount = 0;
        for (const option of /** @type {HTMLElement[]} */ ([...list.querySelectorAll(OPTION_SELECTOR)])) {
            let show = (byOption.get(option)?.score ?? -1) >= 0;
            if (show && capped && shownCount >= max) show = false;
            if (show) shownCount += 1;
            setHidden(option, !show);
            const unit = unitOf(list, option);
            if (unit !== option) setHidden(unit, !show);
            clearMarks(doc, option);
            if (show && want.length > 0 && dialog.dataset.kpHighlight !== 'off') markWords(doc, option, want, mode);
        }
        for (const group of /** @type {HTMLElement[]} */ ([...list.querySelectorAll('[data-kp-group]')]))
            setHidden(group, group.querySelector(`${OPTION_SELECTOR}:not([hidden])`) === null);
        return shownCount;
    }

    /** The status line is exact; a cap says so. @param {number} shown @param {number} total */
    writeStatus(shown, total) {
        if (this.status === null) return;
        const s = getStrings();
        this.status.textContent = shown < total ? s.paletteCapped(shown, total) : shown === 0 ? s.noCommands : shown === 1 ? s.oneCommand : s.manyCommands(shown);
    }

    /**
     * A failed list stands the failed plate above the commands that stay; a query that found nothing, with `data-kp-nomatch="plate"`,
     * the empty plate that says what to try.
     * @param {string} rawQuery @param {string[]} want @param {IntentMode} mode @param {HTMLElement[]} options @param {number} shown
     */
    plateFor(rawQuery, want, mode, options, shown) {
        const { dialog } = this;
        const s = getStrings();
        if (this.state === 'error') return this.plate.show('error', s.paletteFailed, this.stateOptions.message ?? s.paletteFailedText, false);
        if (shown > 0 || want.length === 0 || dialog.dataset.kpNomatch !== 'plate') return this.plate.hide();
        const verbs = [...new Set(options.map((o) => o.dataset.kpVerb).filter((v) => v))];
        const verb = verbs.find((v) => want.length > 1 && intentWords(v ?? '', mode)[0]?.startsWith(want[0]));
        const subjects = verb
            ? options
                  .filter((o) => o.dataset.kpVerb === verb)
                  .map((o) => o.dataset.kpContextOf ?? '')
                  .filter(Boolean)
            : [];
        const hints = { verbs: verb ? [verb] : [], subjects, noun: dialog.dataset.kpSubjectName ?? '', hint: dialog.dataset.kpNomatchHint ?? '' };
        this.plate.show('empty', s.paletteNothing, noMatchText(rawQuery, hints, mode), true);
    }

    /** @param {'ready' | 'loading' | 'error'} next @param {{ message?: string }} [options] */
    setState(next, options = {}) {
        const list = this.list;
        this.state = next;
        this.stateOptions = options;
        if (next === 'loading' && !this.busy) {
            list.setAttribute('aria-busy', 'true');
            this.busy = openBusyCard(list, { words: getStrings().paletteLoading, area: () => [list], className: 'kp-palette__busy', arrive: this.dialog.open });
        } else if (next !== 'loading' && this.busy) {
            list.removeAttribute('aria-busy');
            const closing = this.busy;
            this.busy = null;
            void closing.close();
        }
    }

    /** Remember a chosen value, when the palette keeps `data-kp-recent` of them. @param {string} value */
    remember(value) {
        const n = Number(this.dialog.dataset.kpRecent) || 0;
        if (n <= 0 || value === '') return;
        try {
            globalThis.localStorage?.setItem(this.recentKey(), JSON.stringify([value, ...this.readRecent().filter((v) => v !== value)].slice(0, n)));
        } catch {
            /* no storage: no memory, the palette still works */
        }
    }

    /** Give everything back: the busy card, the plate, the marks, the label wraps and the markup's own order. */
    destroy() {
        const { list, doc } = this;
        this.busy?.remove();
        this.busy = null;
        list.removeAttribute('aria-busy');
        this.plate.remove();
        const options = /** @type {HTMLElement[]} */ ([...list.querySelectorAll(OPTION_SELECTOR)]);
        for (const option of options) {
            clearMarks(doc, option);
            for (const label of option.querySelectorAll(':scope > .kp-palette__label[data-kp-generated]')) label.replaceWith(...label.childNodes);
            option.normalize();
        }
        this.restoreOrder(options);
    }

    /** @param {HTMLElement[]} options */
    restoreOrder(options) {
        const { list, doc, origin } = this;
        /** @type {Map<HTMLElement, HTMLElement[]>} */
        const containers = new Map();
        for (const option of options) {
            const unit = unitOf(list, option);
            const parent = /** @type {HTMLElement} */ (unit.parentElement);
            containers.set(parent, [...(containers.get(parent) ?? []), unit]);
        }
        const at = (/** @type {HTMLElement} */ u) => origin.get(/** @type {Element} */ (u.matches(OPTION_SELECTOR) ? u : u.querySelector(OPTION_SELECTOR))) ?? 0;
        for (const [, units] of containers) place(doc, units.slice().sort((a, b) => at(a) - at(b)));
        const groups = /** @type {HTMLElement[]} */ ([...list.querySelectorAll('[data-kp-group]')]);
        place(doc, groups.slice().sort((a, b) => (this.groupOrigin.get(a) ?? 0) - (this.groupOrigin.get(b) ?? 0)));
    }
}

/**
 * The intent filter of one palette.
 * @param {HTMLDialogElement} dialog
 * @param {HTMLElement} list
 * @param {HTMLElement | null} status
 */
export function createIntentFilter(dialog, list, status) {
    return new IntentFilter(dialog, list, status);
}
