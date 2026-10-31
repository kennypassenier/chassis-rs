// The selector, the events and the fixed numbers of the new-lines pill.

/** The scrollers this module looks after. */
export const FOLLOW = '[data-kp-follow]';
/** Fired on the scroller when following starts or stops, or the count changes: `{ following, paused, unseen }`. */
export const FOLLOW_EVENT = 'kp-follow-change';
/** Fired on the scroller when the pill is pressed: `{ unseen }`. */
export const NEWPILL_JUMP_EVENT = 'kp-newpill-jump';
/** px from the end that still count as following. */
export const FOLLOW_THRESHOLD = 24;
/** How often a screen reader hears the count [ms]. */
export const NEWPILL_SAY_MS = 10000;
/** The longest the pill's leaving animation may take before it is taken out anyway [ms]. */
export const LEAVE_FALLBACK_MS = 700;
/** The columns the "new since" divider of a table spans: more than any table has. */
export const DIVIDER_COLSPAN = 99;
