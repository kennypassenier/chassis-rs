// The tour card: its title, text, count and three buttons, and the one shape the card keeps through every step.

/** @typedef {import('../strings.js').Strings} Strings */

let idSeq = 0;
/** @param {string} prefix */
const nextId = (prefix) => `${prefix}-${(idSeq += 1)}`;

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {Document} doc
 * @param {K} tag
 * @param {string} className
 * @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
export const make = (doc, tag, className, text) => {
    const el = doc.createElement(tag);
    el.className = className;
    if (text != null) el.textContent = text;
    return el;
};

/**
 * The card and its parts, not yet on the page.
 * @param {Document} doc @param {Strings} strings
 */
export function buildCard(doc, strings) {
    const card = /** @type {HTMLDialogElement} */ (make(doc, 'dialog', 'kp-tour'));
    // The words change on every step; that is no arrival of new content to play the theme's way.
    card.dataset.kpArrive = 'none';
    const title = make(doc, 'h3', 'kp-tour__title');
    title.id = nextId('kp-tour-title');
    const text = make(doc, 'p', 'kp-tour__text');
    text.id = nextId('kp-tour-text');
    card.setAttribute('aria-labelledby', title.id);
    card.setAttribute('aria-describedby', text.id);
    const foot = make(doc, 'footer', 'kp-tour__foot');
    const count = make(doc, 'span', 'kp-tour__count');
    const buttons = make(doc, 'span', 'kp-tour__buttons');
    const back = make(doc, 'button', 'kp-button kp-button--sm', strings.tourBack);
    back.type = 'button';
    back.title = strings.tourBackTitle;
    const skip = make(doc, 'button', 'kp-button kp-button--sm kp-button--ghost', strings.tourSkip);
    skip.type = 'button';
    skip.title = strings.tourSkipTitle;
    const next = make(doc, 'button', 'kp-button kp-button--sm kp-button--primary', strings.tourNext);
    next.type = 'button';
    buttons.append(back, skip, next);
    foot.append(count, buttons);
    card.append(title, text, foot);
    return { card, title, text, count, back, skip, next };
}

/**
 * The card keeps one shape for the whole tour: its height is the tallest step's, measured once
 * as the tour opens, so going to the next step moves the card and swaps its words without the
 * box changing size (Kenny, 2026-10-12, round 5: "de box moet gewoon zijn vorm behouden").
 * @param {HTMLDialogElement} card
 * @param {{ title: string, text: string }[]} steps
 * @param {HTMLElement} title
 * @param {HTMLElement} text
 */
export function fixShape(card, steps, title, text) {
    const was = [title.textContent, text.textContent];
    card.style.removeProperty('min-block-size');
    let tallest = 0;
    for (const step of steps) {
        title.textContent = step.title;
        text.textContent = step.text;
        tallest = Math.max(tallest, card.getBoundingClientRect().height);
    }
    [title.textContent, text.textContent] = was;
    if (tallest > 0) card.style.minBlockSize = `${Math.ceil(tallest)}px`;
}
