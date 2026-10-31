// The selector, the event, the fixed numbers and the attributes the dependency list redraws on.

/** The lists this module draws. */
export const DEPLIST = '[data-kp-deplist]';
/** Fired on the list when its Retry is pressed. */
export const DEPLIST_RETRY_EVENT = 'kp-deplist-retry';
/** How many rows show before "Show all". */
export const DEPLIST_COLLAPSE = 8;
/** The least rows the list stands as high as, for its states, when `data-kp-dep-rows` does not say. */
export const DEPLIST_MIN_ROWS = 3;
/** How many placeholder rows the loading state draws. */
export const DEPLIST_GHOST_ROWS = 3;

/** The attributes whose change redraws the list. */
export const DEPLIST_OBSERVED = [
    'data-kp-dep-order',
    'data-kp-dep-direction',
    'data-kp-dep-group',
    'data-kp-dep-arrow',
    'data-kp-dep-states',
    'data-kp-dep-collapse',
    'data-kp-dep-link',
    'data-kp-dep-self',
    'data-kp-dep-empty',
    'data-kp-dep-heading',
    'data-kp-dep-copy',
    'data-kp-dep-rows',
];
