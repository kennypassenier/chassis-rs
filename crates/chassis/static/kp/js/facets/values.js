// The facet group's selector and its event.

/** The groups this module looks after. */
export const FACETS = '[data-kp-facets]';
/** Fired on the group, bubbling, when the choice changed: `{ group, values, source: 'toggle' | 'only' | 'all' | 'set', value }`. */
export const FACET_EVENT = 'kp-facet-change';
