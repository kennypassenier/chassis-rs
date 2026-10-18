// The quote card: your own earlier words, verbatim, with who wrote them and when [kpadopt6; the Life weekly summary that quotes you back to yourself].
//
//   <figure class="kp-quote" data-kp-quote data-kp-quote-date="2026-10-14T19:40:00+02:00" data-kp-quote-lang="nl" data-kp-quote-why="What helped last time">
//       <blockquote>Wandelen na het eten hielp</blockquote>
//   </figure>
//
// It is a display component. Choosing which quote to show, and never a negative one on a good or a rough day, is the
// application's job; the card makes the right thing easy: a Hide that is one press and can be undone, a line saying why it
// is here, and nothing that nags. A `.kp-card` in four states (js/card-state.js: loading as the card's busy card over a
// quote-shaped stage, empty, failed with a normal-size Retry, ready) around a `figure` > `blockquote` > `figcaption`
// with a `time` element that carries the ISO moment and, in its title, the exact `dd/mm/yyyy HH:mm` (rule 52).
//
// Options, each a markup attribute and a field of attachQuotes(root, options) (KT6); the default is what writing nothing gives:
//   data-kp-quote-by          who wrote it                                you (the dictionary's "You")
//   data-kp-quote-date        an ISO moment                               none: the line is left out
//   data-kp-quote-date-style  date | relative | both                      both ("Wednesday 14/10/2026 (3 days ago)")
//   data-kp-quote-lines       a number, or all                            4: a longer entry folds behind Show all, the whole text stays in the page
//   data-kp-quote-now         an ISO moment that "now" is for the relative words   the clock (a page with its own clock, a demo)
//   data-kp-quote-why         "A year ago today", "What helped last time" none
//   data-kp-quote-source      a link to the day the words were written    none
//   data-kp-quote-hide        present | off                               present
//   data-kp-quote-copy        present | off                               off
//   data-kp-quote-size        md | lg                                     md (lg for a hero place in the weekly summary)
//   data-kp-quote-lang        a BCP 47 tag on the words                   none (inherits)
//   data-kp-quote-max         on `[data-kp-quote-list]`: 1 to 5           3, then "Show all 7" (the exact number)
//   data-kp-undo-ms           the Undo window after Hide                  6000 (0 hides at once)
//   data-kp-announce          off | state | all                           state
//
// Hide waits for the Undo window, then fires `kp-quote-hide` on the card; the page stores it (call `wait(promise)` for a save:
// a refusal puts the card back and the toast says why). Keys, while the focus is in the card: `h` hides, Mod C copies when
// copy is on (and nothing is selected); both are on the `?` sheet. Fires `kp-quote-hide` `{ text, wait }`,
// `kp-quote-retry` and `kp-quote-fold` `{ expanded }`. Every word is in js/strings.js; nothing runs on import.

import { getStrings } from './strings.js';
import { agoMoment } from './freshness.js';
import { attachCardStates, setCardState } from './card-state.js';
import { undoToast } from './undo-toast.js';
import { registerShortcuts } from './shortcuts.js';

/** A quote card. */
export const QUOTE = '[data-kp-quote]';
/** A list of quote cards. */
export const QUOTE_LIST = '[data-kp-quote-list]';
/** Fired on the card when a hide is committed (the Undo window passed): `{ text, wait }`. */
export const QUOTE_HIDE_EVENT = 'kp-quote-hide';
/** Fired on the card when Retry is pressed on a failed card. */
export const QUOTE_RETRY_EVENT = 'kp-quote-retry';
/** Fired on the card when a long quote is opened or folded: `{ expanded }`. */
export const QUOTE_FOLD_EVENT = 'kp-quote-fold';
/** The states a quote card can be in. */
export const QUOTE_STATES = /** @type {const} */ (['ready', 'loading', 'empty', 'error']);
/** How many lines a quote shows before it folds. */
export const QUOTE_LINES = 4;
/** How many quotes a list shows before "Show all". */
export const QUOTE_LIST_MAX = 3;

/**
 * @typedef {object} QuoteModel
 * @property {HTMLElement} el
 * @property {string} text
 * @property {boolean} expanded
 * @property {boolean} hiding
 * @property {HTMLElement | null} textEl
 * @property {HTMLButtonElement | null} more
 * @property {HTMLElement} live
 * @property {() => void} unkey
 * @property {ResizeObserver | null} resize
 * @property {number} copyTimer
 */

/** @type {WeakMap<Element, QuoteModel>} */
const models = new WeakMap();

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag @param {string} [className] @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
};

