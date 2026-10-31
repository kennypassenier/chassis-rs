// The selector, the events and the fixed numbers of the share bar.

/** A share bar the page fills with setStackbar(). */
export const STACKBAR = '[data-kp-stackbar]';
/** Fired on the root when a part or its legend row is pressed: `{ key, part }`. */
export const STACKBAR_PICK_EVENT = 'kp-stackbar-pick';
/** Fired on the root when the Retry of a failed share bar is pressed. */
export const STACKBAR_RETRY_EVENT = 'kp-stackbar-retry';

/** How many placeholder legend rows the loading state draws before a ready draw has said how many there are. */
export const DEFAULT_LEGEND_ROWS = 2;
/** How many chart colours the palette has; the part after the last one takes the palette again, hatched. */
export const PALETTE_SIZE = 5;
/** The key of the merged "Other" part. */
export const OTHER_KEY = '\u0000other';
/** Under this share of the whole (in per cent) a share is written with one decimal. */
export const DECIMAL_BELOW_PERCENT = 10;
