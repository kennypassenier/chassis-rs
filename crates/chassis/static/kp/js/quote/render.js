// Draws a quote card's parts from its attributes and text, and measures whether a folded quote has more to show.

import { agoMoment } from '../freshness.js';
import { getStrings } from '../strings.js';
import { FOLD_SLACK_PX, QUOTE_LINES } from './constants.js';
import { attr, make } from './dom.js';
import { quoteWhen } from './when.js';

/** Whether a folded quote has more than it shows, and the words of the button. @param {import('./controller.js').QuoteController} c */
export function measureFold(c) {
    const { textEl, more } = c;
    if (!textEl || !more) return;
    const lines = attr(c.el, 'lines') ?? String(QUOTE_LINES);
    const folds = lines !== 'all' && Number(lines) > 0;
    const open = c.expanded || !folds;
    // Measured by folding and unfolding: the height the words would have, against the height they have folded.
    textEl.removeAttribute('data-kp-folded');
    const whole = textEl.getBoundingClientRect().height;
    textEl.toggleAttribute('data-kp-folded', !open);
    const shown = textEl.getBoundingClientRect().height;
    const overflows = open ? c.expanded : whole - shown > FOLD_SLACK_PX;
    more.hidden = !(folds && overflows);
    more.setAttribute('aria-expanded', String(c.expanded));
    more.textContent = c.expanded ? getStrings().quoteShowLess : getStrings().quoteShowAll;
}

/** The caption: who, when (the ISO moment, the exact one in the title) and the link to the day. @param {import('./controller.js').QuoteController} c */
function captionOf(c) {
    const el = c.el;
    const s = getStrings();
    const caption = make('figcaption', 'kp-quote__caption');
    const by = make('span', 'kp-quote__by', attr(el, 'by') ?? s.quoteBy);
    const dateRaw = attr(el, 'date');
    const ms = dateRaw ? Date.parse(dateRaw) : Number.NaN;
    if (Number.isFinite(ms)) {
        const style = attr(el, 'date-style');
        const nowRaw = Date.parse(attr(el, 'now') ?? '');
        const when = make('time', 'kp-quote__when', quoteWhen(ms, style === 'relative' || style === 'date' ? style : 'both', Number.isFinite(nowRaw) ? nowRaw : Date.now()));
        when.setAttribute('datetime', new Date(ms).toISOString());
        when.title = agoMoment(ms);
        caption.append(by, when);
    } else caption.append(by);
    const source = attr(el, 'source');
    if (source) {
        const link = make('a', 'kp-quote__source', s.quoteOpen);
        link.href = source;
        caption.append(link);
    }
    return caption;
}

/** The Hide and Copy buttons, as the card's attributes ask. @param {import('./controller.js').QuoteController} c */
function actionsOf(c) {
    const el = c.el;
    const s = getStrings();
    const actions = make('div', 'kp-quote__actions');
    if (attr(el, 'hide') !== 'off') {
        const hide = make('button', 'kp-button kp-button--sm kp-quote__hide', s.quoteHide);
        hide.type = 'button';
        hide.disabled = c.hiding;
        if (c.hiding) hide.setAttribute('data-kp-disabled-reason', s.quoteHiding);
        actions.append(hide);
    }
    if (attr(el, 'copy') !== undefined && attr(el, 'copy') !== 'off') {
        const copy = make('button', 'kp-button kp-button--sm kp-quote__copy', s.quoteCopy);
        copy.type = 'button';
        actions.append(copy);
    }
    return actions;
}

/** Draw the quote's parts from its attributes and its text. @param {import('./controller.js').QuoteController} c */
export function render(c) {
    const el = c.el;
    const stage = /** @type {HTMLElement} */ (el.querySelector(':scope > .kp-card__stage'));
    const data = /** @type {HTMLElement} */ (stage.querySelector(':scope > .kp-card__data'));
    el.classList.toggle('kp-quote--lg', attr(el, 'size') === 'lg');
    el.style.setProperty('--kp-quote-lines', attr(el, 'lines') === 'all' ? 'none' : String(Number(attr(el, 'lines')) || QUOTE_LINES));
    /** @type {HTMLElement[]} */
    const parts = [];
    const why = attr(el, 'why');
    if (why) parts.push(make('p', 'kp-quote__why', why));
    const text = make('blockquote', 'kp-quote__text', c.text);
    const lang = attr(el, 'lang');
    if (lang) text.setAttribute('lang', lang);
    const source = attr(el, 'source');
    if (source) text.setAttribute('cite', source);
    c.textEl = text;
    parts.push(text);
    const more = make('button', 'kp-button kp-button--sm kp-quote__more');
    more.type = 'button';
    more.hidden = true;
    c.more = more;
    parts.push(more, captionOf(c));
    const actions = actionsOf(c);
    if (actions.childElementCount > 0) parts.push(actions);
    data.replaceChildren(...parts);
    measureFold(c);
}