/** @param {QuoteModel} m @param {string} name @returns {string | undefined} */
const attr = (m, name) => m.el.getAttribute(`data-kp-quote-${name}`) ?? undefined;

/** The whole days between two moments, by the Brussels calendar. @param {number} from @param {number} to */
function daysBetween(from, to) {
    /** @param {number} ms */
    const dayNumber = (ms) => {
        const [d = '1', mo = '1', y = '1970'] = agoMoment(ms).slice(0, 10).split('/');
        return Date.UTC(Number(y), Number(mo) - 1, Number(d)) / 86_400_000;
    };
    return Math.round(dayNumber(to) - dayNumber(from));
}

/**
 * The date line: "Tuesday 14/10/2026", "3 days ago" or both (rule 52). Pure.
 * @param {number} ms the moment
 * @param {'date' | 'relative' | 'both'} style
 * @param {number} [now]
 * @param {string} [locale]
 */
export function quoteWhen(ms, style = 'both', now = Date.now(), locale = 'en-GB') {
    const s = getStrings();
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'Europe/Brussels' }).format(ms);
    const date = s.quoteDay(weekday, agoMoment(ms).slice(0, 10));
    const relative = s.quoteRelative(daysBetween(ms, now));
    return style === 'relative' ? relative : style === 'both' ? s.quoteBoth(date, relative) : date;
}

/** @param {QuoteModel} m @param {string} text */
function say(m, text) {
    if ((m.el.getAttribute('data-kp-announce') ?? 'state') === 'off') return;
    m.live.textContent = '';
    window.setTimeout(() => {
        m.live.textContent = text;
    }, 30);
}

/** Whether a folded quote has more than it shows. @param {QuoteModel} m */
function measureFold(m) {
    const { textEl, more } = m;
    if (!textEl || !more) return;
    const lines = attr(m, 'lines') ?? String(QUOTE_LINES);
    const folds = lines !== 'all' && Number(lines) > 0;
    const open = m.expanded || !folds;
    // Measured by folding and unfolding: the height the words would have, against the height they have folded.
    textEl.removeAttribute('data-kp-folded');
    const whole = textEl.getBoundingClientRect().height;
    textEl.toggleAttribute('data-kp-folded', !open);
    const shown = textEl.getBoundingClientRect().height;
    const overflows = open ? m.expanded : whole - shown > 1;
    more.hidden = !(folds && overflows);
    more.setAttribute('aria-expanded', String(m.expanded));
    more.textContent = m.expanded ? getStrings().quoteShowLess : getStrings().quoteShowAll;
}

/** Draw the quote's parts from its attributes and its text. @param {QuoteModel} m */
function render(m) {
    const { el } = m;
    const s = getStrings();
    const stage = /** @type {HTMLElement} */ (el.querySelector(':scope > .kp-card__stage'));
    const data = /** @type {HTMLElement} */ (stage.querySelector(':scope > .kp-card__data'));
    el.classList.toggle('kp-quote--lg', attr(m, 'size') === 'lg');
    el.style.setProperty('--kp-quote-lines', attr(m, 'lines') === 'all' ? 'none' : String(Number(attr(m, 'lines')) || QUOTE_LINES));
    /** @type {HTMLElement[]} */
    const parts = [];
    const why = attr(m, 'why');
    if (why) parts.push(make('p', 'kp-quote__why', why));
    const text = make('blockquote', 'kp-quote__text', m.text);
    const lang = attr(m, 'lang');
    if (lang) text.setAttribute('lang', lang);
    const source = attr(m, 'source');
    if (source) text.setAttribute('cite', source);
    m.textEl = text;
    parts.push(text);
    const more = make('button', 'kp-button kp-button--sm kp-quote__more');
    more.type = 'button';
    more.hidden = true;
    m.more = more;
    parts.push(more);
    const caption = make('figcaption', 'kp-quote__caption');
    const by = make('span', 'kp-quote__by', attr(m, 'by') ?? s.quoteBy);
    const dateRaw = attr(m, 'date');
    const ms = dateRaw ? Date.parse(dateRaw) : Number.NaN;
    if (Number.isFinite(ms)) {
        const style = attr(m, 'date-style');
        const nowRaw = Date.parse(attr(m, 'now') ?? '');
        const when = make(
            'time',
            'kp-quote__when',
            quoteWhen(ms, style === 'relative' || style === 'date' ? style : 'both', Number.isFinite(nowRaw) ? nowRaw : Date.now()),
        );
        when.setAttribute('datetime', new Date(ms).toISOString());
        when.title = agoMoment(ms);
        caption.append(by, when);
    } else caption.append(by);
    if (source) {
        const link = make('a', 'kp-quote__source', s.quoteOpen);
        link.href = source;
        caption.append(link);
    }
    parts.push(caption);
    const actions = make('div', 'kp-quote__actions');
    if (attr(m, 'hide') !== 'off') {
        const hide = make('button', 'kp-button kp-button--sm kp-quote__hide', s.quoteHide);
        hide.type = 'button';
        hide.disabled = m.hiding;
        if (m.hiding) hide.setAttribute('data-kp-disabled-reason', s.quoteHiding);
        actions.append(hide);
    }
    if (attr(m, 'copy') !== undefined && attr(m, 'copy') !== 'off') {
        const copy = make('button', 'kp-button kp-button--sm kp-quote__copy', s.quoteCopy);
        copy.type = 'button';
        actions.append(copy);
    }
    if (actions.childElementCount > 0) parts.push(actions);
    data.replaceChildren(...parts);
    measureFold(m);
}

