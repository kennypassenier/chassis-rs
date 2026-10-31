// The calls a page makes on a quote card: attach, write its words, set its state, and get its handle.

import { attachOne, controllerOf, hostsOf } from '../controller.js';
import { setCardState } from '../card-state.js';
import { getStrings } from '../strings.js';
import { hide } from './actions.js';
import { QUOTE, QUOTE_LIST } from './constants.js';
import { QuoteController } from './controller.js';
import { QuoteListController } from './list.js';
import { render } from './render.js';

/**
 * Wire every quote card and quote list under `root`.
 * @param {ParentNode} [root]
 * @param {import('./constants.js').QuoteOptions} [options] defaults; each card's own `data-kp-quote-*` wins
 * @returns {() => void} detach
 */
export function attachQuotes(root = document, options = {}) {
    const cards = hostsOf(root, QUOTE)
        .filter((el) => !controllerOf(el, QuoteController))
        .map((el) => attachOne(el, QuoteController, options));
    const lists = hostsOf(root, QUOTE_LIST)
        .filter((list) => list.dataset.kpQuoteListAttached === undefined)
        .map((list) => attachOne(list, QuoteListController));
    const made = [...cards, ...lists].filter((controller) => controller !== undefined);
    return () => {
        for (const controller of made.splice(0)) controller.destroy();
    };
}

/**
 * Write a quote's words and options from a script. The card is attached if it is not yet.
 * @param {HTMLElement} el a `figure.kp-quote`
 * @param {import('./constants.js').QuoteSpec} spec
 */
export function setQuote(el, spec) {
    /** @type {Record<string, string | null>} */
    const wanted = {
        'data-kp-quote-by': spec.by ?? null,
        'data-kp-quote-date': spec.date ?? null,
        'data-kp-quote-date-style': spec.dateStyle ?? null,
        'data-kp-quote-why': spec.why ?? null,
        'data-kp-quote-source': spec.source ?? null,
        'data-kp-quote-lang': spec.lang ?? null,
        'data-kp-quote-lines': spec.lines === undefined ? null : String(spec.lines),
        'data-kp-quote-hide': spec.hide === false ? 'off' : null,
        'data-kp-quote-copy': spec.copy ? '' : null,
        'data-kp-quote-size': spec.size ?? null,
    };
    if (!controllerOf(el, QuoteController)) el.setAttribute('data-kp-quote-text', spec.text);
    for (const [name, value] of Object.entries(wanted)) {
        if (value === null) el.removeAttribute(name);
        else el.setAttribute(name, value);
    }
    const card = controllerOf(el, QuoteController);
    if (!card) {
        el.setAttribute('data-kp-quote', '');
        attachQuotes(el);
        return;
    }
    card.text = spec.text;
    card.expanded = false;
    render(card);
}

/**
 * The state of a quote card: `loading` (the card's busy card over a quote-shaped stage), `empty`, `error` (with Retry,
 * `kp-quote-retry`), `ready`.
 * @param {HTMLElement} el
 * @param {'ready' | 'loading' | 'empty' | 'error'} state
 * @param {{ title?: string, text?: string, words?: string }} [words] the words of the state, instead of the dictionary's
 */
export function setQuoteState(el, state, words = {}) {
    if (!controllerOf(el, QuoteController)) return;
    const s = getStrings();
    if (state === 'empty') setCardState(el, 'empty', { title: words.title ?? s.quoteEmptyTitle, text: words.text ?? s.quoteEmptyText });
    else if (state === 'error') setCardState(el, 'error', { title: words.title ?? s.quoteFailedTitle, text: words.text ?? s.quoteFailedText });
    else if (state === 'loading') setCardState(el, 'loading', { words: words.words ?? s.quoteLoading });
    else setCardState(el, 'ready');
    for (const retry of el.querySelectorAll('.kp-card__retry')) {
        retry.classList.remove('kp-button--sm');
        retry.textContent = s.quoteRetry;
    }
}

/**
 * The handle of an attached quote card.
 * @param {Element} element
 * @returns {import('./constants.js').QuoteHandle | null}
 */
export function quote(element) {
    const card = controllerOf(element, QuoteController);
    if (!card) return null;
    return {
        element: card.el,
        text: () => card.text,
        set: (spec) => setQuote(card.el, spec),
        setState: (state) => setQuoteState(card.el, state),
        hide: () => hide(card),
    };
}
