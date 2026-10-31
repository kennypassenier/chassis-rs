// The names, the defaults and the fixed numbers of the hover card.

/** The attribute that makes an element an anchor; its value is the card's text when not empty. */
export const HOVERCARD_ATTRIBUTE = 'data-kp-hovercard';
/** Dispatched on the anchor, bubbling, when the card opens or closes: `{ open, card, anchor }`. */
export const HOVERCARD_EVENT = 'kp-hovercard';
/** Written on the one shared card node. */
export const HOVERCARD_CARD = 'data-kp-hovercard-card';
/** The distance from the window's edge the card keeps, in px. */
export const EDGE = 8;
/** How long the pointer rests on an anchor before the card opens, in ms. */
export const OPEN_DELAY_MS = 300;
/** How long the pointer is away before the card closes, in ms. */
export const CLOSE_DELAY_MS = 100;
/** A tap that comes this soon after the card opened is the tap focus already answered, in ms. */
export const TAP_ANSWERED_MS = 400;
/** The anchors whose own tap is theirs: a link, a button, a field. */
export const CONTROL_SELECTOR = 'a[href], button, input, select, textarea, summary, [role="button"], [role="link"]';
/** The radix and the length of the random part of a card's id. */
export const ID_RADIX = 36;
export const ID_RANDOM_START = 2;
export const ID_RANDOM_END = 8;