/** @param {QuoteModel} m */
function hide(m) {
    if (m.hiding || attr(m, 'hide') === 'off') return;
    const s = getStrings();
    const { el } = m;
    m.hiding = true;
    const ms = el.hasAttribute('data-kp-undo-ms') ? Number(el.getAttribute('data-kp-undo-ms')) : 6000;
    // The card goes at once and comes back on Undo; the page hears about it when the window closes. The focus moves on
    // to the next card's first control (or the one before it), so the keyboard keeps its place.
    const hadFocus = el.contains(el.ownerDocument.activeElement);
    const next = [el.nextElementSibling, el.previousElementSibling].find((node) => node instanceof HTMLElement && !node.hidden);
    el.hidden = true;
    if (hadFocus) /** @type {HTMLElement | null} */ (next?.querySelector('button, a') ?? null)?.focus();
    const toast = undoToast(s.quoteHideDone, {
        ms,
        commit: () => {
            /** @type {Promise<unknown>[]} */
            const waits = [];
            el.dispatchEvent(
                new CustomEvent(QUOTE_HIDE_EVENT, {
                    bubbles: true,
                    detail: { text: m.text, wait: (/** @type {Promise<unknown>} */ promise) => void waits.push(promise) },
                }),
            );
            return Promise.all(waits);
        },
        undo: () => {
            el.hidden = false;
            m.hiding = false;
            measureFold(m);
            if (hadFocus) /** @type {HTMLElement | null} */ (el.querySelector('.kp-quote__hide'))?.focus();
        },
    });
    void toast.done.then((outcome) => {
        if (outcome === 'failed') {
            el.hidden = false;
            m.hiding = false;
        }
        if (outcome === 'committed' || outcome === 'left') m.hiding = false;
    });
    say(m, s.quoteAnnounceHidden);
}

/** @param {QuoteModel} m */
async function copy(m) {
    const s = getStrings();
    const button = /** @type {HTMLButtonElement | null} */ (m.el.querySelector('.kp-quote__copy'));
    try {
        await navigator.clipboard.writeText(m.text);
        if (button) {
            button.textContent = s.quoteCopied;
            window.clearTimeout(m.copyTimer);
            m.copyTimer = window.setTimeout(() => {
                button.textContent = getStrings().quoteCopy;
            }, 1500);
        }
        say(m, s.quoteCopied);
    } catch {
        say(m, s.quoteCopyFailed);
        if (button) {
            button.textContent = s.quoteCopyFailed;
            window.clearTimeout(m.copyTimer);
            m.copyTimer = window.setTimeout(() => {
                button.textContent = getStrings().quoteCopy;
            }, 1500);
        }
    }
}

/**
 * The text of a quote written in markup: its `data-kp-quote-text`, else its blockquote, else its own words.
 * @param {HTMLElement} el
 */
function textOf(el) {
    return (el.getAttribute('data-kp-quote-text') ?? el.querySelector(':scope > blockquote')?.textContent ?? el.textContent ?? '').trim();
}

/**
 * @typedef {object} QuoteOptions
 * @property {number} [lines] how many lines before it folds (default 4)
 * @property {boolean} [copy] show Copy (default false)
 */

