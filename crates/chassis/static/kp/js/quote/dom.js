// Small helpers every part of the quote shares: an element builder and a card's `data-kp-quote-*` attribute.

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag @param {string} [className] @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
export const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
};

/** One `data-kp-quote-<name>` attribute of a card, or undefined. @param {HTMLElement} el @param {string} name @returns {string | undefined} */
export const attr = (el, name) => el.getAttribute(`data-kp-quote-${name}`) ?? undefined;

/**
 * The text of a quote written in markup: its `data-kp-quote-text`, else its blockquote, else its own words.
 * @param {HTMLElement} el
 */
export function textOf(el) {
    return (el.getAttribute('data-kp-quote-text') ?? el.querySelector(':scope > blockquote')?.textContent ?? el.textContent ?? '').trim();
}
