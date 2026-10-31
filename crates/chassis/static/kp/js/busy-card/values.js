// The class of every busy card, and the room a card gives its panel.

/** Every busy card, whatever component laid it. */
export const BUSY_CARD = '.kp-datatable__busy-card';

/** The room the card keeps for a panel taller than the area, over the panel's own height, in px. */
export const PANEL_HEIGHT_ROOM = 8;
/** The room for a panel wider than the area: the panel keeps a gutter of 0.5rem a side in a narrow container, and its grid track is the panel and that gutter. */
export const PANEL_WIDTH_ROOM = 17;
/** The card covers at least this much more than half of what is seen, so it is a card and not a strip beside the labels, in px. */
export const HALF_SEEN_SLACK = 1;

/** @param {number} v */
export const px = (v) => `${Math.round(v)}px`;