/** @param {HTMLElement} el @param {QuoteOptions} options @returns {() => void} */
function wire(el, options) {
    const before = [...el.childNodes];
    const text = textOf(el);
    if (!el.classList.contains('kp-card')) el.classList.add('kp-card');
    if (!el.classList.contains('kp-quote')) el.classList.add('kp-quote');
    const stage = make('div', 'kp-card__stage');
    const data = make('div', 'kp-card__data');
    const live = make('span', 'kp-sr-only kp-quote__live');
    live.setAttribute('role', 'status');
    stage.append(data);
    el.replaceChildren(stage, live);
    if (options.lines !== undefined && !el.hasAttribute('data-kp-quote-lines')) el.setAttribute('data-kp-quote-lines', String(options.lines));
    if (options.copy && !el.hasAttribute('data-kp-quote-copy')) el.setAttribute('data-kp-quote-copy', '');
    /** @type {QuoteModel} */
    const m = { el, text, expanded: false, hiding: false, textEl: null, more: null, live, unkey: () => {}, resize: null, copyTimer: 0 };
    models.set(el, m);
    // The card's own height while it waits: a quote of three lines and its caption.
    const states = attachCardStates(el);
    render(m);
    /** @param {MouseEvent} event */
    const onClick = (event) => {
        const button = event.target instanceof Element ? event.target.closest('button') : null;
        if (!button || !el.contains(button)) return;
        if (button.classList.contains('kp-quote__more')) {
            m.expanded = !m.expanded;
            measureFold(m);
            el.dispatchEvent(new CustomEvent(QUOTE_FOLD_EVENT, { bubbles: true, detail: { expanded: m.expanded } }));
        } else if (button.classList.contains('kp-quote__hide')) hide(m);
        else if (button.classList.contains('kp-quote__copy')) void copy(m);
    };
    const onRetry = () => el.dispatchEvent(new CustomEvent(QUOTE_RETRY_EVENT, { bubbles: true }));
    // A failed card's Retry is a normal-size button, not the card's small one.
    const onState = () => {
        for (const retry of el.querySelectorAll('.kp-card__retry')) retry.classList.remove('kp-button--sm');
    };
    el.addEventListener('click', onClick);
    el.addEventListener('kp-card-retry', onRetry);
    el.addEventListener('kp-card-state', onState);
    m.unkey = registerShortcuts(el, [
        {
            keys: 'h',
            what: getStrings().quoteHide,
            group: 'Quote',
            when: () => el.contains(document.activeElement) && attr(m, 'hide') !== 'off' && !el.hidden,
            run: () => hide(m),
        },
        {
            keys: 'Mod C',
            what: getStrings().quoteCopy,
            group: 'Quote',
            when: () =>
                el.contains(document.activeElement) &&
                attr(m, 'copy') !== undefined &&
                attr(m, 'copy') !== 'off' &&
                (window.getSelection()?.isCollapsed ?? true),
            run: () => void copy(m),
        },
    ]);
    if (typeof ResizeObserver !== 'undefined') {
        m.resize = new ResizeObserver(() => measureFold(m));
        m.resize.observe(el);
    }
    const watch = new MutationObserver(() => render(m));
    watch.observe(el, {
        attributes: true,
        attributeFilter: [
            'data-kp-quote-by',
            'data-kp-quote-date',
            'data-kp-quote-date-style',
            'data-kp-quote-now',
            'data-kp-quote-lines',
            'data-kp-quote-why',
            'data-kp-quote-source',
            'data-kp-quote-hide',
            'data-kp-quote-copy',
            'data-kp-quote-size',
            'data-kp-quote-lang',
        ],
    });
    return () => {
        watch.disconnect();
        m.resize?.disconnect();
        m.unkey();
        window.clearTimeout(m.copyTimer);
        states();
        el.removeEventListener('click', onClick);
        el.removeEventListener('kp-card-retry', onRetry);
        el.removeEventListener('kp-card-state', onState);
        el.replaceChildren(...before);
        el.style.removeProperty('--kp-quote-lines');
        models.delete(el);
    };
}

/**
 * Show the first `max` quotes of a list and a button for the rest ("Show all 7", the exact number).
 * @param {HTMLElement} list
 * @returns {() => void}
 */
