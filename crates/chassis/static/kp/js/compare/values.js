// The selector, the events and the fixed numbers of the compare slider.

/** A compare slider. */
export const COMPARE = '[data-kp-compare]';
/** Fired on the slider when the divider moved by a person: `{ position }` (0 to 100). */
export const COMPARE_EVENT = 'kp-compare-change';
/** What makes a pane live HTML: the panes stay usable and only the handle drags. */
export const INTERACTIVE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** Fired on the slider when the Retry of a failed image is pressed: `{ pane }` ('before' or 'after'). */
export const COMPARE_RETRY_EVENT = 'kp-compare-retry';

/** The divider's ends. */
export const ALL_AFTER = 0;
export const ALL_BEFORE = 100;
/** A step of the arrow keys, with Shift, and of Page Up and Page Down. */
export const STEP = 1;
export const BIG_STEP = 10;
/** The divider starts here when the page names none. */
export const MIDDLE = 50;
/** A label steps aside while the divider is within this much of its side. */
export const LABEL_EDGE = 12;
/** One decimal of position is kept. */
export const TENTH = 10;
