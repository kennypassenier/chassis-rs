// One selection bar: its memory on the instance, its parts, the sources it reads (their ticks, their redraws), its
// options read live, and its buttons and Esc.

import { Controller } from '../controller.js';
import { rowSelect } from '../row-select.js';
import { getStrings } from '../strings.js';
import { draw, parts, say, sync, untick } from './draw.js';
import { BOX, SELECTION_ACTION_EVENT, SELECTION_CLEAR_EVENT, SELECTION_EVENT, SELECTION_MATCHING_EVENT, sourcesOf } from './model.js';

/** @typedef {import('./model.js').Memory} Memory */
/** @typedef {import('../selection-bar.js').SelectionOptions} SelectionOptions */

/** How long an action's Undo is offered when the bar names no `data-kp-undo-ms` [ms]. */
const UNDO_MS = 6000;
/** The bar's options a page may change later. */
const OPTIONS = ['data-kp-selection-names', 'data-kp-selection-max', 'data-kp-select-matching'];
/** The events of a source that may change what is ticked. */
const SOURCE_EVENTS = ['change', 'kp-datatable-select', 'kp-rows-select'];

export class SelectionBar extends Controller {
    /** @param {HTMLElement} bar @param {SelectionOptions} [options] */
    constructor(bar, options = {}) {
        super(bar, options);
        this.doc = bar.ownerDocument;
        this.queued = false;
        /** @type {Memory} */
        this.memory = {
            sources: [],
            items: [],
            known: new Set(),
            manual: false,
            matchingTotal: 0,
            matching: false,
            namesOpen: false,
            busy: '',
            progress: null,
            rules: {},
            sayTimer: 0,
            refresh: () => sync(bar, this.memory),
        };
    }