function wireList(list) {
    const more = make('button', 'kp-button kp-quote-list__more');
    more.type = 'button';
    let open = false;
    const items = () =>
        [...list.querySelectorAll(':scope > .kp-quote, :scope > li')].filter(
            (node) => !(node instanceof HTMLElement && node.dataset.kpQuoteGone !== undefined),
        );
    const sync = () => {
        const s = getStrings();
        const max = Math.min(5, Math.max(1, Number(list.getAttribute('data-kp-quote-max')) || QUOTE_LIST_MAX));
        const all = items().filter((node) => !(node instanceof HTMLElement && node.hidden && node.dataset.kpQuoteListHidden === undefined));
        all.forEach((node, i) => {
            if (!(node instanceof HTMLElement)) return;
            const beyond = i >= max && !open;
            if (beyond) {
                node.hidden = true;
                node.dataset.kpQuoteListHidden = '';
            } else if (node.dataset.kpQuoteListHidden !== undefined) {
                node.hidden = false;
                delete node.dataset.kpQuoteListHidden;
            }
        });
        const total = all.length;
        more.hidden = total <= max;
        more.textContent = open ? s.quoteShowFewer : s.quoteShowAllN(total);
        more.setAttribute('aria-expanded', String(open));
    };
    list.append(more);
    if (!list.hasAttribute('aria-label') && !list.hasAttribute('aria-labelledby')) list.setAttribute('aria-label', getStrings().quoteListName);
    list.setAttribute('role', 'group');
    const onClick = (/** @type {MouseEvent} */ event) => {
        if (event.target !== more) return;
        open = !open;
        sync();
    };
    list.addEventListener('click', onClick);
    const watch = new MutationObserver(sync);
    watch.observe(list, { childList: true, attributes: true, attributeFilter: ['data-kp-quote-max'] });
    sync();
    return () => {
        watch.disconnect();
        list.removeEventListener('click', onClick);
        more.remove();
    };
}

/**
 * Wire every quote card and quote list under `root`.
 * @param {ParentNode} [root]
 * @param {QuoteOptions} [options] defaults; each card's own `data-kp-quote-*` wins
 * @returns {() => void} detach
 */
export function attachQuotes(root = document, options = {}) {
    /** @type {(() => void)[]} */
    const undo = [];
    const cards = /** @type {HTMLElement[]} */ ([
        ...(root instanceof HTMLElement && root.matches(QUOTE) ? [root] : []),
        ...root.querySelectorAll(QUOTE),
    ]);
    for (const el of cards) if (!models.has(el)) undo.push(wire(el, options));
    const lists = /** @type {HTMLElement[]} */ ([
        ...(root instanceof HTMLElement && root.matches(QUOTE_LIST) ? [root] : []),
        ...root.querySelectorAll(QUOTE_LIST),
    ]);
    for (const list of lists)
        if (list.dataset.kpQuoteListAttached === undefined) {
            list.dataset.kpQuoteListAttached = '';
            const off = wireList(list);
            undo.push(() => {
                off();
                delete list.dataset.kpQuoteListAttached;
            });
        }
    return () => undo.splice(0).forEach((off) => off());
}

/**
 * @typedef {object} QuoteSpec
 * @property {string} text the words, verbatim
 * @property {string} [by] @property {string} [date] ISO moment @property {'date' | 'relative' | 'both'} [dateStyle]
 * @property {string} [why] @property {string} [source] @property {string} [lang]
 * @property {number | 'all'} [lines] @property {boolean} [hide] @property {boolean} [copy] @property {'md' | 'lg'} [size]
 */

/**
 * Write a quote's words and options from a script. The card is attached if it is not yet.
 * @param {HTMLElement} el a `figure.kp-quote`
 * @param {QuoteSpec} spec
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
    if (!models.has(el)) el.setAttribute('data-kp-quote-text', spec.text);
    for (const [name, value] of Object.entries(wanted)) {
        if (value === null) el.removeAttribute(name);
        else el.setAttribute(name, value);
    }
    if (!models.has(el)) {
        el.setAttribute('data-kp-quote', '');
        attachQuotes(el);
        return;
    }
    const m = /** @type {QuoteModel} */ (models.get(el));
    m.text = spec.text;
    m.expanded = false;
    render(m);
}

/**
 * The state of a quote card: `loading` (the card's busy card over a quote-shaped stage), `empty`, `error` (with Retry,
 * `kp-quote-retry`), `ready`.
 * @param {HTMLElement} el
 * @param {'ready' | 'loading' | 'empty' | 'error'} state
 * @param {{ title?: string, text?: string, words?: string }} [words] the words of the state, instead of the dictionary's
 */
export function setQuoteState(el, state, words = {}) {
    const m = models.get(el);
    if (!m) return;
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
 * @typedef {object} QuoteHandle
 * @property {HTMLElement} element
 * @property {() => string} text the words as written
 * @property {(spec: QuoteSpec) => void} set
 * @property {(state: 'ready' | 'loading' | 'empty' | 'error') => void} setState
 * @property {() => void} hide hide it as a press on Hide does
 */

/**
 * The handle of an attached quote card.
 * @param {Element} element
 * @returns {QuoteHandle | null}
 */
export function quote(element) {
    const m = models.get(element);
    if (!m) return null;
    return {
        element: m.el,
        text: () => m.text,
        set: (spec) => setQuote(m.el, spec),
        setState: (state) => setQuoteState(m.el, state),
        hide: () => hide(m),
    };
}
