// One quote card: its words, the fold and hide state, its four states, the keys and the attribute watcher [kpadopt6].

import { Controller } from '../controller.js';
import { attachCardStates } from '../card-state.js';
import { registerShortcuts } from '../shortcuts.js';
import { getStrings } from '../strings.js';
import { copy, hide } from './actions.js';
import { QUOTE_FOLD_EVENT, QUOTE_RETRY_EVENT, WATCHED_ATTRIBUTES } from './constants.js';
import { attr, make, textOf } from './dom.js';
import { measureFold, render } from './render.js';

/** The controller of one `[data-kp-quote]` card. */
export class QuoteController extends Controller {
    /**
     * @param {HTMLElement} host the card
     * @param {import('./constants.js').QuoteOptions} [options] defaults; each card's own `data-kp-quote-*` wins
     */
    constructor(host, options = {}) {
        super(host, options);
        this.el = host;
        this.options = options;
        /** What the card held before it was drawn, put back on detach. */
        this.before = [...host.childNodes];
        /** The words, verbatim. */
        this.text = textOf(host);
        this.expanded = false;
        this.hiding = false;
        /** @type {HTMLElement | null} */
        this.textEl = null;
        /** @type {HTMLButtonElement | null} */
        this.more = null;
        /** The live line the card says things on. */
        this.live = make('span', 'kp-sr-only kp-quote__live');
        this.copyTimer = 0;
    }

    connect() {
        const el = this.el;
        const options = this.options;
        if (!el.classList.contains('kp-card')) el.classList.add('kp-card');
        if (!el.classList.contains('kp-quote')) el.classList.add('kp-quote');
        const stage = make('div', 'kp-card__stage');
        const data = make('div', 'kp-card__data');
        this.live.setAttribute('role', 'status');
        stage.append(data);
        el.replaceChildren(stage, this.live);
        if (options.lines !== undefined && !el.hasAttribute('data-kp-quote-lines')) el.setAttribute('data-kp-quote-lines', String(options.lines));
        if (options.copy && !el.hasAttribute('data-kp-quote-copy')) el.setAttribute('data-kp-quote-copy', '');
        this.own(() => this.undoDom());
        // The card's own height while it waits: a quote of three lines and its caption.
        this.own(attachCardStates(el));
        render(this);
        this.listen(el, 'click', (event) => this.onClick(/** @type {MouseEvent} */ (event)));
        this.listen(el, 'kp-card-retry', () => el.dispatchEvent(new CustomEvent(QUOTE_RETRY_EVENT, { bubbles: true })));
        // A failed card's Retry is a normal-size button, not the card's small one.
        this.listen(el, 'kp-card-state', () => {
            for (const retry of el.querySelectorAll('.kp-card__retry')) retry.classList.remove('kp-button--sm');
        });
        this.own(registerShortcuts(el, this.shortcuts()));
        this.own(() => window.clearTimeout(this.copyTimer));
        if (typeof ResizeObserver !== 'undefined') this.observe(new ResizeObserver(() => measureFold(this))).observe(el);
        this.observe(new MutationObserver(() => render(this))).observe(el, { attributes: true, attributeFilter: WATCHED_ATTRIBUTES });
    }

    /** The keys of a card: `h` hides, Mod C copies when copy is on and nothing is selected; both are on the `?` sheet. */
    shortcuts() {
        const el = this.el;
        return [
            {
                keys: 'h',
                what: getStrings().quoteHide,
                group: 'Quote',
                when: () => el.contains(document.activeElement) && attr(el, 'hide') !== 'off' && !el.hidden,
                run: () => hide(this),
            },
            {
                keys: 'Mod C',
                what: getStrings().quoteCopy,
                group: 'Quote',
                when: () =>
                    el.contains(document.activeElement) && attr(el, 'copy') !== undefined && attr(el, 'copy') !== 'off' && (window.getSelection()?.isCollapsed ?? true),
                run: () => void copy(this),
            },
        ];
    }

    /** Put back what the card held, and take the line count away. */
    undoDom() {
        this.el.replaceChildren(...this.before);
        this.el.style.removeProperty('--kp-quote-lines');
    }

    /** Fold or unfold, hide or copy. @param {MouseEvent} event */
    onClick(event) {
        const button = event.target instanceof Element ? event.target.closest('button') : null;
        if (!button || !this.el.contains(button)) return;
        if (button.classList.contains('kp-quote__more')) {
            this.expanded = !this.expanded;
            measureFold(this);
            this.el.dispatchEvent(new CustomEvent(QUOTE_FOLD_EVENT, { bubbles: true, detail: { expanded: this.expanded } }));
        } else if (button.classList.contains('kp-quote__hide')) hide(this);
        else if (button.classList.contains('kp-quote__copy')) void copy(this);
    }
}