    connect() {
        const bar = this.host;
        const options = /** @type {SelectionOptions} */ (this.options);
        const placement = options.placement ?? bar.getAttribute('data-kp-placement') ?? 'sticky-top';
        bar.setAttribute('data-kp-placement', ['inline', 'floating-bottom'].includes(placement) ? placement : 'sticky-top');
        if (options.names) bar.setAttribute('data-kp-selection-names', options.names);
        if (options.maxNames) bar.setAttribute('data-kp-selection-max', String(options.maxNames));
        this.memory.matchingTotal = Number(options.matching ?? bar.getAttribute('data-kp-select-matching')) || 0;
        this.memory.sources = sourcesOf(bar);
        parts(bar, this.memory);
        const view = this.doc.defaultView;
        const watching = view && 'MutationObserver' in view;
        // A page that changes the bar's options later is heard at once.
        if (watching) this.observe(new view.MutationObserver(() => this.onOptions())).observe(bar, { attributes: true, attributeFilter: OPTIONS });
        for (const source of this.memory.sources) for (const type of SOURCE_EVENTS) this.listen(source, type, (event) => this.onSourceEvent(event));
        // A refresh draws rows again: read them again.
        if (watching)
            for (const source of this.memory.sources) this.observe(new view.MutationObserver(() => this.refresh())).observe(source, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
        this.listen(bar, 'click', (event) => this.onClick(/** @type {MouseEvent} */ (event)));
        this.listen(this.doc, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        sync(bar, this.memory);
    }

    onOptions() {
        this.memory.matchingTotal = Number(this.host.getAttribute('data-kp-select-matching')) || 0;
        if (!this.memory.matchingTotal) this.memory.matching = false;
        draw(this.host, this.memory);
    }

    /** Read the sources again at the end of this task, once for a burst. */
    refresh() {
        if (this.queued) return;
        this.queued = true;
        queueMicrotask(() => {
            this.queued = false;
            sync(this.host, this.memory);
        });
    }

    /** @param {Event} event */
    onSourceEvent(event) {
        if (event.type === 'change' && !(event.target instanceof Element && event.target.matches(`${BOX}, [data-kp-select-all]`))) return;
        if (!this.memory.manual) this.refresh();
    }

    /** @param {MouseEvent} event */
    onClick(event) {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        if (target.closest('.kp-selection__clear')) return this.clear();
        if (target.closest('.kp-selection__more')) return this.toggleNames();
        const take = target.closest('[data-kp-selection-take]');
        if (take) return this.take(take.getAttribute('data-kp-selection-take') === 'on');
        const toggle = target.closest('.kp-selection__toggle');
        if (toggle) {
            const open = toggle.getAttribute('aria-expanded') !== 'true';
            toggle.setAttribute('aria-expanded', String(open));
            this.host.toggleAttribute('data-kp-selection-open', open);
            return;
        }
        const button = /** @type {HTMLElement | null} */ (target.closest('[data-kp-selection-action]'));
        if (button) this.act(event, button);
    }

    /** Untick all, or empty a bar fed by hand, and say which keys were selected. */
    clear() {
        const bar = this.host;
        const memory = this.memory;
        const keys = memory.items.map((i) => i.key);
        memory.matching = false;
        if (memory.manual) {
            memory.items = [];
            draw(bar, memory);
            bar.dispatchEvent(new CustomEvent(SELECTION_EVENT, { bubbles: true, detail: { keys: [], items: [], count: 0, matching: false } }));
        } else untick(memory);
        bar.dispatchEvent(new CustomEvent(SELECTION_CLEAR_EVENT, { bubbles: true, detail: { keys } }));
    }

    toggleNames() {
        this.memory.namesOpen = !this.memory.namesOpen;
        draw(this.host, this.memory);
        /** @type {HTMLElement | null} */ (this.host.querySelector('.kp-selection__more'))?.focus();
    }

    /** Take, or give back, the offer for every matching row. @param {boolean} on */
    take(on) {
        const bar = this.host;
        const memory = this.memory;
        memory.matching = on;
        draw(bar, memory);
        bar.dispatchEvent(new CustomEvent(SELECTION_MATCHING_EVENT, { bubbles: true, detail: { matching: memory.matching, total: memory.matchingTotal } }));
        say(bar, memory, memory.matching ? getStrings().selectionMatchingOn(memory.matchingTotal) : getStrings().selectionCount(memory.items.length));
        /** @type {HTMLElement | null} */ (bar.querySelector('.kp-selection__take'))?.focus();
    }

    /** An action button: refused while it is off, else told to the page with what is selected. @param {MouseEvent} event @param {HTMLElement} button */
    act(event, button) {
        if (button.getAttribute('aria-disabled') === 'true') {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }
        const memory = this.memory;
        const detail = {
            action: button.getAttribute('data-kp-selection-action') ?? '',
            button,
            keys: memory.items.map((i) => i.key),
            items: memory.items,
            matching: memory.matching,
            undoMs: Number(this.host.getAttribute('data-kp-undo-ms') ?? UNDO_MS),
        };
        this.host.dispatchEvent(new CustomEvent(SELECTION_ACTION_EVENT, { bubbles: true, cancelable: true, detail }));
    }

    /** Esc unticks all while the focus is in the bar or its list. @param {KeyboardEvent} event */
    onKey(event) {
        const memory = this.memory;
        if (event.key !== 'Escape' || event.defaultPrevented || memory.items.length === 0 || memory.busy) return;
        const target = event.target instanceof Node ? event.target : null;
        const inside = target !== null && (this.host.contains(target) || memory.sources.some((s) => s.contains(target)));
        if (!inside || (target instanceof Element && target.closest('input:not([data-kp-select-row]), textarea, select, dialog[open]'))) return;
        // The row keys (js/row-select.js) handle Esc inside a list themselves.
        if (target instanceof Element && memory.sources.some((s) => rowSelect(s) && s.contains(target))) return;
        event.preventDefault();
        this.host.querySelector('.kp-selection__clear')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
}
