// The board's selector and events, the small counts it draws, and the element maker its parts share.

/** A board: `section.kp-pipeline[data-kp-pipeline]`. */
export const PIPELINE = '[data-kp-pipeline]';
/** Fired on the board, bubbling, when a card is opened: `{ id, card, source: 'pointer' | 'keyboard' }`. */
export const PIPELINE_OPEN_EVENT = 'kp-pipeline-open';
/** Fired on the board, bubbling, when Try again is pressed. */
export const PIPELINE_RETRY_EVENT = 'kp-pipeline-retry';
/** Fired on the board, bubbling, when a lane shows more or fewer: `{ lane, open }`. */
export const PIPELINE_MORE_EVENT = 'kp-pipeline-more';

/** How many placeholder cards a loading lane shows: a lane on the board, and the closed lane under it. */
export const GHOST_CARDS = 2;
export const GHOST_CARDS_CLOSED = 3;
/** The share of a lane is whole percent of this. */
export const PERCENT = 100;

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {Document} doc @param {K} tag @param {string} [className] @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
export const make = (doc, tag, className, text) => {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
};
