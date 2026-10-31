// The selector, event names, filters and timings of claims.

/** The lists this module looks after. */
export const CLAIM = '[data-kp-checklist-claim]';
/** Fired on the list, bubbling and cancelable, when somebody takes an item, lets go or is assigned. */
export const CLAIM_EVENT = 'kp-claim-change';
/** Fired when the filter chip changes: `{ filter }`. */
export const CLAIM_FILTER_EVENT = 'kp-claim-filter';
/** Fired when the Retry of a failed list is pressed. */
export const CLAIM_RETRY_EVENT = 'kp-claim-retry';
/** The filters of the chip group. */
export const CLAIM_FILTERS = Object.freeze(['all', 'gaps', 'mine']);
/** How long a refused row keeps its mark [ms]. */
export const CLAIM_REFUSED_MS = 3000;
/** How long Undo is offered after a release [ms]. */
export const CLAIM_UNDO_MS = 6000;
